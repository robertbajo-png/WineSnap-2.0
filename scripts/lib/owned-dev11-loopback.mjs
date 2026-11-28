import { createServer } from "node:http";

export const privateJournalOrigin = "http://127.0.0.1:5218";
const paths = new Set(["/api/dev11/journal", "/api/dev11/export"]);
const allowedHeaders = new Set(["authorization", "content-type"]);
const loopbackOrigin = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;

export async function openDev11Loopback({
  proof,
  upstream = "http://127.0.0.1:5212",
  pageOrigin = "http://127.0.0.1:5212",
  port = 5218,
}) {
  if (!/^[a-f0-9]{64}$/.test(proof) || ![upstream, pageOrigin].every((s) => loopbackOrigin.test(s)))
    throw new Error("Private journal requires a pinned loopback boundary");
  const server = createServer({ requestTimeout: 10000, headersTimeout: 5000 }, (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Origin");
    const end = (status) => {
      res.writeHead(status);
      res.end();
    };
    if (
      req.socket.remoteAddress !== "127.0.0.1" ||
      req.headers.host !== "127.0.0.1:" + server.address()?.port ||
      req.headers.origin !== pageOrigin ||
      !paths.has(req.url)
    )
      return end(404);

    res.setHeader("Access-Control-Allow-Origin", pageOrigin);
    if (req.method === "OPTIONS") {
      const requestedHeaders = (req.headers["access-control-request-headers"] ?? "").split(",");
      if (
        req.headers["access-control-request-method"] !== "POST" ||
        !requestedHeaders.length ||
        requestedHeaders.some((key) => !allowedHeaders.has(key.trim().toLowerCase()))
      )
        return end(403);
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
      return end(204);
    }
    if (req.method !== "POST") return end(405);
    const auth = req.headers.authorization;
    if (!/^Bearer [a-zA-Z0-9._-]{20,4096}$/.test(auth ?? "")) return end(401);
    if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json") return end(415);
    if (Number(req.headers["content-length"]) > 4096) return end(413);
    const client = new AbortController();
    res.on("close", () => client.abort());
    void (async () => {
      try {
        let bytes = 0;
        const chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 4096) return end(413);
          chunks.push(chunk);
        }
        const result = await fetch(upstream + req.url, {
          method: "POST",
          headers: {
            Authorization: auth,
            "Content-Type": "application/json",
            "X-WineSnap-Dev11-Proof": proof,
          },
          body: Buffer.concat(chunks),
          cache: "no-store",
          signal: AbortSignal.any([client.signal, AbortSignal.timeout(20000)]),
          redirect: "error",
        });
        if (![200, 400, 401, 403, 404, 409, 429, 503].includes(result.status)) return end(503);
        if (!result.ok) {
          await result.body?.cancel();
          return end(result.status);
        }
        const payload = Buffer.from(await result.arrayBuffer());
        if (payload.length > 256 * 1024 || res.destroyed) return end(503);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(result.status);
        res.end(payload);
      } catch {
        if (!res.destroyed && !res.headersSent) end(503);
      }
    })();
  });
  server.setTimeout(25000, (socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}
