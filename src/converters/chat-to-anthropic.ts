import type { ChatCompletionRequest } from "../types";

export function convertChatToAnthropic(
  body: ChatCompletionRequest,
  model: string,
): Record<string, unknown> {
  const messages = body.messages ?? [];
  const input = body.input;

  let systemMessage = "";
  const anthropicMessages: { role: string; content: string }[] = [];

  if (input) {
    anthropicMessages.push({ role: "user", content: input });
  } else {
    for (const msg of messages) {
      if (msg.role === "system") {
        systemMessage = msg.content;
      } else {
        anthropicMessages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  const newBody: Record<string, unknown> = {
    model,
    messages: anthropicMessages,
    max_tokens: body.max_tokens || 1000,
  };

  if (systemMessage) {
    newBody.system = systemMessage;
  }
  if (body.temperature && body.temperature > 0) {
    newBody.temperature = body.temperature;
  }
  if (body.stream) {
    newBody.stream = true;
  }

  return newBody;
}
