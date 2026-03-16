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
  writeEvidence
} from './lib/contract-validation';

type AsyncApiDocument = {
  asyncapi?: unknown;
  info?: {
    title?: unknown;
    version?: unknown;
    description?: unknown;
  };
  channels?: Record<string, unknown>;
  servers?: Record<string, unknown>;
  components?: {
    messages?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
    [key: string]: unknown;
  };
};

type AsyncApiOperation = {
  operationId?: unknown;
  summary?: unknown;
  description?: unknown;
  message?: unknown;
  messages?: unknown;
  traits?: unknown;
  security?: unknown[];
  [key: string]: unknown;
};

type AsyncApiChannel = {
  description?: unknown;
  parameters?: unknown;
  subscribe?: unknown;
  publish?: unknown;
  [key: string]: unknown;
};

type AsyncApiMessage = {
  title?: unknown;
  name?: unknown;
  payload?: unknown;
  headers?: unknown;
  summary?: unknown;
  description?: unknown;
  $ref?: unknown;
  [key: string]: unknown;
};

const root = process.cwd();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isHttpsUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const ensureSafeRef = (value: unknown, collection: Record<string, unknown>, section: string): boolean => {
  if (!isString(value)) return false;
  const prefix = `#/components/${section}/`;
  if (!value.startsWith(prefix)) return false;
  return Object.prototype.hasOwnProperty.call(collection, value.slice(prefix.length));
};

const collectMessages = (doc: AsyncApiDocument): Record<string, unknown> => {
  if (!isRecord(doc.components) || !isRecord(doc.components.messages)) return {};
  return doc.components.messages;
};

const collectSchemas = (doc: AsyncApiDocument): Record<string, unknown> => {
  if (!isRecord(doc.components) || !isRecord(doc.components.schemas)) return {};
  return doc.components.schemas;
};

const collectParameters = (doc: AsyncApiDocument): Record<string, unknown> => {
  if (!isRecord(doc.components) || !isRecord(doc.components.parameters)) return {};
  return doc.components.parameters;
};

const collectSecuritySchemes = (doc: AsyncApiDocument): Record<string, unknown> => {
  if (!isRecord(doc.components) || !isRecord(doc.components.securitySchemes)) return {};
  return doc.components.securitySchemes;
};

const validateMessage = (
  messageRaw: unknown,
  declaredMessages: Record<string, unknown>,
  declaredSchemas: Record<string, unknown>,
  filePath: string,
  messagePath: string
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (isString(messageRaw)) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'asyncapi_message_reference_style',
      path: messagePath,
      message: `message should be object or $ref object, got string '${messageRaw}'`
    });
    return issues;
  }

  if (!isRecord(messageRaw)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'asyncapi_message_shape',
      path: messagePath,
      message: 'message must be an object or {$ref} reference object'
    });
    return issues;
  }

  const message = messageRaw as AsyncApiMessage;
  if (message.$ref !== undefined) {
    if (!ensureSafeRef(message.$ref, declaredMessages, 'messages')) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'asyncapi_message_ref_unknown',
        path: `${messagePath}.$ref`,
        message: `message reference '${String(message.$ref)}' not found in components.messages`
      });
    }
    return issues;
  }

  if (!isString(message.name) && !isString(message.title)) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'asyncapi_message_name_recommended',
      path: `${messagePath}.name`,
      message: 'message name/title should be provided for governance tooling'
    });
  }

  if (message.payload !== undefined) {
    if (isString(message.payload) && !ensureSafeRef(message.payload, declaredSchemas, 'schemas')) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'asyncapi_payload_ref_unknown',
        path: `${messagePath}.payload`,
        message: `payload reference '${String(message.payload)}' not found in components.schemas`
      });
    } else if (isRecord(message.payload) && isString(message.payload.$ref) && !ensureSafeRef(message.payload.$ref, declaredSchemas, 'schemas')) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'asyncapi_payload_ref_unknown',
        path: `${messagePath}.payload.$ref`,
        message: `payload reference '${String(message.payload.$ref)}' not found in components.schemas`
      });
    } else if (!isString(message.payload) && !isRecord(message.payload)) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'asyncapi_payload_shape',
        path: `${messagePath}.payload`,
        message: 'payload should be object schema or $ref to components.schemas'
      });
    }
  } else {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'asyncapi_message_payload_missing',
      path: `${messagePath}.payload`,
      message: 'message.payload is optional but strongly recommended for event contracts'
    });
  }

  if (message.headers !== undefined && !isRecord(message.headers)) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'asyncapi_headers_shape',
      path: `${messagePath}.headers`,
      message: 'message.headers should be an object when present'
    });
  }

  return issues;
};

const validateTraits = (traits: unknown, filePath: string, path: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (traits === undefined) {
    return issues;
  }
  if (!Array.isArray(traits)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'asyncapi_traits_shape',
      path: `${path}.traits`,
      message: 'traits must be an array'
    });
    return issues;
  }

  for (let i = 0; i < traits.length; i += 1) {
    const trait = traits[i];
    if (!isString(trait) && !isRecord(trait)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'asyncapi_trait_shape',
        path: `${path}.traits[${i}]`,
        message: 'each trait entry must be a string ref or object'
      });
      continue;
    }
    if (isString(trait) && !trait.startsWith('#/components/traits/')) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'asyncapi_trait_ref_shape',
        path: `${path}.traits[${i}]`,
        message: 'trait references should target components/traits'
      });
    }
  }

  return issues;
};

const validateMessageContainer = (
  operation: unknown,
  declaredMessages: Record<string, unknown>,
  declaredSchemas: Record<string, unknown>,
  declaredSecuritySchemes: Record<string, unknown>,
  filePath: string,
  path: string
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!isRecord(operation)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'asyncapi_operation_shape',
      path,
      message: 'operation entry must be an object'
    });
    return issues;
  }

  const op = operation as AsyncApiOperation;
  if (!isString(op.summary) && !isString(op.description)) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'asyncapi_operation_doc',
      path,
      message: 'operation should include summary or description'
    });
  }

  if (isString(op.operationId) && !/^[a-zA-Z0-9_\\-]+$/.test(op.operationId)) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'asyncapi_operation_id_style',
      path: `${path}.operationId`,
      message: 'operationId should be identifier-like'
    });
  }
  if (op.operationId !== undefined && !isString(op.operationId)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'asyncapi_operation_id_type',
      path: `${path}.operationId`,
      message: 'operationId must be a string'
    });
  }

  if (op.message === undefined && op.messages === undefined) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'asyncapi_operation_message_missing',
      path,
      message: 'operation must define message or messages'
    });
  }

  if (op.message !== undefined) {
    issues.push(...validateMessage(op.message, declaredMessages, declaredSchemas, filePath, `${path}.message`));
  }

  if (op.messages !== undefined) {
    if (!Array.isArray(op.messages) || op.messages.length === 0) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'asyncapi_messages_shape',
        path: `${path}.messages`,
        message: 'messages must be non-empty array'
      });
    } else {
      for (let i = 0; i < op.messages.length; i += 1) {
        const item = op.messages[i];
        issues.push(...validateMessage(item, declaredMessages, declaredSchemas, filePath, `${path}.messages[${i}]`));
      }
    }
  }

  if (Array.isArray(op.security)) {
    if (op.security.length === 0) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'asyncapi_security_empty',
        path: `${path}.security`,
        message: 'operation security block is an explicit empty list'
      });
    } else {
      for (let index = 0; index < op.security.length; index += 1) {
        const entry = op.security[index];
        if (!isRecord(entry)) {
          issues.push({
            file: filePath,
            severity: 'error',
            code: 'asyncapi_security_requirement_shape',
            path: `${path}.security[${index}]`,
            message: 'security requirement entry must be an object'
          });
          continue;
        }
        if (Object.keys(entry).length === 0) {
          issues.push({
            file: filePath,
            severity: 'warning',
            code: 'asyncapi_security_requirement_empty',
            path: `${path}.security[${index}]`,
            message: 'security requirement object should not be empty'
          });
        }
        for (const scheme of Object.keys(entry)) {
          if (!Object.prototype.hasOwnProperty.call(declaredSecuritySchemes, scheme)) {
            issues.push({
              file: filePath,
              severity: 'warning',
              code: 'asyncapi_channel_security_unknown',
              path: `${path}.security[${index}]`,
              message: `unknown security scheme '${scheme}'`
            });
          }
        }
      }
    }
  }

  issues.push(...validateTraits(op.traits, filePath, path));

  return issues;
};

const validateChannelParameters = (
  channelName: string,
  channel: AsyncApiChannel,
  declaredParams: Record<string, unknown>,
  filePath: string
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const pathParams = Array.from(channelName.matchAll(/\{([^}]+)\}/g)).map((match) => match[1] || '');
  const unresolved = pathParams.filter((param) => !Object.prototype.hasOwnProperty.call(declaredParams, param));

  for (const param of unresolved) {
    if (param.length > 0) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'asyncapi_parameter_not_declared',
        path: `$.channels.${channelName}`,
        message: `channel parameter '{${param}}' is not declared in components.parameters`
      });
    }
  }

  if ((channel.parameters !== undefined) && !isRecord(channel.parameters)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'asyncapi_channel_parameters_shape',
      path: `$.channels.${channelName}.parameters`,
      message: 'channel.parameters must be an object'
    });
  }

  return issues;
};

const validateServers = (servers: Record<string, unknown> | undefined, filePath: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!servers || !isRecord(servers) || Object.keys(servers).length === 0) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'asyncapi_servers_missing',
      path: '$.servers',
      message: 'servers should include runtime endpoints'
    });
    return issues;
  }

  for (const [name, serverRaw] of Object.entries(servers)) {
    if (!isRecord(serverRaw)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'asyncapi_server_shape',
        path: `$.servers.${name}`,
        message: 'server entry must be an object'
      });
      continue;
    }
    const server = serverRaw as Record<string, unknown>;
    if (!isString(server.url)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'asyncapi_server_url',
        path: `$.servers.${name}.url`,
        message: 'server.url required'
      });
    } else if (!isHttpsUrl(server.url)) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'asyncapi_server_url_scheme',
        path: `$.servers.${name}.url`,
        message: `server.url '${server.url}' should be an absolute URL`
      });
    }
    if (!isString(server.protocol)) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'asyncapi_server_protocol',
        path: `$.servers.${name}.protocol`,
        message: 'server.protocol recommended'
      });
    }
  }

  return issues;
};

const validateChannels = (doc: AsyncApiDocument, filePath: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!doc.channels || !isRecord(doc.channels) || Object.keys(doc.channels).length === 0) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'channels_missing',
      path: '$.channels',
      message: 'channels must be non-empty object'
    });
    return issues;
  }

  const declaredMessages = collectMessages(doc);
  const declaredSchemas = collectSchemas(doc);
  const declaredParams = collectParameters(doc);
  const declaredSecuritySchemes = collectSecuritySchemes(doc);

  for (const [channelName, channelRaw] of Object.entries(doc.channels)) {
    if (!isString(channelName) || !channelName.startsWith('/')) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'asyncapi_channel_name',
        path: `$.channels`,
        message: `channel '${channelName}' should be an absolute channel/topic`
      });
    }

    if (!isRecord(channelRaw)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'asyncapi_channel_shape',
        path: `$.channels.${channelName}`,
        message: 'channel definition must be object'
      });
      continue;
    }

    const channel = channelRaw as AsyncApiChannel;
    issues.push(...validateChannelParameters(channelName, channel, declaredParams, filePath));

    if (channel.subscribe === undefined && channel.publish === undefined) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'asyncapi_channel_direction',
        path: `$.channels.${channelName}`,
        message: 'channel must define subscribe and/or publish'
      });
      continue;
    }

    if (channel.subscribe !== undefined) {
      issues.push(
        ...validateMessageContainer(
          channel.subscribe,
          declaredMessages,
          declaredSchemas,
          declaredSecuritySchemes,
          filePath,
          `$.channels.${channelName}.subscribe`
        )
      );
    }

    if (channel.publish !== undefined) {
      issues.push(
        ...validateMessageContainer(
          channel.publish,
          declaredMessages,
          declaredSchemas,
          declaredSecuritySchemes,
          filePath,
          `$.channels.${channelName}.publish`
        )
      );
    }
  }

  return issues;
};

const validateComponents = (doc: AsyncApiDocument, filePath: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const messageCount = Object.keys(collectMessages(doc)).length;
  const schemaCount = Object.keys(collectSchemas(doc)).length;
  const securityCount = Object.keys(collectSecuritySchemes(doc)).length;
  const parameterCount = Object.keys(collectParameters(doc)).length;

  if (messageCount === 0) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'asyncapi_components_messages_empty',
      path: '$.components.messages',
      message: 'components.messages is empty'
    });
  }
  if (schemaCount === 0) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'asyncapi_components_schemas_empty',
      path: '$.components.schemas',
      message: 'components.schemas is empty'
    });
  }
  if (parameterCount === 0) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'asyncapi_components_parameters_empty',
      path: '$.components.parameters',
      message: 'components.parameters is empty'
    });
  }
  if (securityCount === 0) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'asyncapi_components_security_empty',
      path: '$.components.securitySchemes',
      message: 'components.securitySchemes is empty; consider defining auth policies'
    });
  }

  return issues;
};

const run = async (): Promise<void> => {
  const files = await collectFiles(root, (_, fullPath) => /asyncapi\.(json|ya?ml)$/i.test(fullPath));
  if (files.length === 0) {
    throw new Error('asyncapi_no_files');
  }

  const reports: Array<{ file: string; issues: ValidationIssue[] }> = [];

  for (const filePath of files) {
    const document = await readDocument(filePath);
    const issues: ValidationIssue[] = [];
    issues.push(
      ...validateDocument(
        filePath,
        document.data,
        {
          type: 'object',
          required: ['asyncapi', 'info', 'channels']
        },
        500
      )
    );

    const payload = document.data as AsyncApiDocument;
    const version = payload.asyncapi;
    if (typeof version !== 'string' || !version.startsWith('2.')) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'asyncapi_version_bad',
        path: '$.asyncapi',
        message: "asyncapi must be a 2.x version string"
      });
    } else if (!isSemVer(version)) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'asyncapi_version_non_standard',
        path: '$.asyncapi',
        message: `non-standard asyncapi version '${version}'`
      });
    }

    for (const issue of ensureString(payload.info?.title, filePath, '$.info.title', 'missing_info_title')) {
      issues.push(issue);
    }
    for (const issue of ensureString(payload.info?.version, filePath, '$.info.version', 'missing_info_version')) {
      issues.push(issue);
    }

    issues.push(...validateComponents(payload, filePath));
    issues.push(...validateServers(payload.servers || {}, filePath));
    issues.push(...validateChannels(payload, filePath));

    if (Object.keys(payload.channels || {}).length === 0) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'channels_empty',
        path: '$.channels',
        message: 'channels object cannot be empty'
      });
    }

    const relative = filePath.slice(root.endsWith('/') ? root.length : root.length + 1);
    reports.push({ file: relative, issues });
  }

  const evidence = collectReport(
    'asyncapi-contracts',
    reports.map((item) => ({ file: item.file, issues: item.issues }))
  );
  await writeEvidence(join(root, 'ci', 'baselines', 'contracts', 'asyncapi.validation.json'), evidence);
  failOnIssues('asyncapi', evidence);
  console.log(`AsyncAPI validation passed (${evidence.totalFiles} files).`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
