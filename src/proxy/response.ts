import { convertResponsesToChatCompletion } from "../converters/responses-to-chat";
import { convertAnthropicToChatCompletion } from "../converters/anthropic-to-chat";
import { convertResponsesStream } from "../streaming/responses-stream";
import { convertAnthropicStream } from "../streaming/anthropic-stream";

export interface ConversionContext {
  /** The original path the client requested */
  originalPath: string;
  /** The upstream URL we actually fetched */
  upstreamUrl: string;
  /** The model name */
  model: string;
}

/**
 * Processes the upstream response, converting formats if needed.
 * Returns a new Response ready to send to the client.
 */
export async function processUpstreamResponse(
  upstream: Response,
  ctx: ConversionContext,
): Promise<Response> {
  const contentType = upstream.headers.get("content-type") ?? "";
  const isSSE = contentType.includes("text/event-stream");
  const needsConversion = ctx.originalPath === "/v1/chat/completions";

  // Streaming response that needs format conversion
  if (isSSE && needsConversion && upstream.body) {
    const isAnthropic = ctx.upstreamUrl.includes("/anthropic/v1/messages");

    const convertedStream = isAnthropic
      ? convertAnthropicStream(upstream.body, ctx.model)
      : convertResponsesStream(upstream.body, ctx.model);

    return new Response(convertedStream, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Non-streaming response that needs format conversion
  if (needsConversion && upstream.status === 200) {
    const isAnthropic = ctx.upstreamUrl.includes("/anthropic/v1/messages");
    const isResponses = ctx.upstreamUrl.includes("/openai/v1/responses");

    if (isAnthropic || isResponses) {
      const data = (await upstream.json()) as Record<string, unknown>;

      // Check for errors - pass through as-is
      if (data.error) {
        return Response.json(data, { status: upstream.status });
      }

      const chatResponse = isAnthropic
        ? convertAnthropicToChatCompletion(data, ctx.model)
        : convertResponsesToChatCompletion(data);

      return Response.json(chatResponse);
    }
  }

  // Error logging for non-2xx
  if (upstream.status >= 400) {
    const body = await upstream.text();
    console.error(
      `API Error: status=${upstream.status} url=${ctx.upstreamUrl} body=${body}`,
    );
    return new Response(body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  }

  // Pass-through: forward headers and body as-is
  const responseHeaders = new Headers(upstream.headers);
  if (isSSE) {
    responseHeaders.set("X-Accel-Buffering", "no");
    responseHeaders.set("Cache-Control", "no-cache");
    responseHeaders.set("Connection", "keep-alive");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
