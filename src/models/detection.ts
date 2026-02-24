const claudePrefixes = [
  "claude-opus",
  "claude-sonnet",
  "claude-haiku",
  "claude-3",
  "claude-4",
];

export function isClaudeModel(model: string): boolean {
  const lower = model.toLowerCase();
  return claudePrefixes.some((p) => lower.startsWith(p));
}

const responsesModelPrefixes = [
  "o1",
  "o1-preview",
  "o1-mini",
  "o3",
  "o3-mini",
  "o3-pro",
  "o3-deep-research",
  "o4",
  "o4-mini",
  "codex-mini",
  "gpt-5.1-codex",
  "gpt-5-codex",
  "gpt-5-pro",
  "computer-use-preview",
];

export function shouldUseResponsesAPI(model: string): boolean {
  const lower = model.toLowerCase();
  return responsesModelPrefixes.some((p) => lower.startsWith(p));
}

export function getModelFromBody(body: ArrayBuffer): string {
  try {
    const text = new TextDecoder().decode(body);
    const parsed = JSON.parse(text);
    return (parsed.model as string) ?? "";
  } catch {
    return "";
  }
}

export function getModelFromPath(path: string): string {
  const parts = path.split("/");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "deployments" && i + 1 < parts.length) {
      return parts[i + 1];
    }
  }
  return "";
}
