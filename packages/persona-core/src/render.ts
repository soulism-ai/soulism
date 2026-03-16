import { PersonaManifest, PersonaPack } from '@soulism/persona-schema/types.js';
import { stableStringify } from '@soulism/shared/json.js';

export interface RenderInput {
  persona: PersonaManifest;
  pack: PersonaPack;
  context?: Record<string, string | number | boolean>;
}

export const renderPersonaPrompt = (input: RenderInput): string => {
  const variables = {
    personaName: input.persona.name,
    personaId: input.persona.id,
    riskClass: input.persona.riskClass,
    ...(input.context || {})
  } as Record<string, unknown>;

  let prompt = [input.persona.systemPrompt, input.persona.userPromptTemplate].filter(Boolean).join('\n\n');
  Object.entries(variables).forEach(([key, value]) => {
    prompt = prompt.replace(new RegExp(`{{\s*${key}\s*}}`, 'g'), String(value));
  });

  return `${prompt}\n\n<!-- pack=${input.pack.id} schema=${input.pack.schemaVersion} version=${input.pack.version} hash=${stableStringify(input.pack)} -->`;
};
