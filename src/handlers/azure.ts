import type { Config, ChatCompletionRequest } from "../types";
import {
  isClaudeModel,
  shouldUseResponsesAPI,
  getModelFromBody,
  getModelFromPath,
} from "../models/detection";
import { convertChatToResponses } from "../converters/chat-to-responses";
import { convertChatToAnthropic } from "../converters/chat-to-anthropic";
import { buildUpstreamTarget, resolveAuth } from "../proxy/director";
import { processUpstreamResponse } from "../proxy/response";

export function createAzureHandler(config: Config) {
  return async (
    req: Request,
    params: Record<string, string>,
  ): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;
    const query = url.search.slice(1); // strip leading '?'

    console.log(`========== NEW REQUEST ==========`);
    console.log(`${req.method} ${path}`);

    // Read body once for model extraction + forwarding
    const contentType = req.headers.get("content-type") ?? "";
    const isJSON = contentType.includes("application/json");
    let bodyBuffer: ArrayBuffer | null = null;
    let bodyObj: ChatCompletionRequest | null = null;

    if (req.body && req.method !== "GET" && req.method !== "HEAD") {
      bodyBuffer = await req.arrayBuffer();
      if (isJSON && bodyBuffer.byteLength > 0) {
        try {
          bodyObj = JSON.parse(
            new TextDecoder().decode(bodyBuffer),
          ) as ChatCompletionRequest;
        } catch {
          // Not JSON, that's fine
        }
      }
    }

    // Determine model
    let model = "";
    if (path.includes("/responses") && bodyObj) {
      model = bodyObj.model ?? "";
    }
    if (!model) {
      model = getModelFromPath(path);
    }
    if (!model && bodyObj) {
      model = bodyObj.model ?? "";
    }
    if (!model && bodyBuffer) {
      model = getModelFromBody(bodyBuffer);
    }

    console.log(`Model: ${model}`);

    // Track the original path for response conversion
    const originalPath = path;
    let effectivePath = path;
    let upstreamBody: string | ArrayBuffer | null = bodyBuffer;

    // Chat completions → Anthropic Messages API (for Claude models)
    if (path === "/v1/chat/completions" && isClaudeModel(model) && bodyObj) {
      console.log(`Converting to Anthropic Messages API for ${model}`);
      const anthropicBody = convertChatToAnthropic(bodyObj, model);
      upstreamBody = JSON.stringify(anthropicBody);
      effectivePath = "/v1/anthropic/messages";
    }
    // Chat completions → Responses API (for o-series, codex, etc.)
    else if (
      path === "/v1/chat/completions" &&
      shouldUseResponsesAPI(model) &&
      bodyObj
    ) {
      console.log(`Converting to Responses API for ${model}`);
      const { converted } = convertChatToResponses(bodyObj);
      upstreamBody = JSON.stringify(converted);
      effectivePath = "/v1/responses";
    }

    // Build upstream target
    const target = buildUpstreamTarget(effectivePath, query, model, config);

    // Resolve auth
    const auth = resolveAuth(req.headers, model, config);

    // For Anthropic via regular Azure, convert api-key to Bearer
    if (target.url.includes("/anthropic/v1/messages")) {
      const apiKey = auth.set["api-key"] ?? "";
      if (apiKey) {
        auth.set["Authorization"] = `Bearer ${apiKey}`;
        delete auth.set["api-key"];
      }
    }

    // Build upstream headers
    const upstreamHeaders = new Headers();
    // Copy relevant headers from incoming request
    for (const [key, value] of req.headers.entries()) {
      const lower = key.toLowerCase();
      // Skip hop-by-hop and host headers
      if (
        lower === "host" ||
        lower === "connection" ||
        lower === "transfer-encoding"
      ) {
        continue;
      }
      upstreamHeaders.set(key, value);
    }

    // Apply auth headers
    for (const h of auth.remove) {
      upstreamHeaders.delete(h);
    }
    for (const [k, v] of Object.entries(auth.set)) {
      upstreamHeaders.set(k, v);
    }

    // Apply target-specific headers
    for (const h of target.removeHeaders) {
      upstreamHeaders.delete(h);
    }
    for (const [k, v] of Object.entries(target.headers)) {
      upstreamHeaders.set(k, v);
    }

    // If we rewrote the body, update content-length and content-type
    if (typeof upstreamBody === "string") {
      upstreamHeaders.set("content-type", "application/json");
      upstreamHeaders.set(
        "content-length",
        new TextEncoder().encode(upstreamBody).byteLength.toString(),
      );
    }

    console.log(`Upstream: ${target.url}`);
    console.log(`=================================`);

    // Fetch upstream
    const upstream = await fetch(target.url, {
      method: req.method,
      headers: upstreamHeaders,
      body:
        req.method === "GET" || req.method === "HEAD" ? undefined : upstreamBody,
    });

    // Process response (convert formats if needed)
    return processUpstreamResponse(upstream, {
      originalPath,
      upstreamUrl: target.url,
      model,
    });
  };
}
