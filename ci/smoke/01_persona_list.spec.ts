import { describe, expect, it } from 'vitest';
import { getJson, loadRoute, startRouteServer, withTempDir, writePersonaPack } from './helpers.js';

describe('smoke: persona list', () => {
  it('lists loaded persona packs from disk', async () => {
    await withTempDir('persona-list', async (dir) => {
      await writePersonaPack(dir, 'persona-alpha.json', 'persona-alpha');

      const route = await loadRoute('../../services/mcp/persona-registry-service/src/routes.ts', {
        PERSONA_PACKS_DIR: dir,
        SIGNATURE_POLICY_MODE: 'dev'
      });
      const running = await startRouteServer(route);

      const list = await getJson(`${running.url}/personas`);
      expect(list.response.status).toBe(200);
      expect(list.body.personas).toContain('persona-alpha');

      await running.close();
    });
  });
});
