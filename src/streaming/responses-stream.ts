import type { ChatCompletionChunk } from "../types";
import { parseSSE, encodeSSE, encodeDone } from "./sse-parser";

/**
 * Transforms a Responses API SSE stream into OpenAI chat.completion.chunk SSE stream.
 */
export function convertResponsesStream(
  upstream: ReadableStream<Uint8Array>,
  model: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        for await (const { event, data } of parseSSE(reader)) {
          switch (event) {
            case "response.output_text.delta": {
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.delta;
                if (typeof delta !== "string") break;

                const chunk: ChatCompletionChunk = {
                  id: `chatcmpl-${Date.now()}`,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { content: delta },
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(encoder.encode(encodeSSE(chunk)));
              } catch {
                // skip malformed events
              }
              break;
            }
            case "response.completed": {
              const finalChunk: ChatCompletionChunk = {
                id: `chatcmpl-${Date.now()}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  { index: 0, delta: {}, finish_reason: "stop" },
                ],
              };
              controller.enqueue(encoder.encode(encodeSSE(finalChunk)));
              controller.enqueue(encoder.encode(encodeDone()));
              break;
            }
            // Ignore other event types
          }
        }
      } catch (err) {
        console.error("Responses stream conversion error:", err);
      } finally {
        controller.close();
      }
    },
  });
}
