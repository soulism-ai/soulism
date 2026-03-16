import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readDocument } from '../../tools/contracts/lib/contract-validation.ts';
import { verifyPayload } from '../../packages/shared/src/crypto.js';

type ChannelDescriptor = {
  name?: unknown;
  description?: unknown;
  publisher?: unknown;
  version?: unknown;
  compatibility?: {
    runtime?: unknown;
    schemaVersion?: unknown;
  };
  provenance?: {
    publisher?: unknown;
    digest?: unknown;
    signature?: unknown;
    createdAt?: unknown;
  };
  assets?: {
    icon?: unknown;
    banner?: unknown;
    screenshots?: unknown;
  };
  endpoints?: {
    api?: unknown;
    oauth?: unknown;
    chat?: unknown;
    events?: unknown;
    space?: unknown;
    health?: unknown;
  };
  api?: {
    baseUrl?: unknown;
    auth?: unknown;
  };
  security?: unknown;
};

type ChannelConfig = {
  descriptorPath: string;
  signaturePath: string;
  channel: 'openai' | 'claude' | 'copilot-studio' | 'hf-space';
  requiredRuntimes: readonly string[];
  requireVersion?: boolean;
  requireBanner?: boolean;
  minScreenshots: number;
};

const channels: ChannelConfig[] = [
  {
    descriptorPath: 'marketplace/openai/app.json',
    signaturePath: 'marketplace/openai/signature.json',
    channel: 'openai',
    requiredRuntimes: ['chatgpt-apps', 'openai-app-runtime-http'],
    minScreenshots: 2,
  },
  {
    descriptorPath: 'marketplace/claude/marketplace.json',
    signaturePath: 'marketplace/claude/signature.json',
    channel: 'claude',
    requiredRuntimes: ['claude-desktop-mcp', 'claude-marketplace-http'],
    minScreenshots: 1,
  },
  {
    descriptorPath: 'marketplace/copilot-studio/manifest.yaml',
    signaturePath: 'marketplace/copilot-studio/signature.json',
    channel: 'copilot-studio',
    requiredRuntimes: ['copilot-studio-http', 'copilot-m365-plugin'],
    minScreenshots: 1,
    requireBanner: true,
  },
  {
    descriptorPath: 'marketplace/hf/manifest.json',
    signaturePath: 'marketplace/hf/signature.json',
    channel: 'hf-space',
    requiredRuntimes: ['hf-space-http'],
    requireBanner: true,
    minScreenshots: 2,
    requireVersion: true,
  }
];

const digestOf = (content: string): string => `sha256:${createHash('sha256').update(content).digest('hex')}`;
const isSemVer = (value: string): boolean => /^\d+\.\d+\.\d+$/.test(value);
const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const ensureUrl = (value: string): void => {
  expect(() => new URL(value)).not.toThrow();
  expect(value.startsWith('http://') || value.startsWith('https://')).toBe(true);
};

const assertDescriptorShape = (descriptor: ChannelDescriptor, channel: ChannelConfig): void => {
  expect(isString(descriptor.name)).toBe(true);
  expect(isString(descriptor.description)).toBe(true);
  expect(isString(descriptor.publisher)).toBe(true);
  if (channel.requireVersion) {
    expect(isString(descriptor.version)).toBe(true);
    expect(isSemVer(String(descriptor.version))).toBe(true);
  }
  expect(isObject(descriptor.compatibility)).toBe(true);
  expect(isString(descriptor.compatibility?.runtime)).toBe(true);
  expect(isString(descriptor.compatibility?.schemaVersion)).toBe(true);
  expect(isSemVer(String(descriptor.compatibility?.schemaVersion))).toBe(true);

  expect(isObject(descriptor.provenance)).toBe(true);
  const provenance = descriptor.provenance as Record<string, unknown>;
  expect(isString(provenance.publisher)).toBe(true);
  expect(isString(provenance.digest)).toBe(true);
  expect(isString(provenance.signature)).toBe(true);
  expect(isString(provenance.createdAt)).toBe(true);
  expect(() => new Date(provenance.createdAt as string).toISOString()).not.toThrow();

  expect(isObject(descriptor.assets)).toBe(true);
  const assets = descriptor.assets as Record<string, unknown>;
  expect(isString(assets.icon)).toBe(true);
  if (channel.requireBanner ?? true) {
    expect(isString(assets.banner)).toBe(true);
  }
  expect(Array.isArray(assets.screenshots)).toBe(true);
};

const assertChannelEndpoints = (descriptor: ChannelDescriptor, channel: ChannelConfig): void => {
  if (channel.channel === 'openai') {
    expect(isObject(descriptor.endpoints)).toBe(true);
    const endpoints = descriptor.endpoints as Record<string, unknown>;
    expect(isString(endpoints.api)).toBe(true);
    expect(isString(endpoints.oauth)).toBe(true);
    ensureUrl(endpoints.api as string);
    ensureUrl(endpoints.oauth as string);
    return;
  }

  if (channel.channel === 'claude') {
    expect(isObject(descriptor.api)).toBe(true);
    const api = descriptor.api as Record<string, unknown>;
    expect(isString(api.baseUrl)).toBe(true);
    expect(isString(api.auth)).toBe(true);
    ensureUrl(api.baseUrl as string);
    return;
  }

  if (channel.channel === 'copilot-studio') {
    expect(isObject(descriptor.endpoints)).toBe(true);
    const endpoints = descriptor.endpoints as Record<string, unknown>;
    expect(isString(endpoints.chat)).toBe(true);
    expect(isString(endpoints.events)).toBe(true);
    ensureUrl(endpoints.chat as string);
    ensureUrl(endpoints.events as string);
  }

  if (channel.channel === 'hf-space') {
    expect(isObject(descriptor.endpoints)).toBe(true);
    const endpoints = descriptor.endpoints as Record<string, unknown>;
    expect(isString(endpoints.space)).toBe(true);
    expect(isString(endpoints.api)).toBe(true);
    expect(endpoints.health === undefined || isString(endpoints.health)).toBe(true);
    ensureUrl(endpoints.space as string);
    ensureUrl(endpoints.api as string);
  }
};

const assertAssetFiles = async (descriptorPath: string, descriptor: ChannelDescriptor, channel: ChannelConfig): Promise<void> => {
  if (!isObject(descriptor.assets)) return;
  const assets = descriptor.assets as Record<string, unknown>;
  const required = ['icon', ...(channel.requireBanner ? ['banner'] : [])];
  for (const field of required) {
    expect(isString(assets[field])).toBe(true);
    const relPath = String(assets[field]);
    const descriptorDir = dirname(descriptorPath);
    const bytes = await readFile(join(process.cwd(), descriptorDir, relPath));
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 8).equals(pngMagic)).toBe(true);
  }

  expect(Array.isArray(assets.screenshots)).toBe(true);
  const screenshots = Array.isArray(assets.screenshots) ? assets.screenshots.filter(isString) : [];
  expect(screenshots.length).toBeGreaterThanOrEqual(channel.minScreenshots);
  for (const screenshot of screenshots) {
    const descriptorDir = dirname(descriptorPath);
    const bytes = await readFile(join(process.cwd(), descriptorDir, screenshot));
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 8).equals(pngMagic)).toBe(true);
  }
};

const assertSignatureEnvelope = async (channel: ChannelConfig, descriptorRaw: string): Promise<void> => {
  const signatureRaw = await readFile(channel.signaturePath, 'utf8');
  const signature = JSON.parse(signatureRaw) as {
    channel?: unknown;
    descriptor?: unknown;
    keyId?: unknown;
    publisher?: unknown;
    digest?: unknown;
    signature?: unknown;
    publicKey?: unknown;
    compatibility?: { runtimes?: unknown[] };
  };

  expect(signature.channel).toBe(channel.channel);
  expect(signature.descriptor).toBe(channel.descriptorPath);
  expect(signature.digest).toBe(digestOf(descriptorRaw));
  expect(isString(signature.keyId)).toBe(true);
  expect(isString(signature.signature)).toBe(true);
  expect(isString(signature.publicKey)).toBe(true);
  expect(isString(signature.publisher)).toBe(true);
  expect(isObject(signature.compatibility)).toBe(true);
  const compatibility = signature.compatibility as Record<string, unknown>;
  expect(Array.isArray(compatibility.runtimes)).toBe(true);
  expect(compatibility.runtimes).toEqual(expect.arrayContaining(channel.requiredRuntimes as unknown[]));
  expect(verifyPayload(digestOf(descriptorRaw), signature.signature as string, signature.publicKey as string)).toBe(true);
};

describe('smoke: marketplace distribution artifact consistency', () => {
  it('verifies descriptor/signature parity and contract expectations', async () => {
    for (const channel of channels) {
      const descriptorRaw = await readFile(channel.descriptorPath, 'utf8');
      const parsed = await readDocument(channel.descriptorPath);
      const parsedDescriptor = parsed.data;
      expect(isObject(parsedDescriptor)).toBe(true);

      const descriptor = parsedDescriptor as ChannelDescriptor;
      assertDescriptorShape(descriptor, channel);
      assertChannelEndpoints(descriptor, channel);
      await assertAssetFiles(channel.descriptorPath, descriptor, channel);
      await assertSignatureEnvelope(channel, descriptorRaw);
    }
  });
});
