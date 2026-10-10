type ScanFailure = {
  key: "scan.error.auth" | "scan.error.rateLimit" | "scan.error.unavailable" | "scan.error.generic";
  status: number | null;
  category:
    | "authentication"
    | "platform_authentication"
    | "quota"
    | "configuration"
    | "gateway"
    | "unknown";
  upstreamStatus?: number;
};

export async function scanFailure(error: unknown): Promise<ScanFailure> {
  const context = error && typeof error === "object" && "context" in error ? error.context : null;
  const status = context instanceof Response ? context.status : null;
  const failure: ScanFailure = {
    key:
      status === 401 || status === 403
        ? "scan.error.auth"
        : status === 429
          ? "scan.error.rateLimit"
          : status === 402 || (status != null && status >= 500)
            ? "scan.error.unavailable"
            : "scan.error.generic",
    status,
    category:
      status === 401 || status === 403 ? "authentication" : status === 429 ? "quota" : "unknown",
  };
  if (!(context instanceof Response)) return failure;
  try {
    const body: unknown = await context.clone().json();
    if (!body || typeof body !== "object") return failure;
    if ("code" in body && typeof body.code === "string" && body.code.startsWith("UNAUTHORIZED_")) {
      failure.category = "platform_authentication";
    } else if ("msg" in body && body.msg === "Invalid JWT") {
      failure.category = "platform_authentication";
    } else if ("error" in body && body.error === "Server configuration error") {
      failure.category = "configuration";
    } else if ("error" in body && typeof body.error === "string") {
      const upstream = /^AI gateway: ([1-5]\d{2})$/.exec(body.error);
      if (upstream) {
        failure.category = "gateway";
        failure.upstreamStatus = Number(upstream[1]);
      }
    }
  } catch {
    // An HTML/proxy error is still a failure; never log an arbitrary response body.
  }
  return failure;
}
