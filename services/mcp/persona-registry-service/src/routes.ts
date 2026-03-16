import { mkdir } from 'node:fs/promises';
import { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendJson } from '@soulism/shared/http.js';
import { buildPolicyAccessDenied } from '@soulism/shared/policy-access.js';
import { emitAuditEvent } from '@soulism/shared/audit.js';
import { composePersona } from '@soulism/persona-core/compose.js';
import { PersonaRegistry } from '@soulism/persona-core/registry.js';
import { validatePersonaPack, type PersonaPack } from '@soulism/persona-schema';
import { enforcePersonaPackSignature, resolveSignaturePolicyMode } from '@soulism/persona-signing/policy.js';
import { createReadinessReport, probeTaskDependency } from '@soulism/shared/readiness.js';
import { ServiceMetricsCollector, observeHttpRequest } from '@soulism/shared/telemetry.js';
import { readConfig } from './common/config.js';
import { canMutate } from './guards.js';
import type { ServicePolicyDecision } from '@soulism/persona-policy/guards.js';

const config = readConfig();
const registry = new PersonaRegistry();
const telemetry = new ServiceMetricsCollector('persona-registry');
let registryBooted = false;
let registryBootError: string | null = null;

type SignatureMode = 'dev' | 'strict' | 'enforced';
type RiskClass = 'low' | 'medium' | 'high' | 'critical';

const isRiskClass = (value: string): value is RiskClass => value === 'low' || value === 'medium' || value === 'high' || value === 'critical';

const signatureMode = (): SignatureMode =>
  resolveSignaturePolicyMode(config.signaturePolicyMode, config.productionMode, config.strictSigning);

const enforceSignedPack = (pack: PersonaPack, signature?: string, publicKey?: string) => {
  return enforcePersonaPackSignature(
    pack,
    {
      signatureMode: signatureMode(),
      signature,
      publicKey
    },
    {
      productionMode: config.productionMode,
      strictSigning: config.strictSigning
    }
  );
};

const ensureRegistryReady = async (): Promise<void> => {
  if (registryBooted) return;

  try {
    await mkdir(config.packsDir, { recursive: true });
    await registry.registerFromDirectory(config.packsDir, {
      onPack: (entry) => {
        const decision = enforceSignedPack(entry.pack, entry.pack.signature?.value, entry.pack.signature?.publicKey);
        if (decision.ok) {
          return entry;
        }
        if (config.productionMode) {
          throw new Error(`pack_${entry.pack.id}_signature_rejected_${decision.reasonCode}`);
        }
        return entry;
      }
    });
    registryBooted = true;
    registryBootError = null;
  } catch (error) {
    registryBootError = String(error);
    throw error;
  }
};

export async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || 'GET';
  const path = req.url || '/';
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const traceId = headers['x-trace-id']?.toString() ?? headers['x-request-id']?.toString() ?? `trace-${Date.now()}`;
  observeHttpRequest(telemetry, res, { method, route: path.split('?')[0] || '/', traceId });
  const userId = headers['x-user-id']?.toString() ?? 'system';
  const tenantId = headers['x-tenant-id']?.toString() ?? 'default';
  const personaId = headers['x-persona-id']?.toString() ?? 'default';
  const riskClassHeader = headers['x-risk-class']?.toString() ?? 'low';
  const riskClass: RiskClass = isRiskClass(riskClassHeader) ? riskClassHeader : 'low';
  const confirmed = headers['x-policy-confirmed']?.toString() === 'true';
  const traceHeaders = {
    'x-trace-id': traceId,
    'x-request-id': traceId
  };
  const emitAudit = (action: string, resource: string, outcome: string, metadata: Record<string, unknown> = {}) => {
    emitAuditEvent(config.auditService, {
      service: 'persona-registry',
      action,
      principal: userId,
      traceId,
      riskClass,
      personaId,
      resource,
      metadata: {
        outcome,
        ...metadata
      }
    }).catch(() => {});
  };
  const sendPolicyDeny = (decision: ServicePolicyDecision, action: string, resource: string) => {
    const payload = buildPolicyAccessDenied({
      ...decision,
      personaId,
      tool: action,
      riskClass
    });
    emitAudit('policy_deny', action, payload.state === 'confirm' ? 'confirm_required' : 'deny', {
      reasonCode: payload.reasonCode
    });
    sendJson(res, 403, payload, { headers: traceHeaders });
  };

  res.setHeader('x-trace-id', traceId);
  res.setHeader('x-request-id', traceId);

  if (method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true, service: 'persona-registry' }, { headers: traceHeaders });
    return;
  }

  if (method === 'GET' && path === '/metrics') {
    sendJson(res, 200, telemetry.snapshot(), { headers: traceHeaders });
    return;
  }

  if (method === 'GET' && path === '/ready') {
    const startedAt = Date.now();
    const checks = [
      await probeTaskDependency(
        'persona-packs',
        async () => {
          await ensureRegistryReady();
        },
        { target: config.packsDir }
      )
    ];
    if (!checks[0]?.ok && registryBootError) {
      checks[0].error = registryBootError;
    }
    const report = createReadinessReport('persona-registry', checks, startedAt);
    sendJson(res, report.ready ? 200 : 503, report, { headers: traceHeaders });
    return;
  }

  try {
    await ensureRegistryReady();
  } catch (error) {
    sendJson(
      res,
      503,
      {
        ok: false,
        error: 'registry_boot_failed',
        reason: registryBootError || String(error)
      },
      { headers: traceHeaders }
    );
    return;
  }

  if (method === 'GET' && path === '/personas') {
    sendJson(res, 200, { personas: registry.list() }, { headers: traceHeaders });
    return;
  }

  if (method === 'GET' && path.startsWith('/personas/')) {
    const routePath = path.slice('/personas/'.length);
    const [id, action] = routePath.split('/');
    if (action === 'effective') {
      try {
        const effective = await composePersona(registry, id);
        return sendJson(
          res,
          200,
          {
            id,
            packId: effective.packId,
            riskClass: effective.riskClass,
            hash: effective.hash,
            manifest: effective.manifest
          },
          { headers: traceHeaders }
        );
      } catch {
        sendJson(res, 404, { error: 'not_found' }, { headers: traceHeaders });
        return;
      }
    }

    const persona = registry.get(id);
    return sendJson(
      res,
      persona ? 200 : 404,
      persona ? persona : { error: 'not_found' },
      { headers: traceHeaders }
    );
  }

  if (method === 'POST' && path === '/personas/verify') {
    let body: { id?: string; pack?: unknown; signature?: string; publicKey?: string } | null = null;
    try {
      body = (await readJsonBody(req)) as {
        id?: string;
        pack?: unknown;
        signature?: string;
        publicKey?: string;
      };
    } catch (error) {
      emitAudit('verify', 'persona-registry', 'invalid_body', { error: String(error) });
      sendJson(res, 400, { error: 'invalid_body' }, { headers: traceHeaders });
      return;
    }

    let pack: PersonaPack | null = null;

    if (body.pack) {
      try {
        pack = validatePersonaPack(body.pack);
      } catch (error) {
        emitAudit('verify', body.id ?? 'unknown', 'invalid_pack', { error: String(error) });
        sendJson(res, 400, { error: 'invalid_body' }, { headers: traceHeaders });
        return;
      }
    } else if (body.id) {
      const existing = registry.get(String(body.id));
      if (existing) pack = existing.pack;
    }

    if (!pack) {
      emitAudit('verify', body.id ?? 'unknown', 'invalid_body');
      sendJson(res, 400, { error: 'invalid_body' }, { headers: traceHeaders });
      return;
    }

    const decision = enforceSignedPack(pack, body.signature, body.publicKey);
    if (!decision.ok) {
      emitAudit('verify', pack.id, 'deny', {
        mode: decision.mode,
        reasonCode: decision.reasonCode
      });
      sendJson(
        res,
        403,
        {
          ok: false,
          id: pack.id,
          mode: decision.mode,
          reasonCode: decision.reasonCode,
          reason: decision.reason || 'signature_rejected',
          signaturePresent: decision.signaturePresent,
          publicKeyPresent: decision.publicKeyPresent
        },
        { headers: traceHeaders }
      );
      return;
    }

    emitAudit('verify', pack.id, 'allow', { mode: decision.mode });
    sendJson(
      res,
      200,
      {
        ok: true,
        id: pack.id,
        mode: decision.mode,
        reasonCode: decision.reasonCode,
        reason: decision.reason || 'ok'
      },
      { headers: traceHeaders }
    );
    return;
  }

  if (method === 'POST' && path === '/personas') {
    if (config.productionMode && signatureMode() === 'dev') {
      emitAudit('upsert', 'persona-registry', 'deny', {
        reason: 'production_read_only',
        mode: signatureMode()
      });
      sendJson(res, 403, { error: 'production_read_only' }, { headers: traceHeaders });
      return;
    }

    const policyDecision = await canMutate(config.policyService, {
      personaId,
      userId,
      tenantId,
      tool: 'persona:registry',
      action: 'upsert',
      riskClass,
      traceId
    });

    if (!(policyDecision.state === 'allow' || (policyDecision.state === 'confirm' && confirmed))) {
      sendPolicyDeny(policyDecision, 'persona:registry', 'upsert');
      return;
    }

    let body: { id?: string; pack?: unknown; signature?: string; publicKey?: string } | null = null;
    try {
      body = (await readJsonBody(req)) as { id?: string; pack?: unknown; signature?: string; publicKey?: string };
    } catch (error) {
      emitAudit('upsert', 'persona-registry', 'invalid_body', { error: String(error) });
      sendJson(res, 400, { error: 'invalid_pack' }, { headers: traceHeaders });
      return;
    }
    if (!body?.id || !body?.pack) {
      emitAudit('upsert', 'persona-registry', 'invalid_pack');
      sendJson(res, 400, { error: 'invalid_pack' }, { headers: traceHeaders });
      return;
    }

    let pack: PersonaPack;
    try {
      pack = validatePersonaPack(body.pack);
    } catch (error) {
      emitAudit('upsert', body.id, 'invalid_pack', { error: String(error) });
      sendJson(res, 400, { error: 'invalid_pack' }, { headers: traceHeaders });
      return;
    }

    const signature = body.signature;
    const publicKey = body.publicKey;
    const decision = enforceSignedPack(pack, signature, publicKey);
    if (!decision.ok) {
      emitAudit('upsert', pack.id, 'deny', {
        mode: decision.mode,
        reasonCode: decision.reasonCode
      });
      sendJson(
        res,
        403,
        {
          ok: false,
          error: decision.reason,
          reasonCode: decision.reasonCode,
          reason: decision.reason,
          mode: decision.mode,
          signaturePresent: decision.signaturePresent,
          publicKeyPresent: decision.publicKeyPresent
        },
        { headers: traceHeaders }
      );
      return;
    }

    registry.register({
      pack,
      source: `runtime://${userId || 'system'}:${Date.now()}`
    });
    emitAudit('upsert', body.id, 'success', {
      mode: decision.mode,
      reasonCode: decision.reasonCode
    });
    sendJson(
      res,
      200,
      { ok: true, installed: body.id, mode: decision.mode, reasonCode: decision.reasonCode },
      { headers: traceHeaders }
    );
    return;
  }

  sendJson(res, 404, { error: 'not_found' }, { headers: traceHeaders });
}
