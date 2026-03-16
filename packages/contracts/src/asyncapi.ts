export interface AsyncApiChannel {
  publish?: { operationId: string };
  subscribe?: { operationId: string };
}

export interface AsyncApiDocument {
  asyncapi: string;
  info: { title: string; version: string };
  channels: Record<string, AsyncApiChannel>;
}

export const makeAsyncApiDocument = (info: { title: string; version: string }, channels: Record<string, AsyncApiChannel>): AsyncApiDocument => ({
  asyncapi: '3.0.0',
  info,
  channels
});
