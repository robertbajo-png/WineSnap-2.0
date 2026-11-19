// Runs only inside an isolated, non-networked Node container. Output for read is private.
export async function ownedGateArchiveTask() {
  const assert = (await import("node:assert/strict")).default;
  const { readFile, writeFile, mkdir, lstat } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const { DatabaseSync } = await import("node:sqlite");
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  let size = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert.ok(size <= 32 * 1024 * 1024);
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString());
  assert.ok(["read", "restore"].includes(input.action));
  const names = ["gate.sqlite3", "gate.sqlite3-wal", "gate.sqlite3-shm"];
  const directory = input.action === "read" ? "/data" : "/tmp/gate-restore";
  let files;
  if (input.action === "restore") {
    assert.ok(Array.isArray(input.files) && input.files.length >= 1 && input.files.length <= 3);
    assert.equal(input.files[0].name, names[0]);
    assert.equal(new Set(input.files.map((f) => f.name)).size, input.files.length);
    await mkdir(directory, { mode: 0o700 });
    let total = 0;
    for (const file of input.files) {
      assert.ok(names.includes(file.name));
      assert.ok(typeof file.base64 === "string" && file.base64.length <= 12 * 1024 * 1024);
      const bytes = Buffer.from(file.base64, "base64");
      total += bytes.length;
      assert.ok(total <= 16 * 1024 * 1024);
      assert.equal(bytes.toString("base64"), file.base64);
      assert.equal(digest(bytes), file.sha256);
      await writeFile(directory + "/" + file.name, bytes, { mode: 0o600, flag: "wx" });
      bytes.fill(0);
    }
    files = input.files;
  } else {
    files = [];
    let total = 0;
    for (const name of names) {
      let info;
      try {
        info = await lstat(directory + "/" + name);
      } catch (error) {
        if (error.code === "ENOENT" && name !== names[0]) continue;
        throw error;
      }
      assert.ok(
        info.isFile() &&
          !info.isSymbolicLink() &&
          info.uid === 1000 &&
          info.size <= 8 * 1024 * 1024,
      );
      const bytes = await readFile(directory + "/" + name);
      total += bytes.length;
      assert.ok(total <= 16 * 1024 * 1024);
      files.push({ name, base64: bytes.toString("base64"), sha256: digest(bytes) });
      bytes.fill(0);
    }
  }
  const db = new DatabaseSync(directory + "/gate.sqlite3", { readOnly: true });
  let manifest;
  try {
    assert.deepEqual(
      db
        .prepare("PRAGMA integrity_check")
        .all()
        .map((row) => row.integrity_check),
      ["ok"],
    );
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    assert.ok(tables.length > 0 && tables.length <= 100);
    manifest = tables.map(({ name }) => ({
      name,
      rows: db.prepare('SELECT count(*) AS n FROM "' + name.replaceAll('"', '""') + '"').get().n,
    }));
  } finally {
    db.close();
  }
  if (input.action === "restore") {
    assert.deepEqual(manifest, input.manifest);
    console.log(
      JSON.stringify({
        restored: true,
        integrity: true,
        tables: manifest.length,
        files: files.length,
      }),
    );
  } else console.log(JSON.stringify({ files, manifest }));
}

export const ownedGateArchiveCode = `(${ownedGateArchiveTask.toString()})();`;
