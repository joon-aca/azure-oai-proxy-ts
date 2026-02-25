# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
bun run start        # Run the proxy
bun run dev          # Run with hot-reload (--watch)
bun run src/index.ts # Direct entry point
```

No test runner is configured. Testing is done manually with `curl` against a running proxy instance.

## Architecture

The proxy intercepts OpenAI-format API requests and rewrites them to the appropriate Azure or Anthropic upstream format before forwarding.

**Request flow in `src/handlers/azure.ts`:**
1. Read and buffer the request body once
2. Detect the model from the URL path or JSON body
3. Conditionally convert the body format:
   - Claude models → Anthropic Messages API (`/v1/anthropic/messages`)
   - O-series/Codex → Azure Responses API (`/v1/responses`)
   - Translate `max_tokens` → `max_completion_tokens` for non-legacy models
4. Build upstream URL (`src/proxy/director.ts`) — handles regular Azure, serverless, and Anthropic routing
5. Resolve auth headers — Bearer token vs. `api-key` header depending on target
6. Fetch upstream, then process response (`src/proxy/response.ts`) — converts non-OpenAI responses back to OpenAI format
7. Record metrics via `src/stats.ts`

**Key routing decision points:**
- `src/models/detection.ts` — `isClaudeModel()`, `shouldUseResponsesAPI()`, `isLegacyMaxTokensOnly()`
- `src/proxy/director.ts` — `buildUpstreamTarget()` constructs the final upstream URL and auth
- `src/models/serverless.ts` — serverless endpoint URL builder

**Converters** (`src/converters/`) are pure functions: input format → output format, no side effects.

**Streaming** (`src/streaming/`) uses async generator SSE parsers (`sse-parser.ts`) that feed into format-specific stream transformers. Responses API and Anthropic SSE events are converted chunk-by-chunk to `chat.completion.chunk` format via `ReadableStream`.

**Model mapper** (`src/models/mapper.ts`) contains 180+ static `modelName → azureDeploymentName` entries. Resolution order: exact match → strip date suffix (`-YYYY-MM-DD` / `-YYYYMMDD`) → use as-is.

**Router** (`src/router.ts`) is a simple custom path-pattern matcher (`:param` segments). No framework dependency.

## Configuration

All config is loaded from `.env` (Bun loads it automatically). See `src/config.ts` for the full env var list. Key vars:
- `AZURE_OPENAI_ENDPOINT` — required
- `AZURE_OPENAI_PROXY_MODE` — `azure` (default) or `openai` (passthrough)
- `AZURE_OPENAI_MODEL_MAPPER` — comma-separated `model=deployment` overrides
- `AZURE_AI_STUDIO_DEPLOYMENTS` — serverless model entries (`model=Name:Region`)
- `AZURE_OPENAI_KEY_<MODEL>` — per-model API keys for serverless deployments

## Zero runtime dependencies

Bun provides HTTP server (`Bun.serve`), `fetch`, streaming, and `.env` loading natively. Only `bun-types` is a dev dependency.
