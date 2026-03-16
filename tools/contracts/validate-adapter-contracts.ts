import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type AdapterStatus = 'active' | 'planned';

type TransportProtocol = 'http' | 'stdio';
type TransportAuth = 'none' | 'api-key' | 'oauth2' | 'mcp-session';

type AdapterDescriptor = {
  id: string;
  status: AdapterStatus;
  runtime: string;
  integrationBoundary: string;
  artifacts: string[];
  channels: string[];
  contract?: {
    schemaVersion: string;
    transport: {
      protocol: TransportProtocol;
      auth: TransportAuth;
      requestEnvelope: string;
      responseEnvelope: string;
      traceHeader: string;
    };
    policyEnforcement: boolean;
    auditEmission: boolean;
    riskClasses: Array<'low' | 'medium' | 'high' | 'critical'>;
    capabilities: string[];
    compatibility: {
      minCliVersion: string;
      minSdkVersion: string;
      mcpSchemaVersion: string;
    };
  };
};

type AdapterMatrix = {
  schemaVersion: string;
  targets: Array<{
    id: string;
    status: AdapterStatus;
    descriptor: string;
  }>;
};

type AdapterSchema = {
  $id?: string;
  required?: string[];
};

const root = process.cwd();
const failures: string[] = [];
const allowedStatus = new Set<AdapterStatus>(['active', 'planned']);
const allowedProtocols = new Set<TransportProtocol>(['http', 'stdio']);
const allowedAuth = new Set<TransportAuth>(['none', 'api-key', 'oauth2', 'mcp-session']);
const allowedRiskClass = new Set(['low', 'medium', 'high', 'critical']);
const expectedContractVersion = '1.0.0';
const runtimeSurfaceByAdapter: Record<string, string> = {
  'nextjs-adapter': 'examples/nextjs/runtime-surface.ts',
  'expo-adapter': 'examples/expo/runtime-surface.ts',
  'hf-space': 'examples/hf/runtime-surface.ts'
};

const readJson = async <T>(path: string): Promise<T> => {
  const data = await readFile(path, 'utf8');
  return JSON.parse(data) as T;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const validateDescriptor = async (
  descriptorPath: string,
  descriptor: AdapterDescriptor,
  expected: { id: string; status: AdapterStatus },
  matrixSchemaVersion: string
) => {
  if (descriptor.id !== expected.id) failures.push(`${descriptorPath}: id_mismatch`);
  if (descriptor.status !== expected.status) failures.push(`${descriptorPath}: status_mismatch`);
  if (!allowedStatus.has(descriptor.status)) failures.push(`${descriptorPath}: invalid_status`);
  if (!isNonEmptyString(descriptor.runtime)) failures.push(`${descriptorPath}: missing_runtime`);
  if (!isNonEmptyString(descriptor.integrationBoundary)) failures.push(`${descriptorPath}: missing_integrationBoundary`);

  if (!Array.isArray(descriptor.channels) || descriptor.channels.length === 0) {
    failures.push(`${descriptorPath}: missing_channels`);
  }

  if (!Array.isArray(descriptor.artifacts) || descriptor.artifacts.length === 0) {
    failures.push(`${descriptorPath}: missing_artifacts`);
  } else {
    for (const artifact of descriptor.artifacts) {
      if (!isNonEmptyString(artifact)) {
        failures.push(`${descriptorPath}: invalid_artifact_path`);
        continue;
      }
      const artifactPath = join(root, artifact);
      const data = await readFile(artifactPath).catch(() => null);
      if (!data || data.byteLength === 0) {
        failures.push(`${descriptorPath}: artifact_missing_or_empty(${artifact})`);
      }
    }
  }

  const contract = descriptor.contract;
  if (!contract) {
    failures.push(`${descriptorPath}: missing_contract`);
    return;
  }

  if (contract.schemaVersion !== expectedContractVersion) {
    failures.push(`${descriptorPath}: invalid_contract_schema_version`);
  }

  const transport = contract.transport;
  if (!transport) {
    failures.push(`${descriptorPath}: missing_transport_contract`);
  } else {
    if (!allowedProtocols.has(transport.protocol)) failures.push(`${descriptorPath}: invalid_transport_protocol`);
    if (!allowedAuth.has(transport.auth)) failures.push(`${descriptorPath}: invalid_transport_auth`);
    if (!isNonEmptyString(transport.requestEnvelope)) failures.push(`${descriptorPath}: missing_requestEnvelope`);
    if (!isNonEmptyString(transport.responseEnvelope)) failures.push(`${descriptorPath}: missing_responseEnvelope`);
    if (!isNonEmptyString(transport.traceHeader)) failures.push(`${descriptorPath}: missing_traceHeader`);
  }

  if (descriptor.runtime.includes('http') && contract.transport.protocol !== 'http') {
    failures.push(`${descriptorPath}: runtime_transport_mismatch`);
  }

  if (descriptor.id === 'web-control-plane' && contract.transport.auth !== 'oauth2') {
    failures.push(`${descriptorPath}: web_control_plane_auth_must_be_oauth2`);
  }
  if (descriptor.id in runtimeSurfaceByAdapter && !descriptor.artifacts.includes(runtimeSurfaceByAdapter[descriptor.id])) {
    failures.push(
      `${descriptorPath}: missing_runtime_surface_artifact(${descriptor.id}):${runtimeSurfaceByAdapter[descriptor.id]}`
    );
  }

  if (descriptor.status === 'active') {
    if (!contract.policyEnforcement) failures.push(`${descriptorPath}: active_adapter_requires_policy_enforcement`);
    if (!contract.auditEmission) failures.push(`${descriptorPath}: active_adapter_requires_audit_emission`);
  }

  if (!Array.isArray(contract.riskClasses) || contract.riskClasses.length === 0) {
    failures.push(`${descriptorPath}: missing_risk_classes`);
  } else {
    for (const riskClass of contract.riskClasses) {
      if (!allowedRiskClass.has(riskClass)) {
        failures.push(`${descriptorPath}: invalid_risk_class(${riskClass})`);
      }
    }
  }

  if (!Array.isArray(contract.capabilities) || contract.capabilities.length === 0) {
    failures.push(`${descriptorPath}: missing_capabilities`);
  }

  if (!isNonEmptyString(contract.compatibility?.minCliVersion)) {
    failures.push(`${descriptorPath}: missing_min_cli_version`);
  }
  if (!isNonEmptyString(contract.compatibility?.minSdkVersion)) {
    failures.push(`${descriptorPath}: missing_min_sdk_version`);
  }
  if (!isNonEmptyString(contract.compatibility?.mcpSchemaVersion)) {
    failures.push(`${descriptorPath}: missing_mcp_schema_version`);
  } else if (contract.compatibility.mcpSchemaVersion !== matrixSchemaVersion) {
    failures.push(`${descriptorPath}: mcp_schema_version_mismatch`);
  }
};

const run = async () => {
  const schemaPath = join(root, 'packages/contracts/schemas/adapter.contract.schema.json');
  const schema = await readJson<AdapterSchema>(schemaPath);
  if (schema.$id !== 'https://cognitive.ai/schema/adapter.contract.schema.json') {
    failures.push(`${schemaPath}: invalid_schema_id`);
  }
  const required = schema.required || [];
  if (!required.includes('contract')) {
    failures.push(`${schemaPath}: missing_contract_requirement`);
  }

  const matrixPath = join(root, 'ci/adapters/adapter-matrix.json');
  const matrix = await readJson<AdapterMatrix>(matrixPath);
  if (!isNonEmptyString(matrix.schemaVersion)) failures.push(`${matrixPath}: missing_schemaVersion`);
  if (!Array.isArray(matrix.targets) || matrix.targets.length === 0) failures.push(`${matrixPath}: missing_targets`);

  for (const target of matrix.targets || []) {
    const descriptorPath = join(root, target.descriptor);
    let descriptor: AdapterDescriptor;
    try {
      descriptor = await readJson<AdapterDescriptor>(descriptorPath);
    } catch (error) {
      failures.push(`${target.descriptor}: invalid_json(${String(error)})`);
      continue;
    }

    await validateDescriptor(descriptorPath, descriptor, target, matrix.schemaVersion);
  }

  if (failures.length > 0) {
    console.error('Adapter contract validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Adapter contract validation passed.');
};

void run();
