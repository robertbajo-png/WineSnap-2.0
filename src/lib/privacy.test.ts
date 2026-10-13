import { describe, expect, it, vi } from "vitest";
import { eraseAccountFiles, recentSignIn } from "../../supabase/functions/_shared/privacy";
import { completePrivacyExport } from "./privacyExport";
import { readFileSync } from "node:fs";

describe("account erasure", () => {
  it("removes all bucket files before deleting Auth", async () => {
    const order: string[] = [];
    const list = vi
      .fn()
      .mockResolvedValueOnce([
        { bucket_id: "wine-labels", name: "owner/one.jpg" },
        { bucket_id: "avatars", name: "owner/avatar.jpg" },
      ])
      .mockResolvedValue([]);
    expect(
      await eraseAccountFiles("owner", {
        list,
        remove: async (bucket) => {
          order.push(bucket);
        },
        deleteAuth: async () => {
          order.push("auth");
        },
      }),
    ).toEqual({ complete: true });
    expect(order).toEqual(["wine-labels", "avatars", "auth"]);
    expect(list.mock.calls.every(([id]) => id === "owner")).toBe(true);
  });
  it("does not delete Auth on storage errors and supports an idempotent retry", async () => {
    const deleteAuth = vi.fn();
    await expect(
      eraseAccountFiles("owner", {
        list: async () => [{ bucket_id: "wine-labels", name: "owner/image" }],
        remove: async () => {
          throw new Error("storage_error");
        },
        deleteAuth,
      }),
    ).rejects.toThrow("storage_error");
    expect(deleteAuth).not.toHaveBeenCalled();
    expect(
      await eraseAccountFiles("owner", { list: async () => [], remove: vi.fn(), deleteAuth }),
    ).toEqual({ complete: true });
    expect(deleteAuth).toHaveBeenCalledWith("owner");
  });
  it("leaves large erasures queued instead of claiming success", async () => {
    const deleteAuth = vi.fn();
    expect(
      await eraseAccountFiles(
        "owner",
        {
          list: async () => [{ bucket_id: "wine-labels", name: "owner/image" }],
          remove: vi.fn(),
          deleteAuth,
        },
        2,
      ),
    ).toEqual({ complete: false });
    expect(deleteAuth).not.toHaveBeenCalled();
  });
  it("requires a real recent sign-in, not a refreshed token", () => {
    const now = Date.parse("2026-10-13T10:00:00Z");
    expect(recentSignIn("2026-10-13T09:50:00Z", now)).toBe(true);
    for (const date of [undefined, "invalid", "2026-10-13T09:44:59Z", "2026-10-13T10:01:00Z"])
      expect(recentSignIn(date, now)).toBe(false);
  });
});

const sample = () => ({
  format: "WineSnap user export v2",
  exported_at: "now",
  account: { id: "owner" },
  tables: { wines: [{ user_id: "owner" }] },
  excluded: [],
  files: [
    {
      bucket: "wine-labels",
      path: "owner/image",
      signedUrl: "https://db.example/storage/v1/object/sign/wine-labels/owner/image?token=secret",
    },
  ],
});
describe("complete private export", () => {
  it("embeds file bytes rather than expiring signed URLs", async () => {
    const result = await completePrivacyExport(
      sample(),
      "owner",
      "https://db.example",
      async () => new Response("image-bytes", { headers: { "content-type": "image/jpeg" } }),
      () => true,
    );
    expect(result.files[0].base64).toBe(btoa("image-bytes"));
    expect(result.files[0].mimeType).toBe("image/jpeg");
    expect(JSON.stringify(result)).not.toContain("token=secret");
  });
  it("refuses wrong owner and external URLs before fetching", async () => {
    const fetch = vi.fn();
    await expect(
      completePrivacyExport(sample(), "stranger", "https://db.example", fetch, () => true),
    ).rejects.toThrow("Account changed");
    const data = sample();
    data.files[0].signedUrl = "https://external.example/storage/v1/object/sign/secret";
    await expect(
      completePrivacyExport(data, "owner", "https://db.example", fetch, () => true),
    ).rejects.toThrow("origin");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses partial export when a file is missing", async () => {
    await expect(
      completePrivacyExport(
        sample(),
        "owner",
        "https://db.example",
        async () => new Response("denied", { status: 403 }),
        () => true,
      ),
    ).rejects.toThrow("download");
  });
  it("stops on account changes while downloading", async () => {
    let current = true;
    await expect(
      completePrivacyExport(
        sample(),
        "owner",
        "https://db.example",
        async () => {
          current = false;
          return new Response("bytes");
        },
        () => current,
      ),
    ).rejects.toThrow("Account changed");
  });
  it("enforces a byte limit even without Content-Length", async () => {
    await expect(
      completePrivacyExport(
        sample(),
        "owner",
        "https://db.example",
        async () => new Response("X".repeat(100)),
        () => true,
        50,
      ),
    ).rejects.toThrow("export_requires_support");
  });
});

describe("privacy source contracts", () => {
  const read = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
  it("never logs provider response text or arbitrary error objects", () => {
    for (const name of [
      "analyze-wine",
      "ask-winesnap",
      "taste-suggestions",
      "wine-suggestions",
      "restaurant-match",
      "extract-preference-signals",
    ]) {
      const code = read(`supabase/functions/${name}/index.ts`);
      expect(code).not.toMatch(
        /console\.error\([^;]*(?:\.message|\.slice\(|response\.text\(|, error\)|, e\))/,
      );
      expect(code).not.toContain("const detail = await");
    }
  });
  it("does not upload unsaved scan images", () => {
    const code = read("src/routes/scan.tsx");
    const analysis = code.slice(
      code.indexOf("const handleFile"),
      code.indexOf("const savePending"),
    );
    expect(analysis).not.toContain(".upload(");
    expect(analysis).not.toContain("supabase.storage");
    expect(code.slice(code.indexOf("const savePending"))).toContain(".upload(");
  });
  it("takes the erasure identity only from the verified session", () => {
    const code = read("supabase/functions/privacy-controls/index.ts");
    expect(code).toContain("admin.auth.getUser(token)");
    expect(code).toContain("_user_id: auth.user.id");
    expect(code).not.toContain("body.userId");
    expect(code).toContain('Deno.env.get("PRIVACY_DELETION_ENABLED") !== "true"');
  });
});
