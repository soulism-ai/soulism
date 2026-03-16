import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PersonaRegistry } from '../src/registry.js';
import { composePersona } from '../src/compose.js';

describe('persona-core compose', () => {
  it('produces deterministic effective hash for same inputs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'persona-compose-'));
    try {
      await writeFile(
        join(dir, 'persona.json'),
        JSON.stringify({
          id: 'persona-hash',
          version: '1.0.0',
          schemaVersion: '1.0.0',
          persona: {
            id: 'persona-hash',
            name: 'Persona Hash',
            description: 'hash',
            extends: [],
            systemPrompt: 'system',
            userPromptTemplate: 'user',
            traits: [],
            allowedTools: ['persona:registry'],
            deniedTools: [],
            style: { tone: 'direct', constraints: [], examples: [] },
            riskClass: 'low',
            metadata: {}
          },
          provenance: { source: 'test', createdAt: Date.now() }
        })
      );

      const registry = new PersonaRegistry();
      await registry.registerFromDirectory(dir);

      const a = await composePersona(registry, 'persona-hash');
      const b = await composePersona(registry, 'persona-hash');

      expect(a.hash).toBe(b.hash);
      expect(a.manifest.id).toBe('persona-hash');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
