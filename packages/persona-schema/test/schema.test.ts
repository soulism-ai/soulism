import { describe, expect, it } from 'vitest';
import { validatePersonaPack } from '../src/validate.js';

describe('persona-schema', () => {
  it('validates persona pack integrity', () => {
    const pack = validatePersonaPack({
      id: 'pack-alpha',
      version: '1.0.0',
      schemaVersion: '1.0.0',
      persona: {
        id: 'persona-alpha',
        name: 'Persona Alpha',
        description: 'Test persona',
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
      provenance: {
        source: 'test',
        createdAt: Date.now()
      }
    });

    expect(pack.id).toBe('pack-alpha');
    expect(pack.persona.id).toBe('persona-alpha');
    expect(pack.schemaVersion).toBe('1.0.0');
  });
});
