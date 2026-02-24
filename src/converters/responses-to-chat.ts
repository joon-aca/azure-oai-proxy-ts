import type { ChatCompletionResponse } from "../types";

export function convertResponsesToChatCompletion(
  data: Record<string, unknown>,
): ChatCompletionResponse {
  let content = "";

  if (typeof data.output_text === "string") {
    content = data.output_text;
  } else if (Array.isArray(data.output)) {
    for (const output of data.output) {
      if (
        output &&
        typeof output === "object" &&
        (output as Record<string, unknown>).type === "message" &&
        (output as Record<string, unknown>).role === "assistant"
      ) {
        const contents = (output as Record<string, unknown>)
          .content as unknown[];
        if (Array.isArray(contents)) {
          for (const c of contents) {
            const block = c as Record<string, unknown>;
            if (block.type === "output_text" && typeof block.text === "string") {
              content = block.text;
              break;
            }
          }
        }
      }
    }
  }

  let finishReason = "stop";
  if (typeof data.status === "string" && data.status !== "completed") {
    finishReason = data.status;
  }

  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  if (data.usage && typeof data.usage === "object") {
    const u = data.usage as Record<string, unknown>;
    if (typeof u.input_tokens === "number") usage.prompt_tokens = u.input_tokens;
    if (typeof u.output_tokens === "number")
      usage.completion_tokens = u.output_tokens;
    if (typeof u.total_tokens === "number") usage.total_tokens = u.total_tokens;
  }

  const created =
    typeof data.created_at === "number"
      ? data.created_at
      : Math.floor(Date.now() / 1000);

  return {
    id: (data.id as string) ?? "resp-unknown",
    object: "chat.completion",
    created,
    model: (data.model as string) ?? "unknown",
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
