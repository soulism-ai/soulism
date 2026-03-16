import { readFileSync } from 'node:fs';
import { PersonaRegistry } from '@soulism/persona-core/registry.js';
import { composePersona, composeWithContext } from '@soulism/persona-core/compose.js';

export const runCompose = async (registryDir: string, personaId: string): Promise<void> => {
  const registry = new PersonaRegistry();
  await registry.registerFromDirectory(registryDir);
  const plan = await composePersona(registry, personaId);
  const rendered = composeWithContext(plan, {});
  console.log(JSON.stringify(rendered, null, 2));
};
