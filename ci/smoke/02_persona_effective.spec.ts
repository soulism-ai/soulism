import { describe, expect, it } from 'vitest';
import { getJson, loadRoute, startRouteServer, withTempDir, writePersonaPack } from './helpers.js';

describe('smoke: persona effective', () => {
  it('returns effective persona payload for id', async () => {
    await withTempDir('persona-effective', async (dir) => {
      await writePersonaPack(dir, 'persona-beta-base.json', 'persona-beta-base', {
        persona: {
          id: 'persona-beta-base',
          name: 'Persona Base',
          description: 'Base persona',
          systemPrompt: 'System base',
          userPromptTemplate: 'User base',
          extends: [],
          traits: ['foundation'],
          allowedTools: ['memory:read'],
          deniedTools: ['filesystem:write'],
          style: { tone: 'neutral', constraints: ['base-constraint'], examples: [] },
          riskClass: 'low',
          metadata: {}
        }
      });
      await writePersonaPack(dir, 'persona-beta.json', 'persona-beta', {
        persona: {
          id: 'persona-beta',
          name: 'Persona Beta',
          description: 'Composed persona',
          systemPrompt: 'System child',
          userPromptTemplate: 'User child',
          extends: ['persona-beta-base'],
          traits: ['child'],
          allowedTools: ['memory:write'],
          deniedTools: ['filesystem:delete'],
          style: { tone: 'concise', constraints: ['child-constraint'], examples: [] },
          riskClass: 'medium',
          metadata: {}
        }
      });

      const route = await loadRoute('../../services/mcp/persona-registry-service/src/routes.ts', {
        PERSONA_PACKS_DIR: dir,
        SIGNATURE_POLICY_MODE: 'dev'
      });
      const running = await startRouteServer(route);

      const effective = await getJson(`${running.url}/personas/persona-beta/effective`);
      expect(effective.response.status).toBe(200);
      expect(effective.body.id).toBe('persona-beta');
      expect(effective.body.hash).toBeTypeOf('string');
      expect(effective.body.manifest.traits).toContain('foundation');
      expect(effective.body.manifest.traits).toContain('child');
      expect(effective.body.manifest.allowedTools).toContain('memory:read');
      expect(effective.body.manifest.allowedTools).toContain('memory:write');

      await running.close();
    });
  });
});
