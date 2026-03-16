import { join } from 'node:path';
import {
  ValidationIssue,
  collectFiles,
  collectReport,
  ensureString,
  ensureStringArray,
  failOnIssues,
  isSemVer,
  readDocument,
  validateDocument,
  writeEvidence
} from './lib/contract-validation';

type OpenApiDocument = {
  openapi?: unknown;
  info?: {
    title?: unknown;
    version?: unknown;
    description?: unknown;
  };
  servers?: unknown;
  paths?: Record<string, unknown>;
  tags?: unknown[];
  components?: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    requestBodies?: Record<string, unknown>;
    responses?: Record<string, unknown>;
    [key: string]: unknown;
  };
  security?: unknown[];
};

type OpenApiOperation = Record<string, unknown>;
type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'trace';

const root = process.cwd();
const allowedMethods: ReadonlySet<string> = new Set<HttpMethod>([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'trace'
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRecordArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every((entry) => isRecord(entry));

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const hasValidUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const isHttpStatusCode = (code: string): boolean => {
  if (code === 'default') return true;
  const value = Number(code);
  return Number.isInteger(value) && value >= 100 && value <= 599;
};

const collectDeclaredTagNames = (doc: OpenApiDocument): Set<string> => {
  const tags = new Set<string>();
  if (!Array.isArray(doc.tags)) return tags;

  for (const tag of doc.tags) {
    if (typeof tag === 'string') {
      const normalized = tag.trim();
      if (normalized.length > 0) tags.add(normalized);
      continue;
    }
    if (isRecord(tag) && typeof tag.name === 'string') {
      const normalized = tag.name.trim();
      if (normalized.length > 0) tags.add(normalized);
    }
  }

  return tags;
};

const collectDeclaredSecuritySchemes = (doc: OpenApiDocument): Set<string> => {
  const schemes = new Set<string>();
  if (!doc.components || !isRecord(doc.components) || !doc.components.securitySchemes || !isRecord(doc.components.securitySchemes)) {
    return schemes;
  }

  for (const key of Object.keys(doc.components.securitySchemes)) {
    schemes.add(key);
  }

  return schemes;
};

const collectDeclaredParameters = (doc: OpenApiDocument): Set<string> => {
  const parameters = new Set<string>();
  if (!doc.components || !isRecord(doc.components) || !doc.components.parameters || !isRecord(doc.components.parameters)) {
    return parameters;
  }

  for (const key of Object.keys(doc.components.parameters)) {
    parameters.add(key);
  }

  return parameters;
};

const validateSecuritySchemes = (doc: OpenApiDocument, filePath: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!doc.components || !isRecord(doc.components) || !isRecord(doc.components.securitySchemes)) return issues;

  const securitySchemes = doc.components.securitySchemes;
  for (const [schemeName, schemeRaw] of Object.entries(securitySchemes)) {
    if (!isRecord(schemeRaw)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'security_scheme_invalid_shape',
        path: `$.components.securitySchemes.${schemeName}`,
        message: `security scheme '${schemeName}' must be an object`
      });
      continue;
    }
    const scheme = schemeRaw as Record<string, unknown>;

    if (typeof scheme.type !== 'string' || scheme.type.trim().length === 0) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'security_scheme_type_missing',
        path: `$.components.securitySchemes.${schemeName}.type`,
        message: `security scheme '${schemeName}' requires type`
      });
      continue;
    }

    if (!['apiKey', 'http', 'oauth2', 'openIdConnect', 'mutualTLS'].includes(scheme.type)) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'security_scheme_type_unrecognized',
        path: `$.components.securitySchemes.${schemeName}.type`,
        message: `security scheme '${schemeName}' has unrecognized type '${scheme.type}'`
      });
    }

    if (scheme.type === 'http' && (typeof scheme.scheme !== 'string' || scheme.scheme.length === 0)) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'security_scheme_http_scheme_missing',
        path: `$.components.securitySchemes.${schemeName}.scheme`,
        message: `security scheme '${schemeName}' should define HTTP auth scheme`
      });
    }

    if (scheme.type === 'apiKey' && (typeof scheme.name !== 'string' || scheme.name.trim().length === 0)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'security_scheme_api_key_name_missing',
        path: `$.components.securitySchemes.${schemeName}.name`,
        message: `security scheme '${schemeName}' requires name when type is apiKey`
      });
    }

    if (scheme.type === 'apiKey' && typeof scheme.in !== 'string') {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'security_scheme_api_key_in_missing',
        path: `$.components.securitySchemes.${schemeName}.in`,
        message: `security scheme '${schemeName}' requires in for apiKey type`
      });
    }

    if (scheme.type === 'oauth2' && !isRecord(scheme.flows)) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'security_scheme_oauth2_flows_missing',
        path: `$.components.securitySchemes.${schemeName}.flows`,
        message: `security scheme '${schemeName}' should define flows for oauth2`
      });
    }
  }

  return issues;
};

const validatePathParameters = (path: string, declared: Set<string>, pathRef: string, filePath: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const pathParams = Array.from(path.matchAll(/\{([^{}]+)\}/g))
    .map((match) => match[1]?.trim() || '')
    .filter((param) => param.length > 0);
  if (pathParams.length === 0) return issues;

  for (const param of pathParams) {
    if (path.includes('{}')) {
      continue;
    }
    if (!declared.has(param)) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'openapi_path_param_undeclared',
        path: pathRef,
        message: `path parameter '${param}' is not declared in components.parameters`
      });
    }
  }

  return issues;
};

const validateOperationParameters = (operation: OpenApiOperation, pathRef: string, method: string, filePath: string): ValidationIssue[] => {
  const parameters = operation.parameters;
  const issues: ValidationIssue[] = [];

  if (parameters === undefined) {
    return issues;
  }

  if (!Array.isArray(parameters)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'invalid_operation_parameters',
      path: `${pathRef}.${method}.parameters`,
      message: 'operation.parameters must be an array'
    });
    return issues;
  }

  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (!isRecord(parameter)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'invalid_operation_parameter_entry',
        path: `${pathRef}.${method}.parameters[${index}]`,
        message: 'operation parameter entry must be an object'
      });
      continue;
    }

    const hasRef = isNonEmptyString(parameter.$ref);
    if (hasRef) {
      if (!parameter.$ref.startsWith('#/components/parameters/')) {
        issues.push({
          file: filePath,
          severity: 'error',
          code: 'invalid_operation_parameter_ref',
          path: `${pathRef}.${method}.parameters[${index}].$ref`,
          message: `operation parameter ref must point at components.parameters (${String(parameter.$ref)})`
        });
      }
      continue;
    }

    if (!isNonEmptyString(parameter.name)) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'operation_parameter_name_missing',
        path: `${pathRef}.${method}.parameters[${index}]`,
        message: 'operation parameter should include name when no $ref is provided'
      });
    }
  }

  return issues;
};

const validateSecurityRequirements = (
  security: unknown,
  declared: Set<string>,
  path: string,
  filePath: string
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(security)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'invalid_security_block',
      path: `${path}.security`,
      message: 'security must be an array of security requirements'
    });
    return issues;
  }

  for (const entry of security) {
    if (!isRecord(entry) || Object.keys(entry).length === 0) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'invalid_security_requirement',
        path: `${path}.security`,
        message: 'security requirement must be a non-empty object'
      });
      continue;
    }

    for (const schemeName of Object.keys(entry)) {
      if (!declared.has(schemeName)) {
        issues.push({
          file: filePath,
          severity: 'warning',
          code: 'unknown_security_scheme',
          path: `${path}.security`,
          message: `security scheme '${schemeName}' is not declared in components.securitySchemes`
        });
      }
    }
  }

  return issues;
};

const validateOperationSecurityDefaults = (
  operation: OpenApiOperation,
  method: HttpMethod,
  declared: Set<string>,
  path: string,
  filePath: string
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const mutationMethod = method === 'post' || method === 'put' || method === 'patch' || method === 'delete';
  if (!mutationMethod) {
    return issues;
  }

  if (!Object.prototype.hasOwnProperty.call(operation, 'security')) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'mutation_missing_operation_security',
      path,
      message: `mutation operation ${method.toUpperCase()} should declare operation-level security explicitly`
    });
    return issues;
  }

  if (!Array.isArray(operation.security) || operation.security.length === 0) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'mutation_empty_operation_security',
      path: `${path}.security`,
      message: `operation-level security for ${method.toUpperCase()} is empty`
    });
    return issues;
  }

  for (const entry of operation.security) {
    if (!isRecord(entry)) {
      continue;
    }
    const schemeNames = Object.keys(entry);
    if (schemeNames.length === 0) {
      continue;
    }
    for (const name of schemeNames) {
      if (!declared.has(name)) {
        issues.push({
          file: filePath,
          severity: 'error',
          code: 'mutation_unknown_security_scheme',
          path: `${path}.security`,
          message: `mutation operation ${method.toUpperCase()} references undeclared security scheme '${name}'`
        });
      }
    }
  }

  return issues;
};

const validateResponse = (
  responses: Record<string, unknown>,
  responseCodeRaw: string,
  responsePath: string,
  filePath: string
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const response = responses[responseCodeRaw];

  if (!isRecord(response)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'invalid_response_shape',
      path: responsePath,
      message: `response '${responseCodeRaw}' must be an object`
    });
    return issues;
  }

  if (typeof response.description !== 'string' || response.description.trim().length === 0) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'missing_response_description',
      path: `${responsePath}.description`,
      message: `response '${responseCodeRaw}' should define description`
    });
  }

  if (response.content !== undefined) {
    if (!isRecord(response.content)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'invalid_response_content',
        path: `${responsePath}.content`,
        message: 'response.content must be an object'
      });
      return issues;
    }

    for (const [mediaType, media] of Object.entries(response.content)) {
      if (!isRecord(media)) {
        issues.push({
          file: filePath,
          severity: 'error',
          code: 'invalid_media_type_schema',
          path: `${responsePath}.content.${mediaType}`,
          message: `response content for '${mediaType}' must be an object`
        });
        continue;
      }
      if (media.schema === undefined && media.example === undefined && media.examples === undefined) {
        issues.push({
          file: filePath,
          severity: 'warning',
          code: 'missing_response_payload',
          path: `${responsePath}.content.${mediaType}`,
          message: `media type '${mediaType}' should define schema or example`
        });
      }
    }

    if (Object.keys(response.content).length === 0 && ['2', 'default'].includes(responseCodeRaw[0] || '')) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'empty_response_payload',
        path: `${responsePath}.content`,
        message: `successful response '${responseCodeRaw}' has no media entries`
      });
    }
  }

  return issues;
};

const validateRequestBody = (requestBody: unknown, method: HttpMethod, pathRef: string, path: string, filePath: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const mutationMethods = new Set<HttpMethod>(['post', 'put', 'patch', 'delete']);
  const isMutationMethod = mutationMethods.has(method);

  if (requestBody === undefined) {
    if (isMutationMethod) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'operation_request_body_missing',
        path: `${pathRef}.${method}.requestBody`,
        message: `${method.toUpperCase()} ${path} should declare requestBody`
      });
    }
    return issues;
  }

  if (!isRecord(requestBody)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'operation_request_body_shape',
      path: `${pathRef}.${method}.requestBody`,
      message: 'requestBody must be an object'
    });
    return issues;
  }

  if (requestBody.content === undefined) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'operation_request_body_content_missing',
      path: `${pathRef}.${method}.requestBody.content`,
      message: 'requestBody.content is recommended'
    });
  } else if (!isRecord(requestBody.content)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'operation_request_body_content_shape',
      path: `${pathRef}.${method}.requestBody.content`,
      message: 'requestBody.content must be an object'
    });
  }

  if (method === 'get' || method === 'head') {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'unsafe_get_request_body',
      path: `${pathRef}.${method}.requestBody`,
      message: `${method.toUpperCase()} should not define requestBody`
    });
  }

  return issues;
};

const operationHasSecurity = (operation: OpenApiOperation): boolean =>
  Object.prototype.hasOwnProperty.call(operation, 'security') && Array.isArray(operation.security);

const collectPathIssues = (
  doc: OpenApiDocument,
  declaredTags: Set<string>,
  declaredSecuritySchemes: Set<string>,
  declaredParameters: Set<string>,
  filePath: string
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const paths = doc.paths;
  if (!paths || typeof paths !== 'object' || Object.keys(paths).length === 0) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'paths_missing_or_invalid',
      path: '$.paths',
      message: 'paths must be a non-empty object'
    });
    return issues;
  }

  const pathEntries = Object.entries(paths);
  const hasHealthPath = pathEntries.some(([path]) => path === '/health');
  const hasReadyPath = pathEntries.some(([path]) => path === '/ready');

  if (!hasHealthPath) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'missing_health_path',
      path: '$.paths',
      message: 'required /health route missing'
    });
  }

  if (!hasReadyPath) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'missing_ready_path',
      path: '$.paths',
      message: 'required /ready route missing'
    });
  }

  const operationIds = new Set<string>();

  for (const [path, definitionRaw] of pathEntries) {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'invalid_path_key',
        path: '$.paths',
        message: `path key must begin with '/': ${String(path)}`
      });
      continue;
    }

    if (!definitionRaw || !isRecord(definitionRaw)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'invalid_path_object',
        path: `$.paths${path}`,
        message: 'path object must be a map'
      });
      continue;
    }

    const pathOperations = Object.entries(definitionRaw).filter(([method]) => allowedMethods.has(method.toLowerCase()));
    if (pathOperations.length === 0) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'path_without_http_methods',
        path: `$.paths${path}`,
        message: 'path object must define at least one HTTP operation'
      });
      continue;
    }

    if (/%/.test(path)) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'path_contains_raw_percent',
        path: `$.paths${path}`,
        message: 'avoid raw percent placeholders in path, prefer path params'
      });
    }

    if ((path.match(/\{[^}]*\}/g) || []).some((match) => match === '{}')) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'invalid_empty_path_param',
        path: `$.paths${path}`,
        message: 'path parameter name cannot be empty'
      });
    }
    issues.push(...validatePathParameters(path, declaredParameters, `$.paths${path}`, filePath));

    for (const [methodRaw, operationRaw] of pathOperations) {
      const method = methodRaw.toLowerCase() as HttpMethod;
      if (!isRecord(operationRaw)) {
        issues.push({
          file: filePath,
          severity: 'error',
          code: 'invalid_operation_object',
          path: `$.paths${path}.${method}`,
          message: 'operation entry must be an object'
        });
        continue;
      }

      const operation = operationRaw as OpenApiOperation;
      issues.push(...validateOperationParameters(operation, `$.paths${path}`, method, filePath));
      if (typeof operation.summary !== 'string' && typeof operation.description !== 'string') {
        issues.push({
          file: filePath,
          severity: 'warning',
          code: 'operation_summary_or_description_missing',
          path: `$.paths${path}.${method}`,
          message: 'operation should include summary or description'
        });
      }

      if (typeof operation.operationId !== 'string' || operation.operationId.trim().length === 0) {
        issues.push({
          file: filePath,
          severity: 'error',
          code: 'missing_operation_id',
          path: `$.paths${path}.${method}.operationId`,
          message: 'operationId is required'
        });
      } else {
        if (!/^[a-zA-Z0-9_]+$/.test(operation.operationId)) {
          issues.push({
            file: filePath,
            severity: 'warning',
            code: 'non_camel_operation_id',
            path: `$.paths${path}.${method}.operationId`,
            message: `operationId contains non-standard characters: ${operation.operationId}`
          });
        }
        if (operationIds.has(operation.operationId)) {
          issues.push({
            file: filePath,
            severity: 'error',
            code: 'duplicate_operation_id',
            path: `$.paths${path}.${method}.operationId`,
            message: `duplicate operationId '${operation.operationId}'`
          });
        }
        operationIds.add(operation.operationId);
      }

      if (operation.tags !== undefined) {
        if (!Array.isArray(operation.tags) || operation.tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)) {
          issues.push({
            file: filePath,
            severity: 'error',
            code: 'invalid_operation_tags',
            path: `$.paths${path}.${method}.tags`,
            message: 'operation tags must be array of non-empty strings'
          });
        } else if (declaredTags.size > 0) {
          for (const tag of operation.tags) {
            if (!declaredTags.has(tag)) {
              issues.push({
                file: filePath,
                severity: 'warning',
                code: 'undeclared_tag',
                path: `$.paths${path}.${method}.tags`,
                message: `operation tag '${tag}' not declared in top-level tags`
              });
            }
          }
        }
      }

      if (operationHasSecurity(operation)) {
        issues.push(...validateSecurityRequirements(operation.security, declaredSecuritySchemes, `$.paths${path}.${method}`, filePath));
      }
      issues.push(...validateOperationSecurityDefaults(operation, method, declaredSecuritySchemes, `$.paths${path}.${method}`, filePath));
      if (!operation.responses || !isRecord(operation.responses)) {
        issues.push({
          file: filePath,
          severity: 'error',
          code: 'missing_responses',
          path: `$.paths${path}.${method}.responses`,
          message: 'operation.responses required'
        });
      } else {
        const responses = operation.responses as Record<string, unknown>;
        const keys = Object.keys(responses);
        if (keys.length === 0) {
          issues.push({
            file: filePath,
            severity: 'error',
            code: 'empty_responses',
            path: `$.paths${path}.${method}.responses`,
            message: 'at least one response entry required'
          });
        } else {
          let has2xx = false;
          for (const responseCode of keys) {
            if (!isHttpStatusCode(responseCode)) {
              issues.push({
                file: filePath,
                severity: 'error',
                code: 'invalid_response_code',
                path: `$.paths${path}.${method}.responses`,
                message: `invalid response status code ${responseCode}`
              });
              continue;
            }

            if (responseCode.startsWith('2')) has2xx = true;
            issues.push(...validateResponse(responses, responseCode, `$.paths${path}.${method}.responses.${responseCode}`, filePath));
          }

          if (!has2xx) {
            issues.push({
              file: filePath,
              severity: 'warning',
              code: 'missing_success_response',
              path: `$.paths${path}.${method}.responses`,
              message: 'operation should define at least one 2xx response'
            });
          }
        }
      }

      issues.push(...validateRequestBody(operation.requestBody, method, `$.paths${path}`, path, filePath));
    }
  }

  return issues;
};

const collectSecurityUsage = (doc: OpenApiDocument): boolean => {
  if (!doc.paths || !isRecord(doc.paths)) return false;
  if (Array.isArray(doc.security) && doc.security.length > 0) return true;

  for (const pathValue of Object.values(doc.paths)) {
    if (!isRecord(pathValue)) continue;
    const entries = Object.values(pathValue) as unknown[];
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      if (Array.isArray(entry.security) && entry.security.length > 0) return true;
    }
  }

  return false;
};

const validateTopLevel = (doc: OpenApiDocument, filePath: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const openApiRaw = doc.openapi;

  if (typeof openApiRaw !== 'string' || !openApiRaw.startsWith('3.')) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'invalid_openapi_version',
      path: '$.openapi',
      message: "openapi must be a string with OpenAPI 3.x e.g. '3.1.0'"
    });
  } else if (!isSemVer(openApiRaw)) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'openapi_non_standard',
      path: '$.openapi',
      message: `openapi version '${openApiRaw}' is non-standard`
    });
  }

  for (const issue of ensureString(doc.info?.title, filePath, '$.info.title', 'missing_info_title')) {
    issues.push(issue);
  }
  for (const issue of ensureString(doc.info?.version, filePath, '$.info.version', 'missing_info_version')) {
    issues.push(issue);
  }
  if (!doc.info || !isRecord(doc.info)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'missing_info_block',
      path: '$.info',
      message: 'info block is required'
    });
  }

  if (!doc.servers || !Array.isArray(doc.servers) || doc.servers.length === 0) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'missing_servers',
      path: '$.servers',
      message: 'servers must be a non-empty array'
    });
  } else {
    for (let index = 0; index < doc.servers.length; index += 1) {
      const server = doc.servers[index]!;
      const serverPath = `$.servers[${index}]`;
      if (!isRecord(server)) {
        issues.push({
          file: filePath,
          severity: 'error',
          code: 'server_shape_invalid',
          path: serverPath,
          message: 'server entry must be an object'
        });
        continue;
      }
      if (!isNonEmptyString(server.url)) {
        issues.push({
          file: filePath,
          severity: 'error',
          code: 'server_url_missing',
          path: `${serverPath}.url`,
          message: 'server.url is required'
        });
      } else if (!hasValidUrl(server.url)) {
        issues.push({
          file: filePath,
          severity: 'warning',
          code: 'server_url_non_http',
          path: `${serverPath}.url`,
          message: `server.url '${server.url}' is not absolute HTTP(S) URL`
        });
      }
      if (typeof server.description === 'undefined') {
        issues.push({
          file: filePath,
          severity: 'warning',
          code: 'server_description_missing',
          path: `${serverPath}.description`,
          message: 'server.description is recommended'
        });
      }
    }
  }

  if (doc.tags && !Array.isArray(doc.tags)) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'invalid_tags',
      path: '$.tags',
      message: 'tags must be an array if present'
    });
  } else if (Array.isArray(doc.tags)) {
    issues.push(...ensureStringArray(doc.tags, filePath, '$.tags', { minLength: 1 }));
    const seenTags = new Set<string>();
    for (const tagValue of doc.tags) {
      if (typeof tagValue === 'string') {
        const trimmed = tagValue.trim();
        if (!/^[A-Za-z0-9 _-]+$/.test(trimmed) || trimmed.length === 0) {
          issues.push({
            file: filePath,
            severity: 'warning',
            code: 'openapi_tag_shape_warning',
            path: '$.tags',
            message: `tag '${trimmed}' contains unusual characters`
          });
        }
        if (seenTags.has(trimmed)) {
          issues.push({
            file: filePath,
            severity: 'warning',
            code: 'openapi_tag_duplicate',
            path: '$.tags',
            message: `tag '${trimmed}' is duplicated`
          });
        } else {
          seenTags.add(trimmed);
        }
      }
    }
  }

  if (!doc.components) return issues;
  if (!isRecord(doc.components)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'components_invalid',
      path: '$.components',
      message: 'components must be an object'
    });
    return issues;
  }

  if (doc.components.schemas !== undefined && !isRecord(doc.components.schemas)) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'components_schemas_invalid',
      path: '$.components.schemas',
      message: 'components.schemas should be an object'
    });
  }

  if (doc.components.securitySchemes === undefined) {
    return issues;
  }

  if (!isRecord(doc.components.securitySchemes)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'components_security_schemes_invalid',
      path: '$.components.securitySchemes',
      message: 'components.securitySchemes must be an object'
    });
    return issues;
  }

  return issues;
};

const run = async (): Promise<void> => {
  const files = await collectFiles(root, (_, fullPath) => /openapi\.(json|ya?ml)$/i.test(fullPath));
  if (files.length === 0) {
    throw new Error('openapi_no_files');
  }

  const reports: Array<{ file: string; issues: ValidationIssue[] }> = [];

  for (const filePath of files) {
    const document = await readDocument(filePath);
    const issues = validateDocument(filePath, document.data, {
      type: 'object',
      required: ['openapi', 'info', 'paths']
    }, 600);

  const payload = document.data as OpenApiDocument;
  const declaredTags = collectDeclaredTagNames(payload);
  const declaredSecuritySchemes = collectDeclaredSecuritySchemes(payload);
  const declaredParameters = collectDeclaredParameters(payload);

  issues.push(...validateTopLevel(payload, filePath));
  issues.push(...validateSecuritySchemes(payload, filePath));
  issues.push(...collectPathIssues(payload, declaredTags, declaredSecuritySchemes, declaredParameters, filePath));

    if (declaredSecuritySchemes.size === 0 && collectSecurityUsage(payload)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'security_schemes_missing',
        path: '$.components.securitySchemes',
        message: 'operations or root define security but no securitySchemes are declared'
      });
    }

    if (docHasNoSecurityPolicy(payload)) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'security_not_enforced',
        path: '$.security',
        message: 'no security policy is configured for this API contract'
      });
    }

    const relative = filePath.slice(root.endsWith('/') ? root.length : root.length + 1);
    reports.push({
      file: relative,
      issues
    });
  }

  const evidence = collectReport(
    'openapi-contracts',
    reports.map((item) => ({ file: item.file, issues: item.issues }))
  );
  await writeEvidence(join(root, 'ci', 'baselines', 'contracts', 'openapi.validation.json'), evidence);
  failOnIssues('openapi', evidence);
  console.log(`OpenAPI validation passed (${evidence.totalFiles} files).`);
};

const docHasNoSecurityPolicy = (doc: OpenApiDocument): boolean => {
  const hasRootSecurity = Array.isArray(doc.security) && doc.security.length > 0;
  if (hasRootSecurity) return false;

  if (!doc.paths || !isRecord(doc.paths)) return true;
  for (const value of Object.values(doc.paths)) {
    if (!isRecord(value)) continue;
    const operations = Object.values(value).filter((entry): entry is OpenApiOperation => isRecord(entry));
    if (operations.some((operation) => Array.isArray(operation.security) && operation.security.length > 0)) {
      return false;
    }
  }

  return true;
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
