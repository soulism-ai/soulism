export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface OpenApiOperation {
  summary?: string;
  operationId: string;
  responses: Record<string, { description: string }>;
}

export interface OpenApiPath {
  [method: string]: OpenApiOperation;
}

export interface OpenApiDocument {
  openapi: string;
  info: OpenApiInfo;
  paths: Record<string, OpenApiPath>;
}

export const makeOpenApiDocument = (info: OpenApiInfo, paths: Record<string, OpenApiPath>): OpenApiDocument => ({
  openapi: '3.1.0',
  info,
  paths
});
