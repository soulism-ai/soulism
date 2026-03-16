import { readFileSync } from 'node:fs';

export const runShow = async (filePath: string | undefined): Promise<void> => {
  if (!filePath) throw new Error('Usage: show <file>');
  console.log(readFileSync(filePath, 'utf8'));
};
