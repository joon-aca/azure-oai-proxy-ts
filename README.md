# Azure OpenAI Proxy (TypeScript/Bun)

A lightweight, zero-dependency proxy server that translates OpenAI-format API requests to Azure OpenAI, Azure Responses API, and Anthropic Messages API formats. Built on [Bun](https://bun.sh) with native `Bun.serve()` and Web Streams.

> **Based on [gyarbij/azure-oai-proxy](https://github.com/Gyarbij/azure-oai-proxy)** — a full TypeScript rewrite of the original Go implementation. All credit for the proxy design, model mappings, and API routing logic goes to the original project.

## Key Features

- **API Compatibility** — Translates OpenAI API requests to Azure OpenAI format on-the-fly
- **Reasoning Model Support** — O1/O3/O4 series auto-route through Azure Responses API
- **Claude Support** — Claude models auto-route through Anthropic Messages API on Azure Foundry
- **Streaming** — SSE format conversion via Web Streams API (Responses API and Anthropic to OpenAI `chat.completion.chunk`)
- **180+ Model Mappings** — Comprehensive failsafe map from OpenAI model names to Azure deployment names
- **Serverless Deployments** — Azure AI Studio serverless endpoints with per-model auth
- **Per-Model API Versioning** — Editable JSON lookup table maps model prefixes to the correct Azure `api-version`
- **Zero Dependencies** — Bun provides HTTP server, fetch, streaming, and .env loading natively
- **OpenAI Passthrough** — Optional mode to proxy directly to OpenAI API

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+

### Install & Run

```sh
# Clone and enter directory
cd azure-oai-proxy-ts

# Copy and configure environment
cp example.env .env
# Edit .env with your Azure endpoint and API key

# Start the server
bun run start
```

The proxy listens on `0.0.0.0:11437` by default.

### Run as a systemd Service

The repo includes `install.sh` and a pre-configured `azure-oai-proxy.service` unit file. To install and enable:

```sh
bun run install:service       # or: bash install.sh
sudo systemctl start azure-oai-proxy
```

Check status and logs:

```sh
systemctl status azure-oai-proxy
journalctl -u azure-oai-proxy -f
```

The unit file lives at `azure-oai-proxy.service` in the project root. Edit it there and re-run `install.sh` if you need to change the service definition (e.g. different user or bun path).

### Verify

```sh
# Health check
curl http://localhost:11437/healthz
# => {"status":"healthy"}

# Stats
curl http://localhost:11437/stats
# => {"uptime":3600,"totalRequests":1234,"activeRequests":2,...}

# List models
curl http://localhost:11437/v1/models \
  -H "Authorization: Bearer YOUR_AZURE_API_KEY"

# Chat completion
curl http://localhost:11437/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AZURE_API_KEY" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello!"}]}'
```

## Configuration

All configuration is via environment variables (loaded from `.env` by Bun automatically).

| Variable | Default | Description |
|:---|:---|:---|
| `AZURE_OPENAI_ENDPOINT` | *(required)* | Azure OpenAI resource endpoint |
| `AZURE_OPENAI_API_KEY` | | Default API key (used when no key in request headers) |
| `AZURE_OPENAI_PROXY_ADDRESS` | `0.0.0.0:11437` | Listen address |
| `AZURE_OPENAI_PROXY_MODE` | `azure` | `azure` or `openai` (passthrough) |
| `AZURE_OPENAI_APIVERSION` | `2024-08-01-preview` | Fallback API version for chat/completions (used when model isn't in `api-versions.json`) |
| `AZURE_OPENAI_MODELS_APIVERSION` | `2024-10-21` | API version for `/v1/models` |
| `AZURE_OPENAI_RESPONSES_APIVERSION` | `2024-08-01-preview` | Fallback API version for Responses API (used when model isn't in `api-versions.json`) |
| `ANTHROPIC_APIVERSION` | `2023-06-01` | Anthropic API version for Claude |
| `AZURE_OPENAI_MODEL_MAPPER` | | Comma-separated `model=deployment` overrides |
| `AZURE_OPENAI_ENDPOINT_MAP` | | Comma-separated `model=endpoint:key` per-model endpoint overrides |
| `AZURE_AI_STUDIO_DEPLOYMENTS` | | Comma-separated `model=Name:Region` serverless entries |
| `AZURE_OPENAI_KEY_*` | | Per-model serverless API keys (uppercase model name) |
| `OPENAI_API_ENDPOINT` | `https://api.openai.com` | Upstream for `openai` proxy mode |

### API Version Routing

The proxy resolves the Azure `api-version` per-model using the lookup table in [`api-versions.json`](api-versions.json). The table uses case-insensitive prefix matching — e.g. a request for `gpt-4o-2024-11-20` matches the `gpt-4o` row. If no prefix matches, the env var fallback is used.

**Chat completions** (`/v1/chat/completions`, embeddings, audio, images, etc.):

| Model prefix | API version |
|:---|:---|
| `gpt-5.2` | `2025-04-01-preview` |
| `gpt-5.1` | `2025-04-01-preview` |
| `gpt-5-mini` | `2024-12-01-preview` |
| `gpt-5` | `2025-04-01-preview` |
| `gpt-4.1` | `2025-04-01-preview` |
| `gpt-4o-audio` | `2025-01-01-preview` |
| `gpt-4o` | `2024-10-21` |
| `gpt-4-turbo` | `2024-05-01-preview` |
| `gpt-4` | `2024-02-01` |
| `gpt-3.5` | `2024-02-01` |
| `Kimi-K2.5` | `2025-01-01-preview` |
| *(no match)* | `AZURE_OPENAI_APIVERSION` fallback |

**Responses API** (`/v1/responses`, o-series auto-routed):

| Model prefix | API version |
|:---|:---|
| `o4` | `2025-04-01-preview` |
| `o3` | `2025-04-01-preview` |
| `codex` | `2025-04-01-preview` |
| `computer-use` | `2025-04-01-preview` |
| `o1` | `2025-03-01-preview` |
| *(no match)* | `AZURE_OPENAI_RESPONSES_APIVERSION` fallback |

**Other routes:**

| Route | Version source |
|:---|:---|
| `GET /v1/models` | `AZURE_OPENAI_MODELS_APIVERSION` (default `2024-10-21`) |
| Anthropic/Claude | `ANTHROPIC_APIVERSION` (default `2023-06-01`) sent as `anthropic-version` header — no `api-version` param |

To change a version, edit `api-versions.json` and restart the proxy. No code changes needed.

### Model Mapper

User-defined mappings in `AZURE_OPENAI_MODEL_MAPPER` override the built-in defaults:

```sh
AZURE_OPENAI_MODEL_MAPPER=gpt-4=my-gpt4-deployment,claude-sonnet-4.5=Claude-Sonnet-45-Custom
```

The proxy resolves models in order: exact match, strip date suffix (`-YYYY-MM-DD` / `-YYYYMMDD`), then use as-is.

### Serverless Deployments

```sh
AZURE_AI_STUDIO_DEPLOYMENTS=mistral-large-2407=Mistral-large2:swedencentral
AZURE_OPENAI_KEY_MISTRAL-LARGE-2407=your-serverless-key
```

Serverless models are served from `https://{Name}.{Region}.models.ai.azure.com` with Bearer token auth.

### Per-Model Endpoint Overrides

Route specific models to a different Azure OpenAI resource (e.g. a model deployed on a separate Azure AI resource):

```sh
AZURE_OPENAI_ENDPOINT_MAP=kimi-k2.5=https://my-other-resource.services.ai.azure.com/
```

The format is `model=endpoint:key` where `:key` is optional. Without a key, the default auth (from the request headers or `AZURE_OPENAI_API_KEY`) is used. Multiple entries are comma-separated.

## Supported APIs

| Path | Method | Notes |
|:---|:---|:---|
| `/healthz` | GET | Health check |
| `/stats` | GET | In-memory request metrics (counts, latency, token usage) |
| `/v1/models` | GET | Lists deployed models + serverless deployments |
| `/v1/chat/completions` | POST | Auto-routes to Responses API or Anthropic as needed |
| `/v1/completions` | POST | |
| `/v1/embeddings` | POST | |
| `/v1/images/generations` | POST | |
| `/v1/audio/speech` | POST | |
| `/v1/audio/voices` | GET | |
| `/v1/audio/transcriptions` | POST | |
| `/v1/audio/translations` | POST | |
| `/v1/responses` | POST | Direct Responses API access |
| `/v1/responses/:id` | GET/DELETE | Retrieve or delete a response |
| `/v1/responses/:id/cancel` | POST | Cancel a response |
| `/v1/responses/:id/input_items` | GET | List input items |
| `/v1/files` | GET/POST | File management |
| `/v1/files/:id` | GET/DELETE | |
| `/v1/files/:id/content` | GET | |
| `/v1/fine_tunes` | GET/POST | Fine-tuning operations |
| `/v1/fine_tunes/:id` | GET | |
| `/v1/fine_tunes/:id/cancel` | POST | |
| `/v1/fine_tunes/:id/events` | GET | |
| `/deployments` | GET | |
| `/deployments/:id` | GET | |
| `/v1/models/:id/capabilities` | GET | |

## Stats Endpoint

`GET /stats` returns a live JSON snapshot of proxy metrics since last restart. No auth required.

```json
{
  "uptime": 3600,
  "totalRequests": 1234,
  "activeRequests": 2,
  "byModel": {
    "gpt-4o": { "requests": 800, "errors": 2, "avgLatencyMs": 750, "tokens": { "input": 80000, "output": 40000 } },
    "claude-sonnet-4-6": { "requests": 200, "errors": 0, "avgLatencyMs": 1200, "tokens": { "input": 30000, "output": 15000 } }
  },
  "byStatus": { "200": 1225, "400": 5, "502": 2 },
  "latency": { "avgMs": 920, "p50Ms": 800, "p95Ms": 2100, "p99Ms": 4500 },
  "errors": { "total": 7 }
}
```

- Latency percentiles are computed over a rolling window of the last 1000 requests.
- Token usage is extracted from non-streaming JSON responses only (streaming responses don't buffer the body).
- Stats reset on restart (in-memory only).

## Automatic API Routing

The proxy inspects the `model` field and routes intelligently:

### Chat Completions API (default)
GPT-5.x, GPT-4.x, GPT-4o, GPT-3.5, Phi models — routed to `/openai/deployments/{deployment}/chat/completions`.

### Responses API (auto-detected)
O-series (o1, o3, o4), Codex, GPT-5-Pro, computer-use-preview — converted from chat completions format to Responses API (`/openai/v1/responses`). Streaming events are converted back to `chat.completion.chunk` format.

### Anthropic Messages API (auto-detected)
Claude models (opus, sonnet, haiku) — converted to Anthropic Messages format (`/anthropic/v1/messages`). System messages are extracted into the `system` parameter. Streaming and non-streaming responses are converted back to OpenAI format.

### `max_tokens` → `max_completion_tokens` translation
Newer Azure models (GPT-4o+, GPT-5, o-series) require `max_completion_tokens` and reject `max_tokens`. The proxy automatically rewrites the field when the model is not in the legacy set. Legacy models (exact `gpt-4`, `gpt-3.5-*`, `gpt-4-*` turbo variants) keep `max_tokens` unchanged.

## Usage Examples

### Standard Chat Completion
```sh
curl http://localhost:11437/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello!"}]}'
```

### Reasoning Model (auto-routes to Responses API)
```sh
curl http://localhost:11437/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"model":"o3","messages":[{"role":"user","content":"Solve this..."}],"stream":true}'
```

### Claude Model (auto-routes to Anthropic API)
```sh
curl http://localhost:11437/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"model":"claude-sonnet-4.5","messages":[{"role":"user","content":"Explain quantum computing"}],"max_tokens":1000}'
```

### Direct Responses API
```sh
curl http://localhost:11437/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"model":"o3-pro","input":"What are the implications of quantum computing?"}'
```

### Streaming with SSE Conversion
```sh
curl --no-buffer http://localhost:11437/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"model":"o4-mini","messages":[{"role":"user","content":"Think step by step..."}],"stream":true}'
```

## Model Mappings

The proxy includes 180+ built-in mappings. Notable non-trivial ones:

| OpenAI Model | Azure Deployment |
|:---|:---|
| `gpt-4` | `gpt-4-0613` |
| `gpt-4-32k` | `gpt-4-32k-0613` |
| `gpt-3.5-turbo` | `gpt-35-turbo-0613` |
| `gpt-3.5-turbo-16k` | `gpt-35-turbo-16k-0613` |
| `text-embedding-3-small` | `text-embedding-3-small-1` |
| `text-embedding-3-large` | `text-embedding-3-large-1` |
| `dall-e-2` | `dall-e-2-2.0` |
| `dall-e-3` | `dall-e-3-3.0` |
| `tts` | `tts-001` |
| `whisper` | `whisper-001` |
| `claude-opus-4-5` | `claude-opus-4.5` |
| `claude-sonnet-4-5` | `claude-sonnet-4.5` |
| `claude-haiku-4-5` | `claude-haiku-4.5` |

Most modern models (GPT-5.x, GPT-4.1, O-series, etc.) map to themselves. The full list is in [`src/models/mapper.ts`](src/models/mapper.ts).

## Architecture

```
Client Request (OpenAI format)
  │
  ├─ Model Detection (from body or path)
  │
  ├─ Format Conversion (if needed)
  │   ├─ Claude → Anthropic Messages API
  │   └─ O-series/Codex → Responses API
  │
  ├─ Auth Resolution
  │   ├─ Regular Azure: api-key header
  │   ├─ Serverless: Bearer token
  │   └─ Anthropic: Bearer token + anthropic-version
  │
  ├─ API Version Resolution (from api-versions.json, prefix match → fallback)
  │
  ├─ URL Rewriting
  │   ├─ Regular: /openai/deployments/{name}/...?api-version=...
  │   ├─ Responses: /openai/v1/responses?api-version=...
  │   ├─ Anthropic: /anthropic/v1/messages (no api-version)
  │   └─ Serverless: https://{name}.{region}.models.ai.azure.com/...
  │
  └─ Response Processing
      ├─ Non-streaming: JSON body conversion
      └─ Streaming: SSE event-by-event conversion via Web Streams
```

## Project Structure

```
api-versions.json            # Per-model API version lookup table (edit to change versions)
azure-oai-proxy.service      # systemd unit file
install.sh                   # Installs and enables the systemd service
src/
├── index.ts                 # Entry point: Bun.serve(), route registration
├── config.ts                # Env var loading, model mapper merge
├── router.ts                # Method + path pattern matching
├── stats.ts                 # In-memory metrics (requests, latency, tokens)
├── types.ts                 # TypeScript interfaces
├── handlers/
│   ├── azure.ts             # Core: detect → convert → fetch → respond
│   ├── openai.ts            # Passthrough proxy to OpenAI
│   ├── models.ts            # GET /v1/models
│   ├── health.ts            # GET /healthz
│   └── cors.ts              # OPTIONS preflight
├── proxy/
│   ├── director.ts          # URL rewriting + auth headers + api-version resolution
│   └── response.ts          # Response conversion dispatch
├── converters/
│   ├── chat-to-responses.ts
│   ├── chat-to-anthropic.ts
│   ├── responses-to-chat.ts
│   └── anthropic-to-chat.ts
├── streaming/
│   ├── sse-parser.ts        # Async generator SSE parser
│   ├── responses-stream.ts
│   └── anthropic-stream.ts
└── models/
    ├── api-versions.ts      # Per-model api-version resolution from api-versions.json
    ├── mapper.ts            # 180+ model→deployment map
    ├── detection.ts         # isClaudeModel(), shouldUseResponsesAPI()
    └── serverless.ts        # Serverless URL builder
```

## Networking & Deployment

### Scenario 1: Private Subnet

If your client machines and the proxy are on the same private network (e.g., `10.0.1.0/24`), no extra setup is needed. The proxy binds to `0.0.0.0:11437` by default and is reachable directly.

### Scenario 2: Cross-Provider Access via Tailscale

When the proxy and your client (e.g., a prod server) are on different providers and can't reach each other directly, [Tailscale](https://tailscale.com) is the simplest secure option. It creates an encrypted WireGuard overlay network between your machines — no ports exposed to the public internet, no TLS certs to manage, no VPN config files.

**On the proxy machine:**

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

**On the client machine (prod server):**

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

**Find the proxy's tailnet address:**

After `tailscale up`, run this on the proxy machine to get its tailnet IP and hostname:

```sh
tailscale status
```

This prints a table like:

```
100.64.0.1   proxy-machine   user@   linux   -
100.64.0.2   prod-server     user@   linux   -
```

The first column is the tailnet IP, the second is the machine name. You can reach the proxy using either:

```sh
# By tailnet IP
curl http://100.64.0.1:11437/healthz

# By tailnet hostname (MagicDNS — enabled by default)
curl http://proxy-machine:11437/healthz
```

Alternatively, `tailscale ip -4` on the proxy machine prints just the IPv4 tailnet address.

**Lock down the firewall (recommended):**

Once Tailscale is working, block port 11437 from the public internet so the proxy is only reachable over the tailnet:

```sh
# Example: ufw
sudo ufw deny in on eth0 to any port 11437
sudo ufw allow in on tailscale0 to any port 11437
```

**Optional: Tailscale ACLs**

You can restrict which tailnet machines can reach the proxy by adding [ACL rules](https://tailscale.com/kb/1018/acls) in the Tailscale admin console.

## Differences from the Go Version

- **Runtime**: Bun instead of Go + Gin
- **Proxy approach**: `fetch()` instead of `httputil.ReverseProxy` — gives full control over request/response transformation
- **Streaming**: Web Streams API (`ReadableStream` + async generators) instead of `io.Pipe` + goroutines
- **Dependencies**: Zero runtime deps (Bun provides everything) vs. Gin + gjson + godotenv
- **JSON handling**: Native `JSON.parse`/`JSON.stringify` instead of gjson

## License

This project is licensed under the MIT License.

## Acknowledgments

This is a TypeScript port of [gyarbij/azure-oai-proxy](https://github.com/Gyarbij/azure-oai-proxy) by [@Gyarbij](https://github.com/Gyarbij). The original Go implementation provides the proxy design, routing logic, model mappings, and API conversion strategies that this port faithfully reproduces.
