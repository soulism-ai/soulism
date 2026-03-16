import { isIP } from 'node:net';
import type { PolicyRequest } from '@soulism/persona-policy/decision.js';
import { requestPolicyDecision } from '@soulism/persona-policy/transport.js';
import { normalizeServiceDecision, withFallbackDecision, type ServicePolicyDecision } from '@soulism/persona-policy/guards.js';

const normalizeHost = (value: string): string => value.replace(/^\[(.*)\]$/, '$1').toLowerCase().trim();

const isPrivateIpv4 = (rawAddress: string): boolean => {
  const address = normalizeHost(rawAddress);
  if (!isIP(address) || isIP(address) !== 4) return false;
  const octets = address.split('.').map((segment) => Number(segment));
  if (octets.length !== 4 || octets.some((segment) => Number.isNaN(segment) || segment < 0 || segment > 255)) {
    return false;
  }
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b === 64) return true;
  return a === 0;
};

const isPrivateIpv6 = (rawAddress: string): boolean => {
  const address = normalizeHost(rawAddress);
  if (!isIP(address) || isIP(address) !== 6) return false;
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80');
};

const isIpPrivate = (address: string): boolean => {
  const normalized = normalizeHost(address);
  if (!normalized) return true;
  if (isIP(normalized) === 0) return false;
  return isPrivateIpv4(normalized) || isPrivateIpv6(normalized);
};

export const allowlistedHost = (host: string, allow: string[]): boolean => {
  const normalizedHost = normalizeHost(host);
  return allow.some((entry) => {
    const candidate = normalizeHost(entry);
    if (!candidate) return false;
    if (candidate.startsWith('*.')) {
      const base = candidate.slice(2);
      return normalizedHost === base || normalizedHost.endsWith(`.${base}`);
    }
    return normalizedHost === candidate || normalizedHost.endsWith(`.${candidate}`);
  });
};

export const isHostAllowed = async (hostname: string, allow: string[]): Promise<boolean> => {
  if (!allowlistedHost(hostname, allow)) return false;
  return !isPrivateIp(hostname);
};

export const isPrivateIp = (hostname: string): boolean => {
  const normalized = normalizeHost(hostname);
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized === '0.0.0.0') return true;
  if (normalized.startsWith('127.')) return true;
  return isIpPrivate(normalized);
};

export const policyPrecheck = async (policyUrl: string, request: PolicyRequest): Promise<ServicePolicyDecision> => {
  try {
    const decision = await requestPolicyDecision(policyUrl, request);
    return normalizeServiceDecision(decision as Parameters<typeof normalizeServiceDecision>[0], policyUrl);
  } catch (error) {
    return withFallbackDecision(error, request.traceId);
  }
};
