import data from "../../api-versions.json";

const chatTable = data.chat as Array<[string, string]>;
const responsesTable = data.responses as Array<[string, string]>;

function lookup(table: Array<[string, string]>, model: string): string | undefined {
  const lower = model.toLowerCase();
  return table.find(([prefix]) => lower.startsWith(prefix.toLowerCase()))?.[1];
}

export function resolveChatApiVersion(model: string, fallback: string): string {
  return lookup(chatTable, model) ?? fallback;
}

export function resolveResponsesApiVersion(model: string, fallback: string): string {
  return lookup(responsesTable, model) ?? fallback;
}
