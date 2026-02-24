import type { Config, ServerlessDeployment } from "./types";
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

  return config;
}
