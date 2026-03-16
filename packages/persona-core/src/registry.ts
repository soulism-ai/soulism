import { PersonaLoaderResult } from './types.js';
import { loadPackFromPath } from './loader.js';

export interface RegisterFromDirectoryOptions {
  onPack?: (pack: PersonaLoaderResult) => PersonaLoaderResult | null;
}

export class PersonaRegistry {
  private readonly packs = new Map<string, PersonaLoaderResult>();

  async registerFromDirectory(dir: string, options: RegisterFromDirectoryOptions = {}): Promise<number> {
    const { onPack } = options;
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(dir, { withFileTypes: true });
    let count = 0;
    for (const file of entries) {
      if (file.isFile() && file.name.endsWith('.json')) {
        const loaded = await loadPackFromPath(`${dir}/${file.name}`);
        const result = onPack ? onPack(loaded) : loaded;
        if (result) {
          this.packs.set(result.pack.id, result);
          count += 1;
        }
      }
    }
    return count;
  }

  register(pack: PersonaLoaderResult): void {
    this.packs.set(pack.pack.id, pack);
  }

  get(id: string) {
    return this.packs.get(id);
  }

  list() {
    return [...this.packs.keys()];
  }
}
