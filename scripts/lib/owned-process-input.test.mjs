import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { finishOwnedInput } from "./owned-process-input.mjs";
describe("owned process input EOF", () => {
  it("destroys only stdin and only after its final bytes have flushed", () => {
    let flush;
    const input = Buffer.from("synthetic-private-pipe-bytes");
    const stream = {
      on: vi.fn(),
      end: vi.fn((_input, callback) => {
        flush = callback;
      }),
      destroy: vi.fn(),
    };
    finishOwnedInput(stream, input);
    expect(stream.end).toHaveBeenCalledWith(input, expect.any(Function));
    expect(stream.destroy).not.toHaveBeenCalled();
    flush();
    expect(stream.destroy).toHaveBeenCalledOnce();
    expect(input.toString()).toBe("synthetic-private-pipe-bytes");
  });
  it("handles an early consumer close without throwing an unhandled EPIPE", () => {
    let onError;
    const stream = {
      on: (_name, callback) => {
        onError = callback;
      },
      end: vi.fn(),
      destroy: vi.fn(),
    };
    finishOwnedInput(stream, undefined);
    expect(() => onError(new Error("synthetic_EPIPE"))).not.toThrow();
  });
  it("delivers complete binary bytes and EOF to a real child without exposing them as arguments", async () => {
    const input = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < input.length; i++) input[i] = i % 251;
    const digest = createHash("sha256").update(input).digest("hex");
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          "import{createHash}from'node:crypto';const h=createHash('sha256');for await(const b of process.stdin)h.update(b);process.stdout.write(h.digest('hex'));",
        ],
        { windowsHide: true, timeout: 10000, maxBuffer: 1024 },
        (error, stdout) =>
          error ? reject(new Error("synthetic_child_input_failed")) : resolve(stdout),
      );
      finishOwnedInput(child.stdin, input);
    });
    expect(result).toBe(digest);
  }, 15000);
});
