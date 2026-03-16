import { PersonaPack, PersonaManifest, PersonaStyle, RiskClass } from '@soulism/persona-schema/types.js';

export type { PersonaManifest, PersonaPack, PersonaStyle, RiskClass } from '@soulism/persona-schema/types.js';

export interface PersonaRuntimeContext {
  tenantId: string;
  userId: string;
  requestId: string;
}

export interface PersonaRuntimePlan {
  manifest: PersonaManifest;
  packId: string;
  hash: string;
  riskClass: RiskClass;
}

export interface PersonaRenderOptions {
  persona: PersonaManifest;
  pack: PersonaPack;
  context: Record<string, unknown>;
}

export interface PersonaComposeRequest {
  rootPersonaId: string;
  personaIds?: string[];
  context?: Record<string, string | number | boolean>;
}

export interface PersonaRenderContext {
  userMessage?: string;
  userName?: string;
  tone?: string;
  [key: string]: unknown;
}

export type PersonaMerger = (base: PersonaManifest, overlay: Partial<PersonaManifest>) => PersonaManifest;

export interface PersonaLoaderResult {
  pack: PersonaPack;
  source: string;
}
