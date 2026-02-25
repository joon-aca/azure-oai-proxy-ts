import type { Config, ServerlessDeployment } from "../types";
import { resolveModelDeployment } from "../models/mapper";
import { buildServerlessUrl } from "../models/serverless";
import { resolveChatApiVersion, resolveResponsesApiVersion } from "../models/api-versions";

export interface UpstreamTarget {
  url: string;
  headers: Record<string, string>;
  /** Headers to remove from the forwarded request */
  removeHeaders: string[];
}

/**
 * Determines the upstream URL and auth headers for a given request path + model.
 */
export function buildUpstreamTarget(
  path: string,
  query: string,
  model: string,
  config: Config,
): UpstreamTarget {
  const modelLower = model.toLowerCase();
  const serverless = config.serverlessDeployments[modelLower];

  if (serverless) {
    return buildServerlessTarget(path, query, serverless);
  }

  return buildRegularTarget(path, query, model, config);
}

function buildServerlessTarget(
  path: string,
  query: string,
  info: ServerlessDeployment,
): UpstreamTarget {
  const base = buildServerlessUrl(info);
  const qs = query ? `?${query}` : "";
  return {
    url: `${base}${path}${qs}`,
    headers: { Authorization: `Bearer ${info.key}` },
    removeHeaders: ["api-key"],
  };
}

function buildRegularTarget(
  path: string,
  query: string,
  model: string,
  config: Config,
): UpstreamTarget {
  const endpoint = config.azureEndpoint.replace(/\/$/, "");
  const deployment = resolveModelDeployment(model, config.modelMapper);
  const headers: Record<string, string> = {};
  const removeHeaders: string[] = [];

  let targetPath: string;
  let apiVersion: string | null = resolveChatApiVersion(model, config.apiVersion);

  // Responses API endpoints
  if (path.includes("/v1/responses")) {
    if (path === "/v1/responses") {
      targetPath = "/openai/v1/responses";
    } else {
      targetPath = path.replace("/v1/", "/openai/v1/");
    }
    apiVersion = resolveResponsesApiVersion(model, config.responsesApiVersion);
  } else if (path.startsWith("/v1/anthropic/messages")) {
    // Anthropic Messages API (Claude models)
    targetPath = "/anthropic/v1/messages";
    headers["anthropic-version"] = config.anthropicApiVersion;
    apiVersion = null; // No api-version for Anthropic
  } else if (path.startsWith("/v1/chat/completions")) {
    targetPath = `/openai/deployments/${deployment}/chat/completions`;
  } else if (path.startsWith("/v1/completions")) {
    targetPath = `/openai/deployments/${deployment}/completions`;
  } else if (path.startsWith("/v1/embeddings")) {
    targetPath = `/openai/deployments/${deployment}/embeddings`;
  } else if (path.startsWith("/v1/images/generations")) {
    targetPath = `/openai/deployments/${deployment}/images/generations`;
  } else if (path.startsWith("/v1/audio/")) {
    const audioPath = path.slice("/v1/".length);
    targetPath = `/openai/deployments/${deployment}/${audioPath}`;
  } else if (path.startsWith("/v1/files")) {
    targetPath = path.replace("/v1/", "/openai/");
  } else {
    targetPath = `/openai/deployments/${deployment}/${path.slice("/v1/".length)}`;
  }

  // Build query string
  const params = new URLSearchParams(query);
  if (apiVersion) {
    params.set("api-version", apiVersion);
  }
  const qs = params.toString();

  // Auth: for Anthropic, use Bearer; for others, use api-key
  if (targetPath.includes("/anthropic/v1/messages")) {
    removeHeaders.push("api-key");
    // Authorization Bearer is already set by resolveAuth
  }

  const url = `${endpoint}${targetPath}${qs ? `?${qs}` : ""}`;

  console.log(`Upstream URL: ${url}`);

  return { url, headers, removeHeaders };
}

/**
 * Resolves the API key from the incoming request into the correct auth header format.
 * Returns headers to set and headers to remove.
 */
export function resolveAuth(
  incomingHeaders: Headers,
  model: string,
  config: Config,
): { set: Record<string, string>; remove: string[] } {
  const modelLower = model.toLowerCase();
  const serverless = config.serverlessDeployments[modelLower];

  if (serverless) {
    return {
      set: { Authorization: `Bearer ${serverless.key}` },
      remove: ["api-key"],
    };
  }

  // Regular Azure: extract key and set as api-key
  let apiKey = incomingHeaders.get("api-key") ?? "";
  if (!apiKey) {
    const auth = incomingHeaders.get("authorization") ?? "";
    if (auth.startsWith("Bearer ")) {
      apiKey = auth.slice(7);
    }
  }

  if (!apiKey) {
    // Fall back to configured key
    apiKey = config.apiKey;
  }

  return {
    set: { "api-key": apiKey },
    remove: ["authorization"],
  };
}
