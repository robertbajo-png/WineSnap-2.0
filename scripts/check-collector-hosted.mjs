import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const url = "https://pzniyupmgwvlldvztzqh.supabase.co";
const credentials = JSON.parse(await readFile(process.argv[2], "utf8"));
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
  },
};
const admin = createClient(url, credentials.secretKey, options);
const ok = ({ data, error }) => {
  if (error) throw new Error(`Collector API failure (${error.code || error.status || "unknown"})`);
  return data;
};
const fixtureFile = process.argv[3];
if (process.argv[4] === "--cleanup") {
  const fixture = JSON.parse(await readFile(fixtureFile, "utf8"));
  const data = ok(await admin.auth.admin.getUserById(fixture.userId));
  assert.equal(data.user.email, fixture.email);
  assert.ok(
    fixture.email.startsWith("winesnap-collector-") && fixture.email.endsWith("@example.test"),
  );
  ok(await admin.auth.admin.deleteUser(fixture.userId));
  console.log("Synthetic collector UI fixture removed");
} else {
  const users = [];
  let passed = 0;
  let retain = false;
  async function check(name, run) {
    await run();
    passed++;
    console.log(`PASS ${name}`);
  }
  try {
    for (let i = 0; i < 2; i++) {
      const email = `winesnap-collector-${randomUUID()}@example.test`;
      const password = randomUUID() + randomUUID();
      const { user } = ok(
        await admin.auth.admin.createUser({ email, password, email_confirm: true }),
      );
      const entry = { id: user.id, email, password };
      users.push(entry);
      entry.client = createClient(url, credentials.publicKey, options);
      ok(await entry.client.auth.signInWithPassword({ email, password }));
    }
    const [owner, stranger] = users;
    const anon = createClient(url, credentials.publicKey, options);
    const wine = ok(
      await owner.client
        .from("wines")
        .insert({
          user_id: owner.id,
          producer: "Synthetic QA",
          wine_name: "Collector test wine",
          vintage: 2023,
          quantity: 2,
          is_public: true,
          notes: "SYNTHETIC COLLECTOR FIXTURE",
        })
        .select()
        .single(),
    );
    const payload = {
      user_id: owner.id,
      wine_id: wine.id,
      purpose: "invest",
      purchased_at: "2026-10-04",
      quantity: 1,
      remaining: 1,
      bottle_ml: 750,
      unit_cost: 100,
      additional_cost: 10,
      currency: "SEK",
      storage: "PRIVATE SYNTHETIC STORAGE",
    };
    const lot = ok(await owner.client.from("collector_lots").insert(payload).select().single());
    await check("owner JWT creates and reads acquisition", async () =>
      assert.equal(
        ok(await owner.client.from("collector_lots").select("id").eq("id", lot.id)).length,
        1,
      ),
    );
    await check("public wine does not expose acquisitions to another JWT", async () =>
      assert.equal(
        ok(await stranger.client.from("collector_lots").select("*").eq("wine_id", wine.id)).length,
        0,
      ),
    );
    await check("anonymous cannot read acquisitions", async () =>
      assert.ok((await anon.from("collector_lots").select("*")).error),
    );
    await check("other JWT cannot edit acquisition", async () =>
      assert.equal(
        ok(
          await stranger.client
            .from("collector_lots")
            .update({ storage: "FORGED" })
            .eq("id", lot.id)
            .select(),
        ).length,
        0,
      ),
    );
    await check("other JWT cannot delete acquisition", async () =>
      assert.equal(
        ok(await stranger.client.from("collector_lots").delete().eq("id", lot.id).select()).length,
        0,
      ),
    );
    await check("other JWT cannot forge ownership", async () =>
      assert.ok((await stranger.client.from("collector_lots").insert(payload)).error),
    );
    await check("other JWT cannot allocate someone else's wine", async () =>
      assert.ok(
        (await stranger.client.from("collector_lots").insert({ ...payload, user_id: stranger.id }))
          .error,
      ),
    );
    await check("owner cannot transfer acquisition identity", async () =>
      assert.ok(
        (
          await owner.client
            .from("collector_lots")
            .update({ user_id: stranger.id })
            .eq("id", lot.id)
        ).error,
      ),
    );
    await check("incomplete estimate is rejected", async () =>
      assert.ok(
        (await owner.client.from("collector_lots").update({ estimate_price: 150 }).eq("id", lot.id))
          .error,
      ),
    );
    await check("negative amounts are rejected", async () =>
      assert.ok(
        (await owner.client.from("collector_lots").update({ unit_cost: -1 }).eq("id", lot.id))
          .error,
      ),
    );
    await check("owner saves a complete sourced estimate", async () => {
      const saved = ok(
        await owner.client
          .from("collector_lots")
          .update({
            estimate_price: 150,
            estimate_currency: "SEK",
            estimate_date: "2026-10-04",
            estimate_source: "Synthetic QA quote",
            estimate_confidence: "low",
          })
          .eq("id", lot.id)
          .select()
          .single(),
      );
      assert.equal(saved.estimate_price, 150);
    });
    await check("stock reduction below allocated quantity is rejected", async () =>
      assert.ok((await owner.client.from("wines").update({ quantity: 0 }).eq("id", wine.id)).error),
    );
    await check("consumption of allocated stock is rejected", async () =>
      assert.ok(
        (await owner.client.from("wines").update({ consumed_at: "2026-10-04" }).eq("id", wine.id))
          .error,
      ),
    );
    await check("concurrent JWT allocations cannot exceed stock", async () => {
      const responses = await Promise.all([
        owner.client.from("collector_lots").insert(payload),
        owner.client.from("collector_lots").insert(payload),
      ]);
      assert.equal(responses.filter((r) => !r.error).length, 1);
      assert.equal(responses.filter((r) => r.error).length, 1);
    });
    await check("closing allocations permits subsequent stock updates", async () => {
      ok(await owner.client.from("collector_lots").update({ remaining: 0 }).eq("wine_id", wine.id));
      ok(
        await owner.client
          .from("wines")
          .update({ quantity: 1, consumed_at: "2026-10-04" })
          .eq("id", wine.id),
      );
      ok(
        await owner.client
          .from("wines")
          .update({ quantity: 2, consumed_at: null })
          .eq("id", wine.id),
      );
    });
    if (fixtureFile) {
      await writeFile(
        fixtureFile,
        JSON.stringify({
          userId: owner.id,
          email: owner.email,
          password: owner.password,
          wineId: wine.id,
        }),
      );
      retain = true;
    }
    console.log(
      `Collector hosted JWT checks: ${passed} passed; synthetic UI fixture ${retain ? "retained temporarily" : "not retained"}`,
    );
  } finally {
    for (let i = 0; i < users.length; i++) {
      if (i === 0 && retain) continue;
      ok(await admin.auth.admin.deleteUser(users[i].id));
    }
  }
}
