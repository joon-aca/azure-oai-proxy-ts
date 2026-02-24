import type { ServerlessDeployment } from "../types";

export function buildServerlessUrl(info: ServerlessDeployment): string {
  return `https://${info.name}.${info.region}.models.ai.azure.com`;
}
