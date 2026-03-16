export const ToolScope = {
  MemoryRead: 'memory:read',
  MemoryWrite: 'memory:write',
  FilesystemRead: 'filesystem:read',
  FilesystemWrite: 'filesystem:write',
  WebFetch: 'tool:webfetch',
  PersonaRegistry: 'persona:registry'
} as const;

export type ToolScope = (typeof ToolScope)[keyof typeof ToolScope];

export const RiskClass = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'critical'
} as const;

export type RiskClass = (typeof RiskClass)[keyof typeof RiskClass];

export interface PolicyRuleFilter {
  personaId?: string;
  tenantId?: string;
  userId?: string;
  tool?: ToolScope;
}
