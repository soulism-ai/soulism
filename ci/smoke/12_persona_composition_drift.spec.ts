import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { composePersona, composeWithContext } from '@soulism/persona-core/compose.js';
import { loadPackFromPath } from '@soulism/persona-core/loader.js';
import { PersonaRegistry } from '@soulism/persona-core/registry.js';
import { sha256Hex } from '@soulism/shared/crypto.js';
import { stableStringify } from '@soulism/shared/json.js';
import { withTempDir, writePersonaPack } from './helpers.js';

describe('smoke: persona composition and render determinism', () => {
  it('keeps inherited personas deterministic across repeated compose/render passes', async () => {
    await withTempDir('persona-composition-drift', async (dir) => {
      await writePersonaPack(dir, 'persona-drift-base.json', 'drift-base', {
        persona: {
          id: 'drift-base',
          name: 'Drift Base',
          description: 'Base behavior profile',
          systemPrompt: 'System base for {{personaName}} in {{project}}',
          userPromptTemplate: 'Base instructions for {{userName}}',
          extends: [],
          traits: ['stable'],
          allowedTools: ['memory:read'],
          deniedTools: ['filesystem:delete'],
          style: { tone: 'neutral', constraints: ['base-constraint'], examples: [] },
          riskClass: 'low',
          metadata: {
            layer: 'base',
            version: 1
          }
        }
      });

      await writePersonaPack(dir, 'persona-drift-child.json', 'drift-child', {
        persona: {
          id: 'drift-child',
          name: 'Drift Child',
          description: 'Composed behavior profile',
          systemPrompt: 'System child override for {{personaName}} in {{project}}',
          userPromptTemplate: 'Child instruction for {{userName}}',
          extends: ['drift-base'],
          traits: ['composed', 'stable'],
          allowedTools: ['memory:write', 'webfetch:read'],
          deniedTools: ['filesystem:write'],
          style: { tone: 'concise', constraints: ['child-constraint'], examples: ['ex1'] },
          riskClass: 'medium',
          metadata: {
            layer: 'child',
            version: 2
          }
        }
      });

      const registry = new PersonaRegistry();
      registry.register(await loadPackFromPath(join(dir, 'persona-drift-base.json')));
      registry.register(await loadPackFromPath(join(dir, 'persona-drift-child.json')));

      const first = await composePersona(registry, 'drift-child');
      const second = await composePersona(registry, 'drift-child');
      const contextA = { project: 'Project Atlas', userName: 'Jordan' };
      const contextB = { userName: 'Jordan', project: 'Project Atlas' };

      const firstManifestHash = sha256Hex(stableStringify(first.manifest));
      const secondManifestHash = sha256Hex(stableStringify(second.manifest));
      const firstRendered = composeWithContext(first, contextA);
      const secondRendered = composeWithContext(second, contextB);
      const firstRenderedHash = sha256Hex(stableStringify(firstRendered.manifest));
      const secondRenderedHash = sha256Hex(stableStringify(secondRendered.manifest));

      expect(firstManifestHash).toBe(secondManifestHash);
      expect(firstRenderedHash).toBe(secondRenderedHash);
      expect(first.hash).toBe(second.hash);
      expect(firstManifestHash).toBe(first.hash);

      expect(firstRendered.manifest.id).toBe('drift-child');
      expect(firstRendered.manifest.traits).toContain('composed');
      expect(firstRendered.manifest.traits).toContain('stable');
      expect(firstRendered.manifest.traits).toEqual(['stable', 'composed']);
      expect(firstRendered.manifest.allowedTools).toContain('memory:read');
      expect(firstRendered.manifest.allowedTools).toContain('memory:write');
      expect(firstRendered.manifest.allowedTools).toContain('webfetch:read');
      expect(firstRendered.manifest.deniedTools).toContain('filesystem:delete');
      expect(firstRendered.manifest.deniedTools).toContain('filesystem:write');
      expect(firstRendered.manifest.systemPrompt).toContain('Project Atlas');
      expect(firstRendered.manifest.userPromptTemplate).toContain('Jordan');
    });
  });
});
