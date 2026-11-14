import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { ownedApp, ownedApi } from "./owned-backend.mjs";
import { validateBrowserFixture, fixtureImagePaths } from "./owned-browser-fixture.mjs";
import { offlineRequestPolicy } from "./owned-offline.mjs";
import { ownedDemoRecipe } from "./owned-demo-data.mjs";

export const demoAnswer =
  "Exempelsvar (demo): citron, rostade gr\u00f6nsaker och ett friskt vitt vin kan fungera fint tillsammans.";
export const demoWineName = "DEMO ZEHN MORGEN";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const reply = (body, status = 200) => ({ kind: "reply", status, body });
const blocked = Object.freeze({ kind: "abort" });

export function ownedDemoAnalysis() {
  const field = (value) => ({ value, source: "label", confidence: 95, evidence: value });
  return {
    wine: {
      label_text: "DEMO ZEHN MORGEN 2023 NAHE CHARDONNAY WEISSER BURGUNDER",
      identity: {
        producer: field("ZEHN MORGEN"),
        wine_name: field(demoWineName),
        vintage: field("2023"),
        region: field("NAHE"),
        grape_varieties: [field("CHARDONNAY"), field("WEISSER BURGUNDER")],
      },
      taste: { description: "Exempeldata (demo), ingen AI-analys.", primary_notes: [] },
    },
    model: "Demo - lokalt exempel, ingen AI",
  };
}

// A request filter for the disposable browser only, never an application gateway.
export function createOwnedDemoPolicy(fixture, original, uploadEvidence = () => {}) {
  validateBrowserFixture(fixture);
  assert.equal(typeof uploadEvidence, "function");
  assert.ok(Buffer.isBuffer(original) && original.length > 0 && original.length <= 5 * 1024 * 1024);
  const expected = hash(original);
  let approvedAnalysis = false;
  const owner = (headers) => {
    try {
      const token = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(headers.authorization ?? "")?.[1];
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
      return claims.sub === fixture.userId && claims.role === "authenticated";
    } catch {
      return false;
    }
  };
  return async ({ url: raw, method, headers = {}, body }) => {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return blocked;
    }
    const policy = offlineRequestPolicy(raw);
    if (policy === "external") return blocked;
    if (/^\/auth\/v1\/(?:signup|recover|admin)(?:\/|$)/.test(url.pathname)) return blocked;
    if (
      url.origin === ownedApi &&
      url.pathname === "/auth/v1/token" &&
      method === "POST" &&
      url.searchParams.get("grant_type") === "password"
    ) {
      try {
        if (JSON.parse(body).email !== fixture.email) return blocked;
      } catch {
        return blocked;
      }
    }
    if (policy === "ai") {
      if (url.origin !== ownedApp || method !== "POST" || !owner(headers)) return blocked;
      if (!Buffer.isBuffer(body) || body.length > 8 * 1024 * 1024) return blocked;
      let input;
      try {
        input = JSON.parse(body);
      } catch {
        return blocked;
      }
      if (url.pathname === "/api/ai/analyze-wine") {
        const bytes =
          typeof input.imageBase64 === "string" ? Buffer.from(input.imageBase64, "base64") : null;
        if (!bytes || input.mimeType !== "image/webp" || hash(bytes) !== expected) {
          approvedAnalysis = false;
          return reply(
            {
              error:
                "Demot anv\u00e4nder endast den angivna exempelbilden. Ingen bild har skickats till AI.",
            },
            422,
          );
        }
        approvedAnalysis = true;
        return reply(ownedDemoAnalysis());
      }
      if (url.pathname === "/api/chef" && ["chat", "generate", "adapt"].includes(input.action))
        return reply({
          ...(input.action === "chat" ? { answer: demoAnswer } : { draft: ownedDemoRecipe() }),
          model: "Demo - lokalt exempel, ingen AI",
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
        });
      if (url.pathname === "/api/ai/ask-winesnap")
        return reply({
          conversationId: randomUUID(),
          message: {
            id: randomUUID(),
            role: "assistant",
            content: demoAnswer,
            created_at: new Date().toISOString(),
          },
        });
      return blocked;
    }
    if (url.pathname.includes("/storage/v1/object/") && !["GET", "HEAD"].includes(method)) {
      uploadEvidence({
        stage: "request",
        ownedOrigin: url.origin === ownedApi,
        ownerMatches: owner(headers),
        method,
        bodyBytes: body?.length ?? 0,
      });
      const prefix = "/storage/v1/object/wine-labels/";
      if (url.origin !== ownedApi || !url.pathname.startsWith(prefix)) return blocked;
      try {
        const path = url.pathname.slice(prefix.length);
        fixtureImagePaths([path], fixture);
        if (
          method === "OPTIONS" &&
          path.endsWith(".webp") &&
          headers["access-control-request-method"] === "POST"
        )
          return { kind: "continue" };
        if (method !== "POST" || !owner(headers)) return blocked;
        if (
          !path.endsWith(".webp") ||
          !Buffer.isBuffer(body) ||
          body.length > original.length + 16384
        )
          return blocked;
        const form = await new Response(body, {
          headers: { "content-type": headers["content-type"] },
        }).formData();
        const files = [...form.values()].filter((value) => value instanceof Blob);
        uploadEvidence({
          stage: "multipart",
          bodyBytes: body.length,
          files: files.length,
          fileBytes: files[0]?.size ?? 0,
          mimeMatches: files[0]?.type === "image/webp",
        });
        if (
          files.length === 1 &&
          files[0].type === "image/webp" &&
          files[0].size === 0 &&
          approvedAnalysis
        ) {
          // Chromium omits multipart file bytes from CDP. Send only the pinned
          // local fixture, never an uninspected browser file, in this demo.
          const canonical = new FormData();
          canonical.append("cacheControl", "0");
          canonical.append("file", new Blob([original], { type: "image/webp" }), "example.webp");
          const upload = new Request(url, { method: "POST", body: canonical });
          uploadEvidence({
            stage: "canonical_original",
            fileBytes: original.length,
            afterApprovedAnalysis: true,
          });
          return {
            kind: "upload",
            body: Buffer.from(await upload.arrayBuffer()),
            contentType: upload.headers.get("content-type"),
          };
        }
        if (
          files.length !== 1 ||
          files[0].type !== "image/webp" ||
          hash(Buffer.from(await files[0].arrayBuffer())) !== expected
        )
          return blocked;
      } catch {
        return blocked;
      }
    }
    return { kind: "continue" };
  };
}
