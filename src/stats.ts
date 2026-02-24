const LATENCY_WINDOW_SIZE = 1000;
const startedAt = Date.now();

interface ModelStats {
  requests: number;
  errors: number;
  totalLatencyMs: number;
  tokens: { input: number; output: number };
}

export interface RequestTracker {
  finish(status: number, usage?: { input: number; output: number }): void;
}

class Stats {
  private totalRequests = 0;
  private activeRequests = 0;
  private byModel = new Map<string, ModelStats>();
  private byStatus = new Map<number, number>();
  private errorCount = 0;
  private latencies: number[] = [];
  private latencyIndex = 0;
  private latencyFull = false;

  startRequest(model: string): RequestTracker {
    this.totalRequests++;
    this.activeRequests++;
    const start = performance.now();
    let finished = false;

    return {
      finish: (status: number, usage?: { input: number; output: number }) => {
        if (finished) return;
        finished = true;

        const durationMs = performance.now() - start;
        this.activeRequests--;

        // Record latency in rolling window
        if (this.latencies.length < LATENCY_WINDOW_SIZE) {
          this.latencies.push(durationMs);
        } else {
          this.latencies[this.latencyIndex] = durationMs;
        }
        this.latencyIndex = (this.latencyIndex + 1) % LATENCY_WINDOW_SIZE;
        if (this.latencies.length >= LATENCY_WINDOW_SIZE) {
          this.latencyFull = true;
        }

        // By status
        this.byStatus.set(status, (this.byStatus.get(status) ?? 0) + 1);

        // Errors
        const isError = status >= 400;
        if (isError) this.errorCount++;

        // By model
        const key = model || "unknown";
        let ms = this.byModel.get(key);
        if (!ms) {
          ms = { requests: 0, errors: 0, totalLatencyMs: 0, tokens: { input: 0, output: 0 } };
          this.byModel.set(key, ms);
        }
        ms.requests++;
        ms.totalLatencyMs += durationMs;
        if (isError) ms.errors++;
        if (usage) {
          ms.tokens.input += usage.input;
          ms.tokens.output += usage.output;
        }
      },
    };
  }

  toJSON() {
    const byModel: Record<string, {
      requests: number;
      errors: number;
      avgLatencyMs: number;
      tokens: { input: number; output: number };
    }> = {};

    for (const [name, ms] of this.byModel) {
      byModel[name] = {
        requests: ms.requests,
        errors: ms.errors,
        avgLatencyMs: ms.requests > 0 ? Math.round(ms.totalLatencyMs / ms.requests) : 0,
        tokens: { ...ms.tokens },
      };
    }

    const byStatus: Record<string, number> = {};
    for (const [code, count] of this.byStatus) {
      byStatus[String(code)] = count;
    }

    return {
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      totalRequests: this.totalRequests,
      activeRequests: this.activeRequests,
      byModel,
      byStatus,
      latency: this.computeLatency(),
      errors: { total: this.errorCount },
    };
  }

  private computeLatency() {
    if (this.latencies.length === 0) {
      return { avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 };
    }

    const sorted = this.latencies.slice().sort((a, b) => a - b);
    const len = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      avgMs: Math.round(sum / len),
      p50Ms: Math.round(sorted[Math.floor(len * 0.5)]),
      p95Ms: Math.round(sorted[Math.floor(len * 0.95)]),
      p99Ms: Math.round(sorted[Math.floor(len * 0.99)]),
    };
  }
}

export const stats = new Stats();
