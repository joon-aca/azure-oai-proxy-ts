export interface ServerlessDeployment {
  name: string;
  region: string;
  key: string;
}

export interface EndpointOverride {
  endpoint: string;
  key?: string;
}

export interface Config {
  azureEndpoint: string;
  apiVersion: string;
  modelsApiVersion: string;
  responsesApiVersion: string;
  anthropicApiVersion: string;
  address: string;
  proxyMode: "azure" | "openai";
  openaiEndpoint: string;
  modelMapper: Record<string, string>;
  serverlessDeployments: Record<string, ServerlessDeployment>;
  endpointMap: Record<string, EndpointOverride>;
  apiKey: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages?: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  input?: string;
  [key: string]: unknown;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Record<string, unknown>;
    finish_reason: string | null;
  }[];
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
    logprobs: null;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint: null;
}

export interface ModelEntry {
  id: string;
  object: string;
  created_at?: number;
  capabilities?: {
    fine_tune?: boolean;
    inference?: boolean;
    completion?: boolean;
    chat_completion?: boolean;
    embeddings?: boolean;
  };
  lifecycle_status?: string;
  status?: string;
  deprecation?: {
    fine_tune?: number;
    inference?: number;
  };
}

export interface ModelList {
  object: "list";
  data: ModelEntry[];
}

export type RouteHandler = (
  req: Request,
  params: Record<string, string>,
) => Response | Promise<Response>;
