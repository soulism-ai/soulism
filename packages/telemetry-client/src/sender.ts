import { TelemetryEvent } from './events.js';

export const emitTelemetry = async (
  endpoint: string,
  event: TelemetryEvent
): Promise<void> => {
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event)
  });
};
