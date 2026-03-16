export * from './openapi.js';
export * from './asyncapi.js';
export * from './mcp.js';

import personaSchema from '../schemas/persona.schema.json' assert { type: 'json' };
import policySchema from '../schemas/policy.schema.json' assert { type: 'json' };
import mcpSchema from '../schemas/mcp.tools.schema.json' assert { type: 'json' };
import auditSchema from '../schemas/audit.schema.json' assert { type: 'json' };
import openaiMarketplaceSchema from '../schemas/marketplace.openai.schema.json' assert { type: 'json' };
import claudeMarketplaceSchema from '../schemas/marketplace.claude.schema.json' assert { type: 'json' };
import copilotMarketplaceSchema from '../schemas/marketplace.copilot.schema.json' assert { type: 'json' };
import hfMarketplaceSchema from '../schemas/marketplace.hf.schema.json' assert { type: 'json' };
import packManifestSchema from '../schemas/pack.manifest.schema.json' assert { type: 'json' };
import packSignatureSchema from '../schemas/pack.signature.schema.json' assert { type: 'json' };
import auditEvidenceSchema from '../schemas/audit-evidence.schema.json' assert { type: 'json' };

export const schemas = {
  persona: personaSchema,
  policy: policySchema,
  mcpTools: mcpSchema,
  audit: auditSchema,
  auditEvidence: auditEvidenceSchema,
  packManifest: packManifestSchema,
  packSignature: packSignatureSchema,
  marketplaceOpenAI: openaiMarketplaceSchema,
  marketplaceClaude: claudeMarketplaceSchema,
  marketplaceCopilot: copilotMarketplaceSchema,
  marketplaceHF: hfMarketplaceSchema
};
