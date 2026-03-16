export type McpToolSchema = {
  name: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
};

export type McpManifest = {
  service: string;
  version: string;
  tools: McpToolSchema[];
};

export const defineMcpManifest = (service: string, version: string, tools: McpToolSchema[]): McpManifest => ({
  service,
  version,
  tools
});
