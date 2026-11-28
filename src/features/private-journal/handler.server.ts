import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  journalCommand,
  journalReply,
  journalSnapshot,
  journalState,
  readingInWindow,
  uuid,
  type JournalCommand,
} from "./domain";

const exportCommand = z.strictObject({
  action: z.literal("export"),
  goalRevision: uuid,
  readingsRevision: uuid,
});
type Command = JournalCommand | z.infer<typeof exportCommand>;
const returned = z.union([
  z.object({
    status: z.literal(200),
    stamp: uuid,
    state: journalState,
    expiresAt: z.string().nullable(),
  }),
  z.object({ status: z.union([z.literal(400), z.literal(403), z.literal(409), z.literal(429)]) }),
]);

export const journalPaths = ["/api/dev11/journal", "/api/dev11/export"] as const;
export const journalProofHeader = "x-winesnap-dev11-proof";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export function journalUnavailable(status = 404) {
  return Response.json({ error: "private_journal_unavailable" }, { status, headers });
}

async function body(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(part.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }
}

export function createJournalHandler(deps: {
  proof: string;
  ownerForToken: (token: string) => Promise<string | undefined>;
  command: (owner: string, input: Command) => Promise<unknown>;
  confirm: (owner: string, stamp: string, expiresAt: string | null) => Promise<boolean>;
}) {
  if (!/^[a-f0-9]{64}$/.test(deps.proof)) throw new Error("Invalid private journal boundary");
  const expectedProof = Buffer.from(deps.proof, "hex");
  return async function handlePrivateJournal(request: Request) {
    const proof = request.headers.get(journalProofHeader);
    const url = new URL(request.url);
    if (
      !proof ||
      !/^[a-f0-9]{64}$/.test(proof) ||
      !timingSafeEqual(Buffer.from(proof, "hex"), expectedProof) ||
      url.search ||
      (url.pathname !== journalPaths[0] && url.pathname !== journalPaths[1])
    )
      return journalUnavailable();
    if (request.method !== "POST") return journalUnavailable(405);
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer ([a-zA-Z0-9._-]{20,4096})$/)?.[1];
    if (!token) return journalUnavailable(401);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
      return journalUnavailable(415);

    try {
      request.signal.throwIfAborted();
      const isExport = url.pathname === journalPaths[1];
      const input = (isExport ? exportCommand : journalCommand).safeParse(await body(request));
      if (!input.success) return journalUnavailable(400);
      if ("reading" in input.data && !readingInWindow(input.data.reading))
        return journalUnavailable(400);
      const owner = uuid.safeParse(await deps.ownerForToken(token));
      if (!owner.success) return journalUnavailable(401);
      request.signal.throwIfAborted();
      const output = returned.parse(await deps.command(owner.data, input.data));
      if (output.status !== 200) return journalUnavailable(output.status);
      const payload = isExport
        ? journalSnapshot.parse({
            version: 1,
            goal: output.state.goal,
            readings: output.state.readings.map(({ id, reading }) => ({ id, reading })),
          })
        : journalReply.parse({ state: output.state, validUntil: output.expiresAt });
      request.signal.throwIfAborted();
      if (!(await deps.confirm(owner.data, output.stamp, output.expiresAt)))
        return journalUnavailable(409);
      request.signal.throwIfAborted();
      return Response.json(payload, {
        headers: isExport
          ? {
              ...headers,
              "Content-Disposition": 'attachment; filename="winesnap-privat-journal.json"',
            }
          : headers,
      });
    } catch {
      return journalUnavailable(503);
    }
  };
}
