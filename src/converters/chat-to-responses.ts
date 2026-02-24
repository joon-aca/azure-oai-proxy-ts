import type { ChatCompletionRequest } from "../types";

export function convertChatToResponses(body: ChatCompletionRequest): {
  converted: Record<string, unknown>;
  model: string;
} {
  const model = body.model;
  const messages = body.messages ?? [];

  const newBody: Record<string, unknown> = { model };

  if (messages.length === 1 && messages[0].role === "user") {
    newBody.input = messages[0].content;
  } else {
    newBody.input = messages.map((msg) => ({
      role: msg.role,
      content: [{ type: "input_text", text: msg.content }],
    }));
  }

  if (body.temperature && body.temperature > 0) {
    newBody.temperature = body.temperature;
  }
  if (body.max_tokens && body.max_tokens > 0) {
    newBody.max_output_tokens = body.max_tokens;
  }
  if (body.stream) {
    newBody.stream = true;
  }

  return { converted: newBody, model };
}
