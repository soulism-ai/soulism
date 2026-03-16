import { PersonaManifest } from '@soulism/persona-schema/types.js';

const mergeArrays = (base: string[] = [], child: string[] = []) => {
  const set = new Map<string, string>();
  [...base, ...child].forEach((item) => {
    set.set(item, item);
  });
  return [...set.values()];
};

const mergeStyle = (base: PersonaManifest['style'], child: PersonaManifest['style']) => ({
  tone: child.tone ?? base.tone,
  constraints: mergeArrays(base.constraints, child.constraints),
  examples: mergeArrays(base.examples, child.examples)
});

export const mergePersonaManifests = (base: PersonaManifest, overlay: PersonaManifest): PersonaManifest => ({
  ...base,
  ...overlay,
  id: overlay.id || base.id,
  traits: mergeArrays(base.traits, overlay.traits),
  allowedTools: mergeArrays(base.allowedTools, overlay.allowedTools),
  deniedTools: mergeArrays(base.deniedTools, overlay.deniedTools),
  style: mergeStyle(base.style, overlay.style),
  metadata: {
    ...base.metadata,
    ...overlay.metadata
  }
});
