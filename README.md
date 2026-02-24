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

To run the proxy as a persistent service that starts on boot:

```sh
# Create the service file (adjust paths if your bun or project are elsewhere)
sudo tee /etc/systemd/system/azure-oai-proxy.service > /dev/null << 'EOF'
[Unit]
Description=Azure OpenAI Proxy (TypeScript/Bun)
After=network.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/azure-oai-proxy-ts
ExecStart=/home/ubuntu/.bun/bin/bun run src/index.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable (start on boot) and start now
sudo systemctl daemon-reload
sudo systemctl enable azure-oai-proxy
sudo systemctl start azure-oai-proxy
```

Check status and logs:

```sh
sudo systemctl status azure-oai-proxy
sudo journalctl -u azure-oai-proxy -f
```

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
| `AZURE_OPENAI_APIVERSION` | `2024-08-01-preview` | API version for general operations |
| `AZURE_OPENAI_MODELS_APIVERSION` | `2024-10-21` | API version for `/v1/models` |
| `AZURE_OPENAI_RESPONSES_APIVERSION` | `2024-08-01-preview` | API version for Responses API |
| `ANTHROPIC_APIVERSION` | `2023-06-01` | Anthropic API version for Claude |
| `AZURE_OPENAI_MODEL_MAPPER` | | Comma-separated `model=deployment` overrides |
| `AZURE_AI_STUDIO_DEPLOYMENTS` | | Comma-separated `model=Name:Region` serverless entries |
| `AZURE_OPENAI_KEY_*` | | Per-model serverless API keys (uppercase model name) |
| `OPENAI_API_ENDPOINT` | `https://api.openai.com` | Upstream for `openai` proxy mode |

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
src/
├── index.ts              # Entry point: Bun.serve(), route registration
├── config.ts             # Env var loading, model mapper merge
├── router.ts             # Method + path pattern matching
├── stats.ts              # In-memory metrics (requests, latency, tokens)
├── types.ts              # TypeScript interfaces
├── handlers/
│   ├── azure.ts          # Core: detect → convert → fetch → respond
│   ├── openai.ts         # Passthrough proxy to OpenAI
│   ├── models.ts         # GET /v1/models
│   ├── health.ts         # GET /healthz
│   └── cors.ts           # OPTIONS preflight
├── proxy/
│   ├── director.ts       # URL rewriting + auth headers
│   └── response.ts       # Response conversion dispatch
├── converters/
│   ├── chat-to-responses.ts
│   ├── chat-to-anthropic.ts
│   ├── responses-to-chat.ts
│   └── anthropic-to-chat.ts
├── streaming/
│   ├── sse-parser.ts     # Async generator SSE parser
│   ├── responses-stream.ts
│   └── anthropic-stream.ts
└── models/
    ├── mapper.ts         # 180+ model→deployment map
    ├── detection.ts      # isClaudeModel(), shouldUseResponsesAPI()
    └── serverless.ts     # Serverless URL builder
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
