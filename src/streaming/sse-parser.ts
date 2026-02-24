/**
 * Parses an SSE byte stream into typed events.
 * Yields { event, data } pairs as they arrive.
 */
export async function* parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<{ event: string; data: string }> {
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    // Keep the last incomplete line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data) {
          yield { event: currentEvent, data };
        }
      } else if (line === "") {
        // Event separator — reset event type
        currentEvent = "";
      }
    }
  }

  // Flush remaining buffer
  if (buffer.trim()) {
    if (buffer.startsWith("data:")) {
      const data = buffer.slice(5).trim();
      if (data) {
        yield { event: currentEvent, data };
      }
    }
  }
}

/** Encode an SSE chunk as "data: <json>\n\n" */
export function encodeSSE(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/** Encode the [DONE] sentinel */
export function encodeDone(): string {
  return "data: [DONE]\n\n";
}
