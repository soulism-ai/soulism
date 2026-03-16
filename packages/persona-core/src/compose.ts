import { PersonaRegistry } from './registry.js';
import { mergePersonaManifests } from './merge.js';
import { PersonaRuntimePlan, PersonaRenderContext } from './types.js';
import { validatePersonaManifest } from '@soulism/persona-schema/validate.js';
import { sha256Hex } from '@soulism/shared/crypto.js';
import { stableStringify } from '@soulism/shared/json.js';

export const composePersona = async (
  registry: PersonaRegistry,
  rootPersonaId: string
): Promise<PersonaRuntimePlan> => {
  const root = registry.get(rootPersonaId);
  if (!root) {
    throw new Error(`Unknown persona ${rootPersonaId}`);
  }

  const extendStack = [...(root.pack.persona.extends || [])];
  let effective = root.pack.persona;

  while (extendStack.length > 0) {
    const parentId = extendStack.shift();
    if (!parentId) break;
    const parent = registry.get(parentId);
    if (parent) {
      effective = mergePersonaManifests(validatePersonaManifest(parent.pack.persona), effective);
      extendStack.unshift(...(parent.pack.persona.extends || []));
    }
  }

  const manifest = validatePersonaManifest(effective);
  return {
    manifest,
    packId: root.pack.id,
    hash: sha256Hex(stableStringify(manifest)),
    riskClass: manifest.riskClass
  };
};

export const composeWithContext = (plan: PersonaRuntimePlan, context: PersonaRenderContext): PersonaRuntimePlan => ({
  ...plan,
  manifest: {
    ...plan.manifest,
    systemPrompt: renderPersonaPrompt(plan.manifest.systemPrompt, context),
    userPromptTemplate: renderPersonaPrompt(plan.manifest.userPromptTemplate, context)
  }
});

const renderPersonaPrompt = (template: string, context: PersonaRenderContext): string => {
  let rendered = template;
  for (const [key, value] of Object.entries(context)) {
    rendered = rendered.replace(new RegExp(`{{\s*${key}\s*}}`, 'g'), String(value));
  }
  return rendered;
};
