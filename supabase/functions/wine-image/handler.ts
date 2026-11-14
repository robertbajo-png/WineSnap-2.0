export const wineImageHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization, apikey",
};

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const maxImageBytes = 10 * 1024 * 1024;

export function wineImageError(status: number) {
  return new Response(JSON.stringify({ error: "Image unavailable" }), {
    status,
    headers: { ...wineImageHeaders, "Content-Type": "application/json" },
  });
}

async function boundedBody(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("body_limit");
      chunks.push(new Uint8Array(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readWineImage(response: Response) {
  const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (
    !response.ok ||
    !type ||
    !imageTypes.has(type) ||
    Number(response.headers.get("content-length")) > maxImageBytes
  ) {
    await response.body?.cancel();
    if ([400, 403, 404, 410].includes(response.status)) return null;
    throw new Error("image_fetch_error");
  }
  const bytes = await boundedBody(response.body, maxImageBytes);
  if (!bytes.length) throw new Error("empty_image");
  return new Blob([bytes], { type });
}

type ImageDependencies = {
  authenticate: (token: string) => Promise<{ id: string } | null>;
  active: (userId: string) => Promise<boolean>;
  shared: (path: string) => Promise<boolean>;
  download: (path: string, signal: AbortSignal) => Promise<Blob | null>;
};

export function createWineImageHandler(deps: ImageDependencies) {
  return async (req: Request) => {
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: wineImageHeaders });
    if (req.method !== "POST") return wineImageError(405);
    let path: unknown;
    try {
      const bytes = await boundedBody(req.body, 4096);
      path = JSON.parse(new TextDecoder().decode(bytes))?.path;
    } catch (error) {
      return wineImageError(error instanceof Error && error.message === "body_limit" ? 413 : 400);
    }
    if (
      typeof path !== "string" ||
      path.length > 1024 ||
      !path.includes("/") ||
      /[\\%?#:]/.test(path) ||
      [...path].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      path.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      return wineImageError(400);
    }
    const imagePath = path;
    try {
      const authorization = req.headers.get("authorization")?.trim();
      let user: { id: string } | null = null;
      if (authorization) {
        const token = authorization.match(/^Bearer (\S+)$/i)?.[1];
        if (!token) return wineImageError(401);
        user = await deps.authenticate(token);
        if (!user) return wineImageError(401);
      }
      const allowed = async () => {
        if (user && !(await deps.active(user.id))) return false;
        return user?.id === imagePath.split("/")[0] || (await deps.shared(imagePath));
      };
      if (!(await allowed())) return wineImageError(404);
      const image = await deps.download(imagePath, req.signal);
      // An unshare or erasure can happen while the file is in flight.
      if (!image || req.signal.aborted || !(await allowed())) return wineImageError(404);
      if (!imageTypes.has(image.type) || !image.size || image.size > maxImageBytes)
        return wineImageError(502);
      return new Response(image, {
        headers: { ...wineImageHeaders, "Content-Type": image.type },
      });
    } catch {
      return wineImageError(503);
    }
  };
}
