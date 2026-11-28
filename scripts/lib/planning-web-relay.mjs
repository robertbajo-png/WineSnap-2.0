import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// This process can reach only the cloned web server's own loopback listener.
const inContainer = `
import {createInterface} from "node:readline";
const origin = "http://127.0.0.1:3000";
async function serve(line) {
  let id;
  try {
    if (line.length > 4096) throw Error();
    const req = JSON.parse(line);
    id = req.id;
    if (!Number.isSafeInteger(id) || !["GET", "HEAD"].includes(req.method) ||
        !req.path.startsWith("/") || req.path.startsWith("//") || req.path.includes("\\\\"))
      throw Error();
    const url = new URL(req.path, origin);
    if (url.origin !== origin || url.username || url.password) throw Error();
    const response = await fetch(url, { method: req.method, redirect: "manual",
      signal: AbortSignal.timeout(15000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 8388608) throw Error();
    const headers = Object.fromEntries([...response.headers].filter(([key]) =>
      ["content-type","location","cache-control"].includes(key)));
    return { id, status: response.status, headers, bytes: bytes.toString("base64") };
  } catch { return { id, failure: true }; }
}
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines)
  void serve(line).then((value) => process.stdout.write(JSON.stringify(value) + "\\n"));
`;

export function openPlanningWebRelay(docker, engine, env, id) {
  const relay = openPlanningRelay(docker, engine, env, id, inContainer, 4096);
  return {
    request(path, method = "GET") {
      assert.ok(typeof path === "string" && path.length < 2048);
      return relay.request({ path, method });
    },
    close: relay.close,
  };
}

export function openPlanningRelay(docker, engine, env, id, program, inputLimit) {
  assert.match(id, /^[a-f0-9]{64}$/);
  const proc = spawn(
    docker,
    [
      "--host",
      engine,
      "exec",
      "--interactive",
      id,
      "node",
      "--input-type=module",
      "--eval",
      program,
    ],
    { env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
  );
  let next = 0,
    closed = false;
  const pending = new Map();
  const lines = createInterface({ input: proc.stdout, crlfDelay: Infinity });
  const fail = () => {
    closed = true;
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error("isolated_web_relay_closed"));
    }
    pending.clear();
  };
  const done = new Promise((resolve) => proc.once("close", resolve));
  proc.on("close", fail);
  proc.on("error", fail);
  proc.stdin.on("error", fail);
  lines.on("line", (line) => {
    try {
      assert.ok(line.length <= 12 * 1024 * 1024);
      const value = JSON.parse(line);
      const request = pending.get(value.id);
      if (!request) return;
      pending.delete(value.id);
      clearTimeout(request.timer);
      if (value.failure) return request.reject(new Error("isolated_web_request_failed"));
      request.resolve({
        status: value.status,
        headers: value.headers,
        body: Buffer.from(value.bytes, "base64"),
      });
    } catch {
      fail();
      proc.kill();
    }
  });
  return {
    request(input) {
      assert.ok(!closed && pending.size < 64);
      const id = ++next;
      const line = JSON.stringify({ ...input, id }) + "\n";
      assert.ok(line.length <= inputLimit);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("isolated_web_relay_timeout"));
        }, 25000);
        pending.set(id, { resolve, reject, timer });
        proc.stdin.write(line);
      });
    },
    async close() {
      fail();
      lines.close();
      proc.stdin.destroy();
      if (proc.exitCode === null) proc.kill();
      await done;
    },
  };
}
