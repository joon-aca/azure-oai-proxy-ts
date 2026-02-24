import type { ChatCompletionChunk } from "../types";
import { parseSSE, encodeSSE, encodeDone } from "./sse-parser";

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

/**
 * Transforms an Anthropic Messages API SSE stream into OpenAI chat.completion.chunk SSE stream.
 */
export function convertAnthropicStream(
  upstream: ReadableStream<Uint8Array>,
  model: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      let messageID = "";

      try {
        for await (const { event, data } of parseSSE(reader)) {
          // Skip pings
          if (data === '{"type": "ping"}' || data === '{"type":"ping"}') {
            continue;
          }

          switch (event) {
            case "message_start": {
              try {
                const parsed = JSON.parse(data);
                messageID = parsed.message?.id ?? "";

                const chunk: ChatCompletionChunk = {
                  id: messageID,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { role: "assistant" },
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(encoder.encode(encodeSSE(chunk)));
              } catch {
                // skip
              }
              break;
            }
            case "content_block_delta": {
              try {
                const parsed = JSON.parse(data);
                const text = parsed.delta?.text;
                if (typeof text !== "string" || text === "") break;

                const chunk: ChatCompletionChunk = {
                  id: messageID,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { content: text },
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(encoder.encode(encodeSSE(chunk)));
              } catch {
                // skip
              }
              break;
            }
            case "message_delta": {
              try {
                const parsed = JSON.parse(data);
                const stopReason = parsed.delta?.stop_reason ?? "end_turn";

                const chunk: ChatCompletionChunk = {
                  id: messageID,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: mapStopReason(stopReason),
                    },
                  ],
                };
                controller.enqueue(encoder.encode(encodeSSE(chunk)));
              } catch {
                // skip
              }
              break;
            }
            case "message_stop": {
              controller.enqueue(encoder.encode(encodeDone()));
              break;
            }
            // content_block_start, content_block_stop, ping — ignored
          }
        }
      } catch (err) {
        console.error("Anthropic stream conversion error:", err);
      } finally {
        controller.close();
      }
    },
  });
}
