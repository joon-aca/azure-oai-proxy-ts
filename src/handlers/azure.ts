import type { Config, ChatCompletionRequest } from "../types";
import {
  isClaudeModel,
  shouldUseResponsesAPI,
  isLegacyMaxTokensOnly,
  getModelFromBody,
  getModelFromPath,
} from "../models/detection";
import { convertChatToResponses } from "../converters/chat-to-responses";
import { convertChatToAnthropic } from "../converters/chat-to-anthropic";
import { buildUpstreamTarget, resolveAuth } from "../proxy/director";
import { processUpstreamResponse } from "../proxy/response";
import { stats } from "../stats";

const DEBUG = !!process.env.DEBUG_LOG;

const VALID_ROLES = new Set(["system", "user", "assistant", "tool"]);

// Map non-standard message roles to the closest valid OpenAI/Azure equivalent.
// Keyed case-insensitively (we lowercase before lookup).
const ROLE_MAP: Record<string, string> = {
  // OpenAI reasoning models (o1/o3/o4) send "developer" as a system-level role
  developer: "system",
  // OpenAI legacy function-calling role, deprecated in favor of "tool"
  function: "tool",
  // Google Gemini uses "model" instead of "assistant"
  model: "assistant",
  // Cohere v1 API uses uppercase role names
  chatbot: "assistant",
  // Meta Llama 3.x uses "ipython" for tool results
  ipython: "tool",
  // ShareGPT / fine-tuning dataset conventions
  human: "user",
  gpt: "assistant",
  bot: "assistant",
};

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

    // Normalize non-standard message roles to ones Azure accepts.
    // Handles cross-API conventions (developer, function, model, ipython, etc.)
    // and prevents 422 schema-validation errors upstream.
    if (bodyObj?.messages) {
      let rolesChanged = false;
      const normalized = bodyObj.messages.map((msg) => {
        if (VALID_ROLES.has(msg.role)) return msg;
        const mapped = ROLE_MAP[msg.role.toLowerCase()] ?? "user";
        console.log(`Normalizing role "${msg.role}" → "${mapped}"`);
        rolesChanged = true;
        return { ...msg, role: mapped };
      });
      if (rolesChanged) {
        bodyObj = { ...bodyObj, messages: normalized };
        upstreamBody = JSON.stringify(bodyObj);
      }
    }

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

    // Translate max_tokens → max_completion_tokens for non-legacy models.
    // Newer Azure models (gpt-4o+, gpt-5, o-series) require max_completion_tokens;
    // only legacy models (gpt-3.5, gpt-4 turbo) still need max_tokens.
    if (
      bodyObj &&
      effectivePath === originalPath &&
      !isLegacyMaxTokensOnly(model) &&
      "max_tokens" in bodyObj
    ) {
      const { max_tokens, ...rest } = bodyObj as ChatCompletionRequest & { max_tokens?: number };
      console.log(`Translating max_tokens=${max_tokens} → max_completion_tokens`);
      const translated = { ...rest, max_completion_tokens: max_tokens };
      upstreamBody = JSON.stringify(translated);
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
    if (DEBUG && upstreamBody) {
      const bodyStr = typeof upstreamBody === "string"
        ? upstreamBody
        : new TextDecoder().decode(upstreamBody);
      console.log(`>>> Request body: ${bodyStr}`);
    }
    console.log(`=================================`);

    const tracker = stats.startRequest(model);

    // Fetch upstream
    let upstream: Response;
    try {
      upstream = await fetch(target.url, {
        method: req.method,
        headers: upstreamHeaders,
        body:
          req.method === "GET" || req.method === "HEAD" ? undefined : upstreamBody,
      });
    } catch (err) {
      tracker.finish(502);
      throw err;
    }

    // Process response (convert formats if needed)
    const response = await processUpstreamResponse(upstream, {
      originalPath,
      upstreamUrl: target.url,
      model,
    });

    // Log the request body that triggered an error for diagnostics
    if (response.status >= 400 && upstreamBody) {
      const reqStr = typeof upstreamBody === "string"
        ? upstreamBody
        : new TextDecoder().decode(upstreamBody);
      console.error(`>>> Rejected request body: ${reqStr}`);
    }

    // Extract token usage from non-streaming JSON responses
    const respCT = response.headers.get("content-type") ?? "";
    if (respCT.includes("application/json") && response.body) {
      const cloned = response.clone();
      try {
        const body = await cloned.json() as Record<string, unknown>;
        if (DEBUG) {
          console.log(`<<< Response (${response.status}): ${JSON.stringify(body)}`);
        }
        const usage = body.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        if (usage) {
          tracker.finish(response.status, {
            input: usage.prompt_tokens ?? 0,
            output: usage.completion_tokens ?? 0,
          });
        } else {
          tracker.finish(response.status);
        }
      } catch {
        tracker.finish(response.status);
      }
    } else {
      if (DEBUG) {
        const isStream = respCT.includes("text/event-stream");
        console.log(`<<< Response (${response.status}): ${isStream ? "[SSE stream]" : `[${respCT}]`}`);
      }
      tracker.finish(response.status);
    }

    return response;
  };
}
