export function handleHealth(): Response {
  return Response.json({ status: "healthy" });
}
