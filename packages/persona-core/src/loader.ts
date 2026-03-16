import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validatePersonaPack, validatePersonaManifest } from '@soulism/persona-schema/validate.js';
import { PersonaLoaderResult, PersonaManifest, PersonaPack } from './types.js';

export const loadPackFromPath = async (path: string): Promise<PersonaLoaderResult> => {
  const raw = await readFile(resolve(path), 'utf8');
  const parsed = JSON.parse(raw);
  const pack = validatePersonaPack(parsed);
  return { pack, source: path };
};

export const manifestFromPack = (pack: PersonaPack): PersonaManifest => {
  return validatePersonaManifest(pack.persona);
};
