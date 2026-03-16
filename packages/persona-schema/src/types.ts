import { z } from 'zod';

export type RiskClass = 'low' | 'medium' | 'high' | 'critical';

export const PersonaStyle = z.object({
  tone: z.string().optional(),
  constraints: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([])
});

export type PersonaStyle = z.infer<typeof PersonaStyle>;

export const PersonaManifestSchema = z.object({
  id: z.string().min(3),
  name: z.string().min(1),
  displayName: z.string().optional(),
  description: z.string().default(''),
  version: z.string().default('1.0.0'),
  extends: z.array(z.string()).default([]),
  systemPrompt: z.string().default(''),
  userPromptTemplate: z.string().default(''),
  traits: z.array(z.string()).default([]),
  allowedTools: z.array(z.string()).default([]),
  deniedTools: z.array(z.string()).default([]),
  style: PersonaStyle.default({}),
  riskClass: z.enum(['low', 'medium', 'high', 'critical']).default('low'),
  metadata: z.record(z.unknown()).default({})
});

export type PersonaManifest = z.infer<typeof PersonaManifestSchema>;

export const PersonaPackSchema = z.object({
  id: z.string().min(3),
  version: z.string().default('1.0.0'),
  schemaVersion: z.literal('1.0.0'),
  persona: PersonaManifestSchema,
  signature: z
    .object({
      algorithm: z.string().default('ed25519'),
      mode: z.enum(['dev', 'strict', 'enforced']).default('dev'),
      signer: z.string().optional(),
      createdAt: z.number().default(() => Date.now()),
      value: z.string().optional(),
      publicKey: z.string().optional()
    })
    .partial()
    .optional(),
  parentPack: z.string().optional(),
  provenance: z
    .object({
      source: z.string().default('local'),
      createdAt: z.number().default(() => Date.now())
    })
    .default({ source: 'local', createdAt: Date.now() })
});

export type PersonaPack = z.infer<typeof PersonaPackSchema>;
export type PersonaPackInput = z.input<typeof PersonaPackSchema>;

export interface PersonaPackSource {
  source: string;
  pack: PersonaPack;
}
