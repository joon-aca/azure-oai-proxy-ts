import type { RouteHandler } from "./types";

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

/**
 * Converts a path pattern like "/v1/files/:file_id/content" into a regex
 * and extracts param names.
 */
function compilePattern(pattern: string): {
  regex: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:([a-zA-Z_]+)/g, (_match, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

export class Router {
  private routes: Route[] = [];
  private fallback: RouteHandler | null = null;

  on(method: string, pattern: string, handler: RouteHandler): void {
    const { regex, paramNames } = compilePattern(pattern);
    this.routes.push({ method: method.toUpperCase(), pattern: regex, paramNames, handler });
  }

  get(pattern: string, handler: RouteHandler): void {
    this.on("GET", pattern, handler);
  }

  post(pattern: string, handler: RouteHandler): void {
    this.on("POST", pattern, handler);
  }

  delete(pattern: string, handler: RouteHandler): void {
    this.on("DELETE", pattern, handler);
  }

  options(pattern: string, handler: RouteHandler): void {
    this.on("OPTIONS", pattern, handler);
  }

  /** Catch-all for any method + any path not matched above */
  any(handler: RouteHandler): void {
    this.fallback = handler;
  }

  match(
    method: string,
    path: string,
  ): { handler: RouteHandler; params: Record<string, string> } | null {
    const upper = method.toUpperCase();
    for (const route of this.routes) {
      if (route.method !== upper) continue;
      const m = path.match(route.pattern);
      if (!m) continue;
      const params: Record<string, string> = {};
      for (let i = 0; i < route.paramNames.length; i++) {
        params[route.paramNames[i]] = m[i + 1];
      }
      return { handler: route.handler, params };
    }
    if (this.fallback) {
      return { handler: this.fallback, params: {} };
    }
    return null;
  }
}
