import {
  PolicyReasonCode,
  PolicyRequirement,
  PolicyBudgetSnapshot,
  PolicyDecisionState
} from '@soulism/shared/contracts.js';
import { RiskClass, ToolScope } from './scopes.js';

export type PolicyState = PolicyDecisionState;

export type ReasonCode = PolicyReasonCode;

export interface PolicyDecision {
  state: PolicyState;
  reasonCode: ReasonCode;
  reason?: string;
  personaId: string;
  tool: ToolScope;
  riskClass: RiskClass;
  requiresConfirmation: boolean;
  requirements: PolicyRequirement[];
  budgetSnapshot: PolicyBudgetSnapshot;
  policyVersion: string;
  traceId: string;
  decisionId: string;
  schemaVersion: string;
  issuedAt: string;
  signatureMode?: 'dev' | 'strict' | 'enforced';
  metadata?: Record<string, unknown>;
}

export interface PolicyRequest {
  personaId: string;
  userId: string;
  tenantId: string;
  tool: ToolScope;
  action: string;
  riskClass: RiskClass;
  payload?: Record<string, unknown>;
  traceId: string;
}
