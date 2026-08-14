/**
 * Minimal in-process request/error counters for the system-health view.
 * Deliberately not a metrics backend: no PII, no per-route cardinality,
 * reset whenever the process restarts.
 */
interface Metrics {
  startedAt: Date;
  requests: number;
  clientErrors: number;
  serverErrors: number;
  lastServerErrorAt: Date | null;
}

const metrics: Metrics = {
  startedAt: new Date(),
  requests: 0,
  clientErrors: 0,
  serverErrors: 0,
  lastServerErrorAt: null,
};

export const countRequest = (): void => {
  metrics.requests += 1;
};

export const countResponse = (statusCode: number): void => {
  if (statusCode >= 500) {
    metrics.serverErrors += 1;
    metrics.lastServerErrorAt = new Date();
  } else if (statusCode >= 400) {
    metrics.clientErrors += 1;
  }
};

export const readMetrics = (): Metrics => ({ ...metrics });
