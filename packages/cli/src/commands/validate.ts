import { readFileSync } from 'node:fs';
import { validatePersonaPack } from '@soulism/persona-schema/validate.js';

export const runValidate = async (filePath: string | undefined): Promise<void> => {
  if (!filePath) throw new Error('Usage: validate <file>');
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  validatePersonaPack(data);
  console.log('valid');
};
