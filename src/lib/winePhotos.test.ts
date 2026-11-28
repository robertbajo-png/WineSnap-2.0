import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), capture: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("./accountWriteScope", () => ({ accountWriteClient: mocks.capture }));
import {
  createPhotoSaveAttempt,
  loadWinePhotos,
  removeWinePhoto,
  saveWinePhoto,
  type WinePhoto,
} from "./winePhotos";

type Row = Record<string, unknown>;
const owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  wineId = "11111111-2222-4333-8444-555555555555",
  photoId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const path = `${owner}/${wineId}/${photoId}.jpg`;
const photo = (): WinePhoto => ({
  id: photoId,
  user_id: owner,
  wine_id: wineId,
  url: path,
  storage_path: path,
  kind: "bottle",
  sort_order: 1,
});
let state: {
  rows: Map<string, WinePhoto>;
  files: Set<string>;
  wines: Row[];
  events: string[];
  uploadError: boolean;
  insertLost: boolean;
  findError: boolean;
  deleteDenied: boolean;
  fileError: boolean;
  listError: boolean;
  publicReadError: boolean;
  referenceError: boolean;
};
let current: boolean;
const scope = { owner, current: () => current };
class Query {
  action = "read";
  singleRow = false;
  filters: Row = {};
  row: Row = {};
  start = 0;
  end = 499;
  constructor(public table: string) {}
  select() {
    return this;
  }
  order() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters[key] = value;
    return this;
  }
  insert(row: Row) {
    this.action = "insert";
    this.row = row;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  range(start: number, end: number) {
    this.start = start;
    this.end = end;
    return this;
  }
  maybeSingle() {
    this.singleRow = true;
    return this;
  }
  single() {
    return this.maybeSingle();
  }
  then(
    resolve: (result: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) {
    return Promise.resolve()
      .then(() => this.execute())
      .then(resolve, reject);
  }
  execute(): { data: unknown; error: unknown } {
    if (this.action === "insert") {
      state.events.push("insert");
      state.rows.set(String(this.row.id), this.row as WinePhoto);
      return state.insertLost
        ? { data: null, error: { message: "synthetic lost response" } }
        : { data: this.row, error: null };
    }
    if (this.action === "delete") {
      state.events.push("metadata-delete");
      if (!state.deleteDenied) state.rows.delete(String(this.filters.id));
      return { data: null, error: state.deleteDenied ? { code: "42501" } : null };
    }
    if (this.table === "wines" && this.singleRow) return { data: { id: wineId }, error: null };
    if (this.table === "wine_photos" && this.singleRow)
      return {
        data: state.rows.get(String(this.filters.id)) ?? null,
        error: state.findError ? { message: "synthetic read failure" } : null,
      };
    if (state.referenceError && this.table === "wines")
      return { data: null, error: { message: "synthetic reference failure" } };
    if (state.publicReadError && this.table === "wine_photos" && !this.filters.user_id)
      return { data: null, error: { message: "synthetic read failure" } };
    const rows: Row[] = this.table === "wines" ? state.wines : [...state.rows.values()];
    return { data: rows.slice(this.start, this.end + 1), error: null };
  }
}
const upload = vi.fn(async (key: string) => {
  state.events.push("upload");
  state.files.add(key);
  return { error: state.uploadError ? { message: "synthetic upload response lost" } : null };
});
const remove = vi.fn(async (paths: string[]) => {
  state.events.push("file-delete");
  if (!state.fileError) paths.forEach((key) => state.files.delete(key));
  return { error: state.fileError ? { message: "synthetic cleanup failure" } : null };
});
const list = vi.fn(async (folder: string) => ({
  data: [...state.files]
    .filter((key) => key.startsWith(folder + "/"))
    .map((key) => ({ name: key.slice(folder.length + 1) })),
  error: state.listError ? { message: "synthetic list failure" } : null,
}));
const client = {
  from: (table: string) => new Query(table),
  rpc: vi.fn(async () => ({ data: true, error: null })),
  storage: { from: () => ({ upload, remove, list }) },
};
beforeEach(() => {
  vi.clearAllMocks();
  current = true;
  state = {
    rows: new Map(),
    files: new Set(),
    wines: [],
    events: [],
    uploadError: false,
    insertLost: false,
    findError: false,
    deleteDenied: false,
    fileError: false,
    listError: false,
    publicReadError: false,
    referenceError: false,
  };
  mocks.from.mockImplementation((table: string) => new Query(table));
  mocks.capture.mockResolvedValue(client);
});

describe("owner-bound gallery persistence and reconciliation", () => {
  it.each([
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["image/avif", "avif"],
  ])("preserves the actual %s image format", async (mime, extension) => {
    const attempt = createPhotoSaveAttempt(
      owner,
      wineId,
      new Blob(["synthetic-image"], { type: mime }),
      1,
    );
    expect(attempt.path.endsWith("." + extension)).toBe(true);
    await saveWinePhoto(attempt, scope);
    expect(upload).toHaveBeenCalledWith(
      attempt.path,
      attempt.blob,
      expect.objectContaining({ contentType: mime, upsert: true }),
    );
  });
  it("rejects unsupported and oversized images before any account or storage operation", () => {
    expect(() =>
      createPhotoSaveAttempt(owner, wineId, new Blob(["<svg/>"], { type: "image/svg+xml" }), 1),
    ).toThrow();
    expect(() =>
      createPhotoSaveAttempt(
        owner,
        wineId,
        new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/jpeg" }),
        1,
      ),
    ).toThrow();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
  it("does not disguise a read failure as an empty gallery", async () => {
    state.publicReadError = true;
    await expect(loadWinePhotos(wineId)).rejects.toThrow("unavailable");
    state.publicReadError = false;
    expect(await loadWinePhotos(wineId)).toEqual([]);
  });
  it("uses the same private path and immutable image for a lost-upload retry", async () => {
    const attempt = createPhotoSaveAttempt(
      owner,
      wineId,
      new Blob(["synthetic-image"], { type: "image/jpeg" }),
      1,
    );
    state.uploadError = true;
    await expect(saveWinePhoto(attempt, scope)).rejects.toThrow();
    state.uploadError = false;
    await saveWinePhoto(attempt, scope);
    expect(upload.mock.calls.map((call) => call[0])).toEqual([attempt.path, attempt.path]);
    expect(state.files.size).toBe(1);
    expect(state.rows.size).toBe(1);
    expect(state.events.filter((event) => event === "insert")).toHaveLength(1);
  });
  it("reconciles a committed insert after a lost reply without inserting/uploading twice", async () => {
    const attempt = createPhotoSaveAttempt(
      owner,
      wineId,
      new Blob(["synthetic-image"], { type: "image/jpeg" }),
      1,
    );
    state.insertLost = true;
    await saveWinePhoto(attempt, scope);
    await saveWinePhoto(attempt, scope);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(state.events.filter((event) => event === "insert")).toHaveLength(1);
  });
  it("keeps an uncertain attempt until a later explicit read confirms it", async () => {
    const attempt = createPhotoSaveAttempt(
      owner,
      wineId,
      new Blob(["synthetic-image"], { type: "image/jpeg" }),
      1,
    );
    state.insertLost = true;
    state.findError = true;
    await expect(saveWinePhoto(attempt, scope)).rejects.toThrow();
    state.findError = false;
    await saveWinePhoto(attempt, scope);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(state.rows.size).toBe(1);
  });
  it("rejects foreign scopes before uploading", async () => {
    const attempt = createPhotoSaveAttempt(
      owner,
      wineId,
      new Blob(["x"], { type: "image/jpeg" }),
      1,
    );
    await expect(saveWinePhoto(attempt, { owner: photoId, current: () => true })).rejects.toThrow();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
  it("stops between upload and insert if the view/account is invalidated", async () => {
    const attempt = createPhotoSaveAttempt(
      owner,
      wineId,
      new Blob(["x"], { type: "image/jpeg" }),
      1,
    );
    upload.mockImplementationOnce(async (key) => {
      state.files.add(key);
      current = false;
      return { error: null };
    });
    await expect(saveWinePhoto(attempt, scope)).rejects.toThrow();
    expect(state.rows.size).toBe(0);
  });
  it("never deletes bytes when metadata deletion was denied", async () => {
    state.rows.set(photoId, photo());
    state.files.add(path);
    state.deleteDenied = true;
    await expect(removeWinePhoto(photo(), scope)).rejects.toThrow("unconfirmed");
    expect(remove).not.toHaveBeenCalled();
    expect(state.files.has(path)).toBe(true);
  });
  it("deletes metadata first, then confirms the exact file is absent through allowed listing", async () => {
    state.rows.set(photoId, photo());
    state.files.add(path);
    expect(await removeWinePhoto(photo(), scope)).toBe("deleted");
    expect(state.events).toEqual(["metadata-delete", "file-delete"]);
    expect(list).toHaveBeenCalledWith(`${owner}/${wineId}`, {
      search: `${photoId}.jpg`,
      limit: 1000,
    });
  });
  it("retains images referenced by a wine, including legacy signed/public URLs", async () => {
    state.rows.set(photoId, photo());
    state.files.add(path);
    state.wines = [
      {
        image_url: `https://example.invalid/storage/v1/object/sign/wine-labels/${path}?token=synthetic`,
      },
    ];
    expect(await removeWinePhoto(photo(), scope)).toBe("retained");
    expect(remove).not.toHaveBeenCalled();
  });
  it("checks subsequent pages before removing any referenced file", async () => {
    state.rows.set(photoId, photo());
    state.files.add(path);
    state.wines = [
      ...Array.from({ length: 500 }, () => ({ image_url: null })),
      { image_url: path },
    ];
    expect(await removeWinePhoto(photo(), scope)).toBe("retained");
    expect(remove).not.toHaveBeenCalled();
  });
  it("allows only exact-owner, exact-wine object paths to be physically deleted", async () => {
    const foreign = {
      ...photo(),
      storage_path: `${photoId}/foreign.jpg`,
      url: `${photoId}/foreign.jpg`,
    };
    state.rows.set(photoId, foreign);
    expect(await removeWinePhoto(foreign, scope)).toBe("retained");
    expect(remove).not.toHaveBeenCalled();
  });
  it("retries cleanup without repeating an already confirmed metadata deletion", async () => {
    state.rows.set(photoId, photo());
    state.files.add(path);
    state.fileError = true;
    await expect(removeWinePhoto(photo(), scope)).rejects.toThrow("cleanup");
    state.fileError = false;
    expect(await removeWinePhoto(photo(), scope)).toBe("deleted");
    expect(state.events.filter((event) => event === "metadata-delete")).toHaveLength(1);
  });
  it("does not claim deletion if listing or reference verification failed", async () => {
    state.rows.set(photoId, photo());
    state.files.add(path);
    state.referenceError = true;
    await expect(removeWinePhoto(photo(), scope)).rejects.toThrow();
    expect(remove).not.toHaveBeenCalled();
    state.referenceError = false;
    state.listError = true;
    await expect(removeWinePhoto(photo(), scope)).rejects.toThrow("cleanup");
  });
});
