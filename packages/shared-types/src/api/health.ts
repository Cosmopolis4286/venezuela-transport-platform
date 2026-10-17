export type HealthStatus = 'ok' | 'degraded' | 'down';

/** `GET /api/v1/health` — liveness: the process is up and serving requests. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  /** Seconds since the process started. */
  uptime: number;
  timestamp: string;
}

/** `GET /api/v1/health/ready` — readiness: dependencies are reachable. */
export interface ReadinessResponse {
  status: HealthStatus;
  checks: Record<string, { status: HealthStatus; latencyMs?: number }>;
  timestamp: string;
}
