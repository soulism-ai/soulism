import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { PolicyRequest } from '@soulism/persona-policy/decision.js';
import { requestPolicyDecision } from '@soulism/persona-policy/transport.js';
import { normalizeServiceDecision, withFallbackDecision, type ServicePolicyDecision } from '@soulism/persona-policy/guards.js';

const isWithinRoot = (root: string, target: string): boolean => {
  const absoluteRoot = resolve(root);
  const absoluteTarget = resolve(target);
  const delta = relative(absoluteRoot, absoluteTarget);
  return delta === '' || (!delta.startsWith(`..${sep}`) && delta !== '..' && !isAbsolute(delta));
};

export const isPathAllowed = (root: string, target: string): boolean => {
  return isWithinRoot(root, target);
};

export const isMimeAllowed = (allowedExts: string[], target: string): boolean => {
  if (allowedExts.length === 0) return true;
  const normalizedTarget = target.toLowerCase();
  return allowedExts.some((ext) => {
    const normalizedExt = ext.trim().toLowerCase();
    return normalizedExt.length > 0 && normalizedTarget.endsWith(normalizedExt);
  });
};

export const preflightPolicy = async (policyUrl: string, request: PolicyRequest): Promise<ServicePolicyDecision> => {
  try {
    const decision = await requestPolicyDecision(policyUrl, request);
    return normalizeServiceDecision(decision as Parameters<typeof normalizeServiceDecision>[0], policyUrl);
  } catch (error) {
    return withFallbackDecision(error, request.traceId);
  }
};

export const safeJoin = (root: string, relativePath: string): string => {
  const trimmed = relativePath.trim();
  const normalizedRoot = resolve(root);
  const normalizedTarget = isAbsolute(trimmed) ? resolve(trimmed) : resolve(normalizedRoot, trimmed);

  if (!isWithinRoot(normalizedRoot, normalizedTarget)) {
    return '';
  }

  return join(normalizedTarget);
};
