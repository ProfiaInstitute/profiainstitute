export function createOllamaAccessHeaders(
  clientId: string | undefined,
  clientSecret: string | undefined,
  protocol: string,
): Record<string, string> {
  const normalizedClientId = clientId?.trim() ?? "";
  const normalizedClientSecret = clientSecret?.trim() ?? "";

  if (Boolean(normalizedClientId) !== Boolean(normalizedClientSecret)) {
    throw new Error("Configure both Ollama Cloudflare Access service-token values.");
  }
  if (!normalizedClientId) return {};
  if (protocol !== "https:") {
    throw new Error("Cloudflare Access service tokens require an HTTPS Ollama URL.");
  }

  return {
    "CF-Access-Client-Id": normalizedClientId,
    "CF-Access-Client-Secret": normalizedClientSecret,
  };
}
