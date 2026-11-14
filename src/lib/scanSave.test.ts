import { describe, expect, it, vi } from "vitest";
import { saveScanOnce, scanUploadPath, type ScanSaveAttempt } from "./scanSave";
const intent = (): ScanSaveAttempt => ({
  id: "synthetic-wine",
  owner: "synthetic-owner",
  imagePath: null,
  insertStarted: false,
});
const row = {
  id: "synthetic-wine",
  user_id: "synthetic-owner",
  image_url: "synthetic-owner/label.webp",
};

describe("explicit scan-save reconciliation", () => {
  it("retries lost upload replies with one stable private path and the same bytes", async () => {
    const attempt = {
      ...intent(),
      id: "11111111-2222-4333-8444-555555555555",
      owner: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    };
    const blob = new Blob(["synthetic"], { type: "image/png" });
    const path = scanUploadPath(attempt, "png");
    expect(path).toBe(`${attempt.owner}/${attempt.id}.png`);
    const storage = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("lost upload reply"))
      .mockResolvedValue({ error: null });
    const upload = async () => {
      await storage(scanUploadPath(attempt, "png"), blob, { upsert: true });
      return path;
    };
    const saved = { id: attempt.id, user_id: attempt.owner, image_url: path };
    const insert = vi.fn(async () => saved);
    const find = vi.fn(async () => null);
    await expect(saveScanOnce(attempt, { upload, insert, find })).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
    expect(await saveScanOnce(attempt, { upload, insert, find })).toEqual(saved);
    expect(storage).toHaveBeenNthCalledWith(1, path, blob, { upsert: true });
    expect(storage).toHaveBeenNthCalledWith(2, path, blob, { upsert: true });
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it.each(["../jpg", "jpeg/other", "", "svg"])(
    "rejects unsafe upload extensions: %s",
    (extension) => {
      expect(() =>
        scanUploadPath(
          {
            ...intent(),
            id: "11111111-2222-4333-8444-555555555555",
            owner: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          },
          extension,
        ),
      ).toThrow();
    },
  );
  it("recovers a committed insert after a lost reply without inserting or uploading twice", async () => {
    const attempt = intent();
    let saved: typeof row | null = null;
    const upload = vi.fn(async () => row.image_url);
    const insert = vi.fn(async () => {
      saved = row;
      throw new TypeError("lost response");
    });
    const find = vi.fn(async () => saved);
    expect(await saveScanOnce(attempt, { upload, insert, find })).toEqual(row);
    expect(await saveScanOnce(attempt, { upload, insert, find })).toEqual(row);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(attempt.id, row.image_url);
  });
  it("does not retry a write when the reconciliation read is also unavailable", async () => {
    const attempt = intent();
    const upload = vi.fn(async () => row.image_url);
    const insert = vi.fn(async () => {
      throw new TypeError("lost");
    });
    const find = vi.fn(async () => {
      throw new TypeError("offline");
    });
    await expect(saveScanOnce(attempt, { upload, insert, find })).rejects.toMatchObject({
      uncertain: true,
    });
    await expect(saveScanOnce(attempt, { upload, insert, find })).rejects.toThrow();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it("reuses the ID and uploaded image on a later explicit retry", async () => {
    const attempt = intent();
    const upload = vi.fn(async () => row.image_url);
    const insert = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(row);
    const find = vi.fn(async () => null);
    await expect(saveScanOnce(attempt, { upload, insert, find })).rejects.toMatchObject({
      uncertain: true,
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(await saveScanOnce(attempt, { upload, insert, find })).toEqual(row);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls.map((c) => c[0])).toEqual([attempt.id, attempt.id]);
  });
  it("never inserts when an image upload has not been acknowledged", async () => {
    const attempt = intent(),
      insert = vi.fn(),
      find = vi.fn();
    await expect(
      saveScanOnce(attempt, {
        find,
        insert,
        upload: async () => {
          throw new Error("upload failed");
        },
      }),
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
    expect(attempt.insertStarted).toBe(false);
  });
  it.each([
    { ...row, user_id: "peer" },
    { ...row, id: "other" },
    { ...row, image_url: "different" },
  ])("rejects foreign or inconsistent recovered records", async (other) => {
    const attempt = { ...intent(), insertStarted: true, imagePath: row.image_url };
    const insert = vi.fn();
    await expect(saveScanOnce(attempt, { find: async () => other, insert })).rejects.toMatchObject({
      uncertain: true,
    });
    expect(insert).not.toHaveBeenCalled();
  });
  it("distinguishes definite SQL rejection from an unknown outcome", async () => {
    const attempt = intent();
    await expect(
      saveScanOnce(attempt, {
        find: async () => null,
        insert: async () => {
          throw { code: "23514" };
        },
      }),
    ).rejects.toMatchObject({ uncertain: false });
  });
  it.each(["08006", "08007", "40003", "23505", "PGRST000"])(
    "keeps connection and unresolved completion errors uncertain: %s",
    async (code) => {
      await expect(
        saveScanOnce(intent(), {
          find: async () => null,
          insert: async () => {
            throw { code };
          },
        }),
      ).rejects.toMatchObject({ uncertain: true });
    },
  );
});
