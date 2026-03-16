import { readdirSync } from 'node:fs';

export const runList = async (): Promise<void> => {
  const entries = readdirSync(process.cwd(), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      console.log(entry.name);
    }
  }
};
