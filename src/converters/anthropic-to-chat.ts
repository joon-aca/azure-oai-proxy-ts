import type { ChatCompletionResponse } from "../types";

function mapStopReason(reason: string): string {
  switch (reason) {
    case "end_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "stop_sequence":
      return "stop";
    default:
      return "stop";
  }
}

export function convertAnthropicToChatCompletion(
  data: Record<string, unknown>,
  model: string,
): ChatCompletionResponse {
  let content = "";
  if (Array.isArray(data.content) && data.content.length > 0) {
    const block = data.content[0] as Record<string, unknown>;
    if (typeof block.text === "string") {
      content = block.text;
    }
  }

  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  if (data.usage && typeof data.usage === "object") {
    const u = data.usage as Record<string, unknown>;
    if (typeof u.input_tokens === "number") usage.prompt_tokens = u.input_tokens;
    if (typeof u.output_tokens === "number")
      usage.completion_tokens = u.output_tokens;
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
  }

  const finishReason = mapStopReason(
    (data.stop_reason as string) ?? "end_turn",
  );

  return {
    id: (data.id as string) ?? "msg-unknown",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: finishReason,
        logprobs: null,
      },
    ],
    usage,
    system_fingerprint: null,
  };
}
