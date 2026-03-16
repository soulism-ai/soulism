export interface TelemetryEvent {
  event: string;
  ts: string;
  payload: Record<string, unknown>;
}
