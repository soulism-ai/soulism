import { join } from 'node:path';
import {
  ValidationIssue,
  collectFiles,
  collectReport,
  ensureString,
  failOnIssues,
  isSemVer,
  readDocument,
  validateDocument,
  writeEvidence,
  isRecord
} from './lib/contract-validation';

type McpTool = {
  name?: unknown;
  description?: unknown;
  inputSchema?: unknown;
  outputSchema?: unknown;
  deprecated?: unknown;
  permissions?: unknown;
  examples?: unknown;
  version?: unknown;
};

type McpManifest = {
  schemaVersion?: unknown;
  name?: unknown;
  version?: unknown;
  description?: unknown;
  tools?: unknown;
  capabilities?: unknown;
  transport?: unknown;
  runtime?: unknown;
  provenance?: unknown;
  permissions?: unknown;
  [key: string]: unknown;
};

type McpManifestIssue = Omit<ValidationIssue, 'code'> & { code: string };

const root = process.cwd();

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const isValidToolName = (name: unknown): name is string => {
  return typeof name === 'string' && /^[a-zA-Z][a-z0-9._-]*$/.test(name);
};

const isValidSchemaType = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  if ('$ref' in value) return true;
  const schemaType = value.type;
  return typeof schemaType === 'string';
};

const validateSchemaObject = (
  schema: unknown,
  direction: 'input' | 'output',
  file: string,
  path: string
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!isValidSchemaType(schema)) {
    issues.push({
      file,
      severity: direction === 'input' ? 'error' : 'warning',
      code: `mcp_tool_${direction}_schema_invalid`,
      path,
      message: `${direction}Schema should be an object with type`
    });
    return issues;
  }

  const typed = schema as { type?: unknown; properties?: unknown; required?: unknown; $ref?: unknown };
  const hasRef = isRecord(schema) && ('$ref' in schema);
  if (!hasRef && typed.type === undefined) {
    issues.push({
      file,
      severity: direction === 'input' ? 'warning' : 'warning',
      code: `mcp_tool_${direction}_schema_type_missing`,
      path: `${path}.type`,
      message: `${direction}Schema should define type or $ref`
    });
  }

  if (typed.type === 'object' && typed.properties === undefined) {
    issues.push({
      file,
      severity: 'warning',
      code: `mcp_tool_${direction}_schema_properties`,
      path: `${path}.properties`,
      message: `${direction}Schema object should define properties for robust contracts`
    });
  }

  if (typed.required !== undefined && !Array.isArray(typed.required)) {
    issues.push({
      file,
      severity: 'warning',
      code: `mcp_tool_${direction}_schema_required_shape`,
      path: `${path}.required`,
      message: `${direction}Schema.required should be an array when present`
    });
  }

  return issues;
};

const validatePermissions = (permissions: unknown, file: string, path = '$.permissions'): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (permissions === undefined) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_permissions_missing',
      path,
      message: 'permissions is recommended for adapter-level enforcement policy'
    });
    return issues;
  }
  if (!isRecord(permissions)) {
    issues.push({
      file,
      severity: 'error',
      code: 'mcp_manifest_permissions_shape',
      path,
      message: 'permissions must be an object'
    });
    return issues;
  }

  const nonBooleanCount = Object.values(permissions).filter((value) => typeof value !== 'boolean').length;
  if (nonBooleanCount > 0) {
    issues.push({
      file,
      severity: 'error',
      code: 'mcp_manifest_permissions_type',
      path,
      message: 'permissions values must be booleans'
    });
  }

  if (Object.keys(permissions).length === 0) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_permissions_empty',
      path,
      message: 'permissions object has no boolean capability flags'
    });
  }
  return issues;
};

const validateTool = (tool: unknown, file: string, path: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!isRecord(tool)) {
    issues.push({
      file,
      severity: 'error',
      code: 'mcp_tool_shape_invalid',
      path,
      message: 'tool entry must be an object'
    });
    return issues;
  }

  const typed = tool as McpTool;
  if (!isValidToolName(typed.name)) {
    issues.push({
      file,
      severity: 'error',
      code: 'mcp_tool_name_invalid',
      path: `${path}.name`,
      message: "tool name must be identifier-like and start with alpha"
    });
  }

  if (typeof typed.description !== 'string' || typed.description.trim().length < 16) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_tool_description_short',
      path: `${path}.description`,
      message: 'tool.description should be a non-empty explanatory string'
    });
  }

  if (!isRecord(typed.inputSchema)) {
    issues.push({
      file,
      severity: 'error',
      code: 'mcp_tool_input_schema_missing',
      path: `${path}.inputSchema`,
      message: 'inputSchema is required'
    });
  } else {
    issues.push(...validateSchemaObject(typed.inputSchema, 'input', file, `${path}.inputSchema`));
  }

  if (typed.outputSchema === undefined) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_tool_output_schema_missing',
      path: `${path}.outputSchema`,
      message: 'outputSchema is recommended for MCP runtime stability'
    });
  } else {
    issues.push(...validateSchemaObject(typed.outputSchema, 'output', file, `${path}.outputSchema`));
  }

  if (typed.version !== undefined && !isString(typed.version)) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_tool_version_type',
      path: `${path}.version`,
      message: 'tool version should be string'
    });
  }
  if (typed.deprecated !== undefined && typeof typed.deprecated !== 'boolean') {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_tool_deprecated_type',
      path: `${path}.deprecated`,
      message: 'deprecated should be boolean'
    });
  }
  if (typed.permissions !== undefined) {
    issues.push(...validatePermissions(typed.permissions, file, `${path}.permissions`));
  }
  if (typed.examples !== undefined && !isRecord(typed.examples) && !Array.isArray(typed.examples)) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_tool_examples_type',
      path: `${path}.examples`,
      message: 'tool examples should be object or array'
    });
  }

  return issues;
};

const collectManifestIssues = (manifest: McpManifest, file: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const schemaVersion = String(manifest.schemaVersion || '');
  if (!isSemVer(schemaVersion)) {
    issues.push({
      file,
      severity: 'error',
      code: 'mcp_schema_version_invalid',
      path: '$.schemaVersion',
      message: 'schemaVersion must be semantic version'
    });
  } else if (!schemaVersion.startsWith('1.')) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_schema_version_unexpected_major',
      path: '$.schemaVersion',
      message: `schemaVersion '${schemaVersion}' is not within expected 1.x family`
    });
  }

  for (const issue of ensureString(manifest.name, file, '$.name', 'mcp_manifest_name_missing')) {
    issues.push(issue);
  }
  if (typeof manifest.name === 'string') {
    if (manifest.name.trim().length < 8) {
      issues.push({
        file,
        severity: 'warning',
        code: 'mcp_manifest_name_short',
        path: '$.name',
        message: 'manifest name should be descriptive'
      });
    }
    if (!/^[a-z0-9-]+/i.test(manifest.name.trim())) {
      issues.push({
        file,
        severity: 'warning',
        code: 'mcp_manifest_name_format',
        path: '$.name',
        message: 'manifest name should be lowercase or include letters, numbers, or separators'
      });
    }
  }
  if (isString(manifest.version) && !isSemVer(manifest.version)) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_version_non_standard',
      path: '$.version',
      message: 'manifest version should be semver'
    });
  }
  if (manifest.version === undefined) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_version_missing',
      path: '$.version',
      message: 'manifest version recommended for contract compatibility'
    });
  }
  if (manifest.description === undefined) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_description_missing',
      path: '$.description',
      message: 'manifest description recommended'
    });
  } else if (typeof manifest.description === 'string' && manifest.description.trim().length < 24) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_description_short',
      path: '$.description',
      message: 'manifest description should be informative'
    });
  }
  if (manifest.runtime !== undefined && !isString(manifest.runtime)) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_runtime_type',
      path: '$.runtime',
      message: 'runtime should be string if present'
    });
  }
  if (manifest.transport !== undefined && !isString(manifest.transport)) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_transport_type',
      path: '$.transport',
      message: 'transport should be string if present'
    });
  }
  if (manifest.provenance !== undefined && !isRecord(manifest.provenance)) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_provenance_type',
      path: '$.provenance',
      message: 'provenance should be object when present'
    });
  } else if (manifest.provenance !== undefined) {
    const provenance = manifest.provenance as Record<string, unknown>;
    if (typeof provenance.publisher === 'string' && provenance.publisher.trim().length < 4) {
      issues.push({
        file,
        severity: 'warning',
        code: 'mcp_manifest_provenance_publisher_short',
        path: '$.provenance.publisher',
        message: 'provenance.publisher should be meaningful'
      });
    }
    if ('publisher' in provenance && typeof provenance.publisher !== 'string') {
      issues.push({
        file,
        severity: 'warning',
        code: 'mcp_manifest_provenance_publisher_type',
        path: '$.provenance.publisher',
        message: 'provenance.publisher should be string'
      });
    }
    if ('digest' in provenance && typeof provenance.digest !== 'string') {
      issues.push({
        file,
        severity: 'warning',
        code: 'mcp_manifest_provenance_digest_type',
        path: '$.provenance.digest',
        message: 'provenance.digest should be string'
      });
    }
    if ('signature' in provenance && typeof provenance.signature !== 'string') {
      issues.push({
        file,
        severity: 'warning',
        code: 'mcp_manifest_provenance_signature_type',
        path: '$.provenance.signature',
        message: 'provenance.signature should be string'
      });
    }
    if ('createdAt' in provenance && typeof provenance.createdAt !== 'string') {
      issues.push({
        file,
        severity: 'warning',
        code: 'mcp_manifest_provenance_created_at_type',
        path: '$.provenance.createdAt',
        message: 'provenance.createdAt should be string'
      });
    }
  }
  if (manifest.transport === undefined) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_transport_missing',
      path: '$.transport',
      message: 'transport should be declared for tool runtime contract'
    });
  } else if (!['stdio', 'sse', 'streamable', 'websocket', 'http'].includes(String(manifest.transport).toLowerCase())) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_transport_unexpected',
      path: '$.transport',
      message: 'transport should be one of stdio, sse, streamable, websocket, http'
    });
  }
  if (manifest.runtime === undefined) {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_runtime_missing',
      path: '$.runtime',
      message: 'runtime should be declared for operator targeting'
    });
  }

  if (manifest.capabilities !== undefined) {
    const capabilities = manifest.capabilities;
    if (!isStringArray(capabilities)) {
      issues.push({
        file,
        severity: 'warning',
        code: 'mcp_manifest_capabilities_shape',
        path: '$.capabilities',
        message: 'capabilities should be array of strings'
      });
    } else if (capabilities.length === 0) {
      issues.push({
        file,
        severity: 'warning',
        code: 'mcp_manifest_capabilities_empty',
        path: '$.capabilities',
        message: 'manifest should declare capabilities'
      });
    }
  }

  if (manifest.permissions !== undefined) {
    issues.push(...validatePermissions(manifest.permissions, file));
  } else {
    issues.push({
      file,
      severity: 'warning',
      code: 'mcp_manifest_permissions_missing',
      path: '$.permissions',
      message: 'permissions is recommended at manifest scope'
    });
  }

  return issues;
};

const run = async (): Promise<void> => {
  const files = await collectFiles(root, (_, fullPath) => fullPath.endsWith('mcp.tools.json'));
  if (files.length === 0) {
    throw new Error('mcp_no_files');
  }

  const reports: Array<{ file: string; issues: McpManifestIssue[] }> = [];
  const toolNames = new Set<string>();

  for (const filePath of files) {
    const issues: McpManifestIssue[] = [];
    const document = await readDocument(filePath);
    issues.push(
      ...validateDocument(
        filePath,
        document.data,
        {
          type: 'object'
        },
        400
      )
    );

    const payload = document.data as McpManifest;
    issues.push(...collectManifestIssues(payload, filePath));

    const tools = payload.tools;
    if (!Array.isArray(tools)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'mcp_tools_missing',
        path: '$.tools',
        message: 'tools must be array of tool definitions'
      });
      const relative = filePath.slice(root.endsWith('/') ? root.length : root.length + 1);
      reports.push({ file: relative, issues });
      continue;
    }
    if (tools.length === 0) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'mcp_tools_empty',
        path: '$.tools',
        message: 'tools must not be empty'
      });
    }

    for (let index = 0; index < tools.length; index += 1) {
      const path = `$.tools[${index}]`;
      const tool = tools[index];
      issues.push(...validateTool(tool, filePath, path));
      if (isRecord(tool) && typeof tool.name === 'string') {
        const normalized = tool.name.trim();
        if (toolNames.has(normalized)) {
          issues.push({
            file: filePath,
            severity: 'error',
            code: 'mcp_tool_name_duplicate',
            path: `${path}.name`,
            message: `duplicate tool name '${normalized}'`
          });
        } else {
          toolNames.add(normalized);
        }
      }
    }

    const relative = filePath.slice(root.endsWith('/') ? root.length : root.length + 1);
    reports.push({ file: relative, issues });
  }

  const evidence = collectReport('mcp-tools', reports.map((entry) => ({ file: entry.file, issues: entry.issues })));
  await writeEvidence(join(root, 'ci', 'baselines', 'contracts', 'mcp.validation.json'), evidence);
  failOnIssues('mcp', evidence);
  console.log(`MCP validation passed (${evidence.totalFiles} files).`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
