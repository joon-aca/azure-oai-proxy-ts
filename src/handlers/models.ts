import type { Config, ModelList, ModelEntry } from "../types";

export function createModelsHandler(config: Config) {
  return async (req: Request): Promise<Response> => {
    const endpoint = config.azureEndpoint.replace(/\/$/, "");
    const url = `${endpoint}/openai/models?api-version=${config.modelsApiVersion}`;

    // Resolve auth for the models request
    let apiKey = new URL(req.url).searchParams.get("api-key") ?? "";
    if (!apiKey) {
      apiKey =
        req.headers.get("api-key") ??
        req.headers.get("authorization")?.replace("Bearer ", "") ??
        config.apiKey;
    }

    const headers: Record<string, string> = { "api-key": apiKey };

    let models: ModelEntry[] = [];
    try {
      const resp = await fetch(url, { headers });
      if (resp.ok) {
        const data = (await resp.json()) as ModelList;
        models = data.data ?? [];
      } else {
        const body = await resp.text();
        console.error(`Failed to fetch models: ${resp.status} ${body}`);
      }
    } catch (err) {
      console.error(`Error fetching models: ${err}`);
    }

    // Add serverless deployments
    for (const name of Object.keys(config.serverlessDeployments)) {
      models.push({
        id: name,
        object: "model",
        capabilities: {
          completion: true,
          chat_completion: true,
          inference: true,
        },
        lifecycle_status: "active",
        status: "ready",
      });
    }

    return Response.json({ object: "list", data: models } satisfies ModelList);
  };
}
