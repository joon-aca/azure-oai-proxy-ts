import type { Config } from "../types";

export function createOpenAIHandler(config: Config) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const target = `${config.openaiEndpoint}${url.pathname}${url.search}`;

    console.log(`Proxying [OpenAI] ${url.pathname} -> ${target}`);

    // Copy headers, fix auth
    const headers = new Headers(req.headers);
    headers.delete("host");

    const auth = headers.get("authorization") ?? "";
    if (auth && !auth.startsWith("Bearer ")) {
      headers.set("Authorization", `Bearer ${auth}`);
    }
    headers.delete("api-key");
    headers.set("User-Agent", "Azure-OAI-Proxy/1.0");

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body:
        req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    });

    const responseHeaders = new Headers(upstream.headers);
    if (upstream.headers.get("content-type")?.includes("text/event-stream")) {
      responseHeaders.set("X-Accel-Buffering", "no");
      responseHeaders.set("Cache-Control", "no-cache");
      responseHeaders.set("Connection", "keep-alive");
    }

    if (upstream.status >= 400) {
      const body = await upstream.text();
      console.error(
        `OpenAI API Error: status=${upstream.status} body=${body}`,
      );
      return new Response(body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  };
}
