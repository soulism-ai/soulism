import { readFileSync } from 'node:fs';
import { PersonaManifest } from '@soulism/persona-schema/types.js';
import { renderPersonaPrompt } from '@soulism/persona-core/render.js';

export const runRender = async (personaPath: string, packPath: string, contextPath?: string): Promise<void> => {
  const persona = JSON.parse(readFileSync(personaPath, 'utf8')) as PersonaManifest;
  const pack = JSON.parse(readFileSync(packPath, 'utf8'));
  const context = contextPath ? JSON.parse(readFileSync(contextPath, 'utf8')) : {};
  const output = renderPersonaPrompt({ persona, pack, context });
  console.log(output);
};
