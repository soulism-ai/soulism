import { describe, expect, it } from 'vitest';
import { mergePersonaManifests } from '../src/merge.js';
import { validatePersonaManifest } from '@soulism/persona-schema/validate.js';

describe('persona-core merge', () => {
  it('merges tool scopes, style constraints, and metadata deterministically', () => {
    const base = validatePersonaManifest({
      id: 'base',
      name: 'Base',
      description: 'Base',
      extends: [],
      systemPrompt: 'base',
      userPromptTemplate: 'base user',
      traits: ['safe'],
      allowedTools: ['memory:read'],
      deniedTools: ['filesystem:write'],
      style: { tone: 'neutral', constraints: ['do-no-harm'], examples: [] },
      riskClass: 'low',
      metadata: { region: 'us' }
    });

    const overlay = validatePersonaManifest({
      id: 'child',
      name: 'Child',
      description: 'Child',
      extends: ['base'],
      systemPrompt: 'child',
      userPromptTemplate: 'child user',
      traits: ['focused'],
      allowedTools: ['tool:webfetch'],
      deniedTools: [],
      style: { tone: 'direct', constraints: ['cite-evidence'], examples: [] },
      riskClass: 'medium',
      metadata: { region: 'eu', owner: 'ops' }
    });

    const merged = mergePersonaManifests(base, overlay);
    expect(merged.id).toBe('child');
    expect(merged.allowedTools).toContain('memory:read');
    expect(merged.allowedTools).toContain('tool:webfetch');
    expect(merged.style.constraints).toContain('do-no-harm');
    expect(merged.style.constraints).toContain('cite-evidence');
    expect(merged.metadata.region).toBe('eu');
    expect(merged.metadata.owner).toBe('ops');
  });
});
