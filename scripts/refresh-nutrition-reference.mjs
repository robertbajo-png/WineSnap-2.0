import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

// Maintainer-only public data import, never called by the app or with user ingredients.
assert.deepEqual(process.argv.slice(2), ["--update"]);
const base = "https://dataportal.livsmedelsverket.se/livsmedel";
const selections = [
  [35, "as_sold"],
  [103, "as_sold"],
  [320, "raw"],
  [322, "raw"],
  [325, "raw"],
  [333, "raw"],
  [344, "raw"],
  [362, "raw"],
  [364, "raw"],
  [371, "raw"],
  [4941, "raw"],
  [1715, "as_sold"],
  [1225, "raw"],
  [2481, "dry"],
  [845, "dry"],
  [1953, "as_sold"],
  [1975, "as_sold"],
  [559, "raw"],
  [880, "cooked"],
];
async function get(path) {
  const url = new URL(base + path);
  assert.equal(url.origin, "https://dataportal.livsmedelsverket.se");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, "public_reference_unavailable");
  const text = await response.text();
  assert.ok(text.length < 200000);
  return JSON.parse(text);
}
const api = await get("/api/v1/api-info"),
  swagger = await get("/swagger/v1/swagger.json");
assert.equal(api.apiStatus, "active");
assert.equal(swagger.info.license.url, "https://creativecommons.org/licenses/by/4.0/deed.sv");
const records = [];
for (const [id, form] of selections) {
  const food = await get(`/api/v1/livsmedel/${id}?sprak=1`),
    nutrients = await get(`/api/v1/livsmedel/${id}/naringsvarden?sprak=1`);
  assert.equal(food.nummer, id);
  assert.ok(food.namn && food.version && Array.isArray(nutrients));
  for (const code of ["CHO", "FIBT", "PROT", "FAT"]) {
    const found = nutrients.filter((n) => n.euroFIRkod === code);
    assert.ok(found.length <= 1);
    if (found[0]) {
      assert.equal(found[0].enhet, "g");
      assert.equal(found[0].viktGram, 100);
      assert.equal(found[0].matrisenhetkod, "W");
      assert.ok(
        found[0].varde === null ||
          (Number.isFinite(found[0].varde) && found[0].varde >= 0 && found[0].varde <= 100),
      );
    }
  }
  assert.ok(
    Date.parse(food.version) <= Date.parse("2026-07-02T00:00:00Z"),
    "review_dataset_version_before_refresh",
  );
  const selected = nutrients.filter((n) => ["CHO", "FIBT", "PROT", "FAT"].includes(n.euroFIRkod));
  const record = { id, form, food, nutrients: selected };
  record.sha256 = createHash("sha256")
    .update(JSON.stringify({ food, nutrients: selected }))
    .digest("hex");
  records.push(record);
}
await writeFile(
  new URL("../src/features/nutrition/slv-reference.json", import.meta.url),
  JSON.stringify(
    {
      datasetVersion: "2026-07-01",
      retrievedAt: new Date().toISOString(),
      attribution: "Livsmedelsverkets Livsmedelsdatabas version 2026-07-01",
      license: swagger.info.license,
      api,
      records,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    publicSource: base,
    records: records.length,
    personalDataSent: false,
    productionTouched: false,
  }),
);
