import type { Config, EndpointOverride, ServerlessDeployment } from "./types";
import { defaultModelMapper } from "./models/mapper";

function parseModelMapper(env: string | undefined): Record<string, string> {
  const mapper: Record<string, string> = {};
  if (!env) return mapper;
  for (const pair of env.split(",")) {
    const [key, value] = pair.split("=");
    if (key && value) {
      mapper[key.trim()] = value.trim();
    }
  }
  return mapper;
}

function parseServerlessDeployments(
  env: string | undefined,
): Record<string, ServerlessDeployment> {
  const deployments: Record<string, ServerlessDeployment> = {};
  if (!env) return deployments;
  for (const pair of env.split(",")) {
    const [model, info] = pair.split("=");
    if (!model || !info) continue;
    const [name, region] = info.split(":");
    if (!name || !region) continue;
    const keyEnv = `AZURE_OPENAI_KEY_${model.toUpperCase()}`;
    deployments[model.trim().toLowerCase()] = {
      name: name.trim(),
      region: region.trim(),
      key: process.env[keyEnv] ?? "",
    };
  }
  return deployments;
}

function parseEndpointMap(
  env: string | undefined,
): Record<string, EndpointOverride> {
  const map: Record<string, EndpointOverride> = {};
  if (!env) return map;
  for (const pair of env.split(",")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const model = pair.slice(0, eqIdx).trim();
    const rest = pair.slice(eqIdx + 1).trim();
    if (!model || !rest) continue;
    // Try parsing the whole value as a URL first. If valid, it's just an endpoint
    // (handles URLs with ports like https://host:8443/path).
    // If invalid, split on the last colon to separate endpoint from key.
    try {
      new URL(rest);
      map[model.toLowerCase()] = { endpoint: rest };
    } catch {
      const lastColon = rest.lastIndexOf(":");
      if (lastColon === -1) {
        map[model.toLowerCase()] = { endpoint: rest };
        continue;
      }
      const endpoint = rest.slice(0, lastColon).trim();
      const key = rest.slice(lastColon + 1).trim();
      map[model.toLowerCase()] = { endpoint, key: key || undefined };
    }
  }
  return map;
}

export function loadConfig(): Config {
  const userMapper = parseModelMapper(
    process.env.AZURE_OPENAI_MODEL_MAPPER,
  );
  // User mappings override defaults
  const modelMapper = { ...defaultModelMapper, ...userMapper };

  const config: Config = {
    azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT ?? "",
    apiVersion:
      process.env.AZURE_OPENAI_APIVERSION ?? "2024-08-01-preview",
    modelsApiVersion:
      process.env.AZURE_OPENAI_MODELS_APIVERSION ?? "2024-10-21",
    responsesApiVersion:
      process.env.AZURE_OPENAI_RESPONSES_APIVERSION ?? "2024-08-01-preview",
    anthropicApiVersion:
      process.env.ANTHROPIC_APIVERSION ?? "2023-06-01",
    address: process.env.AZURE_OPENAI_PROXY_ADDRESS ?? "0.0.0.0:11437",
    proxyMode:
      (process.env.AZURE_OPENAI_PROXY_MODE as "azure" | "openai") ?? "azure",
    openaiEndpoint:
      process.env.OPENAI_API_ENDPOINT ?? "https://api.openai.com",
    modelMapper,
    serverlessDeployments: parseServerlessDeployments(
      process.env.AZURE_AI_STUDIO_DEPLOYMENTS,
    ),
    endpointMap: parseEndpointMap(process.env.AZURE_OPENAI_ENDPOINT_MAP),
    apiKey: process.env.AZURE_OPENAI_API_KEY ?? "",
  };

  console.log(`Azure OpenAI Endpoint: ${config.azureEndpoint}`);
  console.log(`Azure OpenAI API Version: ${config.apiVersion}`);
  console.log(`Azure OpenAI Models API Version: ${config.modelsApiVersion}`);
  console.log(
    `Azure OpenAI Responses API Version: ${config.responsesApiVersion}`,
  );
  console.log(
    `Serverless deployments: ${JSON.stringify(Object.keys(config.serverlessDeployments))}`,
  );
  const endpointMapKeys = Object.keys(config.endpointMap);
  if (endpointMapKeys.length > 0) {
    console.log(`Endpoint overrides: ${JSON.stringify(endpointMapKeys)}`);
  }

  return config;
}
