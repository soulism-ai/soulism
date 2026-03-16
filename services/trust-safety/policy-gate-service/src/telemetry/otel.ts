type NoopScope = {
  setAttribute: (name: string, value: string | number | boolean) => void;
  end: () => void;
};

export interface TelemetryClient {
  isEnabled: boolean;
  startSpan: (name: string, metadata?: Record<string, string>) => NoopScope;
  shutdown: () => Promise<void>;
}

export const createTelemetry = (serviceName: string): TelemetryClient => {
  return {
    isEnabled: true,
    startSpan(name: string, metadata: Record<string, string> = {}) {
      return {
        setAttribute: () => undefined,
        end: () => undefined
      };
    },
    async shutdown() {
      serviceName = serviceName || '';
    }
  };
};
