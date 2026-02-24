import { loadConfig } from "./config";
import { Router } from "./router";
import { handleHealth } from "./handlers/health";
import { handleOptions } from "./handlers/cors";
import { createModelsHandler } from "./handlers/models";
import { createAzureHandler } from "./handlers/azure";
import { createOpenAIHandler } from "./handlers/openai";

const config = loadConfig();
const router = new Router();

if (config.proxyMode === "azure") {
  const azureHandler = createAzureHandler(config);
  const modelsHandler = createModelsHandler(config);

  // Health
  router.get("/healthz", () => handleHealth());

  // Models
  router.get("/v1/models", modelsHandler);

  // CORS preflight — match any /v1/* OPTIONS
  router.options("/v1/:rest", (req) => handleOptions());

  // Chat / completions / embeddings
  router.post("/v1/chat/completions", azureHandler);
  router.post("/v1/completions", azureHandler);
  router.post("/v1/embeddings", azureHandler);

  // Images
  router.post("/v1/images/generations", azureHandler);

  // Audio
  router.post("/v1/audio/speech", azureHandler);
  router.get("/v1/audio/voices", azureHandler);
  router.post("/v1/audio/transcriptions", azureHandler);
  router.post("/v1/audio/translations", azureHandler);

  // Fine-tunes
  router.post("/v1/fine_tunes", azureHandler);
  router.get("/v1/fine_tunes", azureHandler);
  router.get("/v1/fine_tunes/:fine_tune_id", azureHandler);
  router.post("/v1/fine_tunes/:fine_tune_id/cancel", azureHandler);
  router.get("/v1/fine_tunes/:fine_tune_id/events", azureHandler);

  // Files
  router.post("/v1/files", azureHandler);
  router.get("/v1/files", azureHandler);
  router.delete("/v1/files/:file_id", azureHandler);
  router.get("/v1/files/:file_id", azureHandler);
  router.get("/v1/files/:file_id/content", azureHandler);

  // Deployments
  router.get("/deployments", azureHandler);
  router.get("/deployments/:deployment_id", azureHandler);
  router.get("/v1/models/:model_id/capabilities", azureHandler);

  // Responses API
  router.post("/v1/responses", azureHandler);
  router.get("/v1/responses/:response_id", azureHandler);
  router.delete("/v1/responses/:response_id", azureHandler);
  router.post("/v1/responses/:response_id/cancel", azureHandler);
  router.get("/v1/responses/:response_id/input_items", azureHandler);
} else {
  // OpenAI passthrough mode
  const openaiHandler = createOpenAIHandler(config);
  router.get("/healthz", () => handleHealth());
  router.any(openaiHandler);
}

// Parse address into host + port
const [host, portStr] = config.address.includes(":")
  ? config.address.split(":")
  : ["0.0.0.0", config.address];
const port = parseInt(portStr, 10);

const server = Bun.serve({
  hostname: host,
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // Handle OPTIONS for any path (CORS preflight)
    if (req.method === "OPTIONS") {
      return handleOptions();
    }

    const match = router.match(req.method, url.pathname);
    if (!match) {
      return Response.json(
        { error: { message: "Not found", type: "invalid_request_error" } },
        { status: 404 },
      );
    }

    try {
      return await match.handler(req, match.params);
    } catch (err) {
      console.error(`Handler error: ${err}`);
      return Response.json(
        {
          error: {
            message: "Internal proxy error",
            type: "proxy_error",
            code: "internal_error",
          },
        },
        { status: 502 },
      );
    }
  },
});

console.log(
  `Azure OpenAI Proxy (${config.proxyMode} mode) listening on ${server.hostname}:${server.port}`,
);
