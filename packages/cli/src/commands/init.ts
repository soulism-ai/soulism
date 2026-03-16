import { writeFileSync } from 'node:fs';

export const runInit = async (): Promise<void> => {
  writeFileSync('soulism.config.json', JSON.stringify({ personaPacksDir: './packs' }, null, 2));
  console.log('initialized');
};
