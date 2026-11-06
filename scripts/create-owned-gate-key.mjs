// Private stdin/stdout protocol. Only run through configure-owned-gate.ps1.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hashOwnedGatePassword } from "./lib/owned-gate.mjs";

assert.equal(process.env.WINESNAP_OWNED_GATE_SETUP_PIPE, "1");
assert.ok(!process.stdin.isTTY && !process.stdout.isTTY);
assert.equal(process.argv.length, 2);
const chunks = [];
let size = 0;
let password;
try {
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert.ok(size <= 256);
    chunks.push(chunk);
  }
  password = Buffer.concat(chunks);
  assert.ok(!password.includes(0) && !password.includes(10) && !password.includes(13));
  const passwordHash = await hashOwnedGatePassword(password);
  console.log(
    JSON.stringify({
      version: 1,
      project: "winesnap-owned-local",
      hostname: "winesnap.boleoai.se",
      username: "robert",
      passwordHash,
      sessionSecret: randomBytes(32).toString("hex"),
      storageKey: randomBytes(32).toString("hex"),
      resetSecret: randomBytes(32).toString("hex"),
    }),
  );
} catch {
  process.exitCode = 1;
} finally {
  password?.fill(0);
  for (const chunk of chunks) chunk.fill(0);
}
