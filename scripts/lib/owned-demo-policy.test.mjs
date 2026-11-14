import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createOwnedDemoPolicy,
  demoAnswer,
  demoWineName,
  ownedDemoAnalysis,
} from "./owned-demo-policy.mjs";
import { ownedApp, ownedApi } from "./owned-backend.mjs";
import { sanitizeAnalysis } from "../../src/lib/scanIdentity.ts";
import { recipeSchema } from "../../src/features/kitchen/domain.ts";

const original = Buffer.from("synthetic image fixture bytes");
const fixture = () => {
  const run = randomUUID();
  return {
    project: "winesnap-owned-local",
    run,
    email: `owned-browser-${run}@example.test`,
    ...Object.fromEntries(
      ["userId", "wineId", "noteId", "shareId", "versionId", "sessionId"].map((k) => [
        k,
        randomUUID(),
      ]),
    ),
  };
};
const auth = (f, patch = {}) => ({
  authorization:
    "Bearer x." +
    Buffer.from(JSON.stringify({ sub: f.userId, role: "authenticated", ...patch })).toString(
      "base64url",
    ) +
    ".x",
});
const request = (f, path, body) => ({
  url: ownedApp + path,
  method: "POST",
  headers: auth(f),
  body: Buffer.from(JSON.stringify(body)),
});
async function upload(
  f,
  bytes = original,
  path = `${f.userId}/${randomUUID()}.webp`,
  type = "image/webp",
) {
  const form = new FormData();
  form.append("cacheControl", "0");
  form.append("file", new Blob([bytes], { type }), "label.webp");
  const r = new Request(ownedApi + "/storage/v1/object/wine-labels/" + path, {
    method: "POST",
    body: form,
  });
  return {
    url: r.url,
    method: "POST",
    headers: { ...auth(f), "content-type": r.headers.get("content-type") },
    body: Buffer.from(await r.arrayBuffer()),
  };
}

describe("disposable pilot demo request boundary", () => {
  it("rejects real/malformed accounts and invalid example buffers before activity", () => {
    for (const f of [
      {},
      { ...fixture(), email: "real@example.org" },
      { ...fixture(), userId: "owner" },
    ])
      expect(() => createOwnedDemoPolicy(f, original)).toThrow();
    for (const b of ["image", Buffer.alloc(0), Buffer.alloc(5 * 1024 * 1024 + 1)])
      expect(() => createOwnedDemoPolicy(fixture(), b)).toThrow();
  });
  it("continues local app/data reads but blocks external, credentialed URLs and hosted backends", async () => {
    const decide = createOwnedDemoPolicy(fixture(), original);
    for (const url of [ownedApp + "/kitchen", ownedApi + "/rest/v1/wines"])
      expect(await decide({ url, method: "GET" })).toEqual({ kind: "continue" });
    for (const url of [
      "https://api.openai.com/v1/responses",
      "https://generativelanguage.googleapis.com/",
      "https://wine-scene-snap.lovable.app/",
      "https://pzniyupmgwvlldvztzqh.supabase.co/",
      "http://user:secret@127.0.0.1:5212/",
      "invalid",
    ])
      expect(await decide({ url, method: "GET" })).toEqual({ kind: "abort" });
  });
  it("only signs in to the exact disposable account and blocks account creation/recovery", async () => {
    const f = fixture(),
      decide = createOwnedDemoPolicy(f, original);
    const login = {
      url: ownedApi + "/auth/v1/token?grant_type=password",
      method: "POST",
      body: Buffer.from(JSON.stringify({ email: f.email, password: "synthetic" })),
    };
    expect(await decide(login)).toEqual({ kind: "continue" });
    expect(await decide({ ...login, method: "OPTIONS", body: undefined })).toEqual({
      kind: "continue",
    });
    expect(await decide({ ...login, body: Buffer.from('{"email":"real@example.org"}') })).toEqual({
      kind: "abort",
    });
    for (const path of ["signup", "recover", "admin/users"])
      expect(await decide({ url: ownedApi + "/auth/v1/" + path, method: "POST" })).toEqual({
        kind: "abort",
      });
  });
  it("requires a normal fixture owner and exact local POST before any example AI response", async () => {
    const f = fixture(),
      decide = createOwnedDemoPolicy(f, original),
      good = request(f, "/api/chef", { action: "chat" });
    for (const patch of [
      { headers: {} },
      { headers: auth(f, { sub: randomUUID() }) },
      { headers: auth(f, { role: "service_role" }) },
      { method: "GET" },
      { url: ownedApi + "/api/chef" },
      { body: Buffer.from("invalid") },
      { body: Buffer.alloc(8 * 1024 * 1024 + 1) },
    ])
      expect(await decide({ ...good, ...patch })).toEqual({ kind: "abort" });
  });
  it("returns visibly synthetic identity only for the exact supplied image bytes", async () => {
    const f = fixture(),
      decide = createOwnedDemoPolicy(f, original);
    const body = { imageBase64: original.toString("base64"), mimeType: "image/webp" };
    expect((await decide(request(f, "/api/ai/analyze-wine", body))).body).toEqual(
      ownedDemoAnalysis(),
    );
    const result = sanitizeAnalysis(ownedDemoAnalysis().wine);
    expect(result.identified).toBe(true);
    expect(result.wine.wine_name).toBe(demoWineName);
    expect(result.wine.country).toBeNull();
    for (const patch of [
      { imageBase64: Buffer.from("private photo").toString("base64") },
      { mimeType: "image/jpeg" },
      { imageBase64: null },
    ])
      expect((await decide(request(f, "/api/ai/analyze-wine", { ...body, ...patch }))).status).toBe(
        422,
      );
  });
  it("attributes local Chef and sommelier examples without echoing prompts or claiming persistence", async () => {
    const f = fixture(),
      decide = createOwnedDemoPolicy(f, original);
    const chat = await decide(
      request(f, "/api/chef", { action: "chat", prompt: "private-question-canary" }),
    );
    expect(chat.body.answer).toBe(demoAnswer);
    expect(chat.body.model).toMatch(/Demo/);
    expect(JSON.stringify(chat)).not.toContain("private-question-canary");
    for (const action of ["generate", "adapt"]) {
      const r = await decide(request(f, "/api/chef", { action }));
      expect(recipeSchema.safeParse(r.body.draft).success).toBe(true);
      expect(r.body.draft.sourceNote).toMatch(/Demo/);
    }
    const wine = await decide(
      request(f, "/api/ai/ask-winesnap", { message: "private-question-canary" }),
    );
    expect(wine.body.message.role).toBe("assistant");
    expect(wine.body.message.content).toBe(demoAnswer);
    expect(JSON.stringify(wine)).not.toContain("private-question-canary");
  });
  it("never forwards unknown AI actions or extraction to a real provider", async () => {
    const f = fixture(),
      decide = createOwnedDemoPolicy(f, original);
    for (const path of [
      "/api/ai/wine-suggestions",
      "/api/ai/extract-preference-signals",
      "/api/chef/extract",
    ])
      expect(await decide(request(f, path, { action: "generate" }))).toEqual({ kind: "abort" });
    expect(await decide(request(f, "/api/chef", { action: "extract" }))).toEqual({ kind: "abort" });
  });
  it("allows only exact fixture-owned original-image uploads and their harmless preflight", async () => {
    const f = fixture(),
      decide = createOwnedDemoPolicy(f, original),
      good = await upload(f);
    expect(await decide(good)).toEqual({ kind: "continue" });
    expect(
      await decide({
        ...good,
        method: "OPTIONS",
        body: undefined,
        headers: { "access-control-request-method": "POST" },
      }),
    ).toEqual({ kind: "continue" });
    expect(
      await decide({
        ...good,
        method: "OPTIONS",
        headers: { "access-control-request-method": "DELETE" },
      }),
    ).toEqual({ kind: "abort" });
    for (const bad of [
      await upload(f, Buffer.from("another image")),
      await upload(f, original, `${randomUUID()}/${randomUUID()}.webp`),
      await upload(f, original, `${f.userId}/nested/label.webp`),
      await upload(f, original, undefined, "text/plain"),
      { ...good, headers: {} },
      { ...good, method: "DELETE" },
      { ...good, method: "PUT" },
    ])
      expect(await decide(bad)).toEqual({ kind: "abort" });
  });
  it("does not accept raw, malformed or oversized multipart requests", async () => {
    const f = fixture(),
      decide = createOwnedDemoPolicy(f, original),
      good = await upload(f);
    for (const body of [original, Buffer.alloc(original.length + 16385)])
      expect(await decide({ ...good, body })).toEqual({ kind: "abort" });
  });
  it("reconstructs CDP-omitted file bytes only from the approved local fixture after a verified analysis", async () => {
    const f = fixture(),
      decide = createOwnedDemoPolicy(f, original),
      omitted = await upload(f, Buffer.alloc(0));
    expect(await decide(omitted)).toEqual({ kind: "abort" });
    const analyze = request(f, "/api/ai/analyze-wine", {
      imageBase64: original.toString("base64"),
      mimeType: "image/webp",
    });
    await decide(analyze);
    const result = await decide(omitted);
    expect(result.kind).toBe("upload");
    const form = await new Response(result.body, {
      headers: { "content-type": result.contentType },
    }).formData();
    const files = [...form.values()].filter((value) => value instanceof Blob);
    expect(files).toHaveLength(1);
    expect(Buffer.from(await files[0].arrayBuffer())).toEqual(original);
    expect(form.get("cacheControl")).toBe("0");
    await decide({
      ...analyze,
      body: Buffer.from('{"imageBase64":"invalid","mimeType":"image/webp"}'),
    });
    expect(await decide(omitted)).toEqual({ kind: "abort" });
  });
  it("keeps manual sessions human-unobserved and pins the previously approved image in the operator", () => {
    const code = readFileSync(new URL("./owned-pilot-demo.mjs", import.meta.url), "utf8");
    expect(code).toContain("approvedDemoImageSha256");
    expect(code).toContain("humanSessions: 0");
    expect(code).not.toMatch(/storageState\(|recordVideo|tracing\.start|setSession\(/);
    const probe = readFileSync(new URL("./owned-demo-acceptance.mjs", import.meta.url), "utf8");
    expect(probe).toContain("Automated rehearsal");
    expect(probe).not.toMatch(/route\.continue|createOwnedDemoPolicy|humanSessions\s*=\s*[1-9]/);
  });
});
