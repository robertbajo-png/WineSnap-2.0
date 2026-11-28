import { lstat, readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { z } from "zod";
import { approvedLocalBackend, ownedBackendOrigin } from "@/lib/backendScope";
import { localBackendFetch } from "@/lib/localCredentials.server";
import { createJournalHandler, journalProofHeader, journalUnavailable } from "./handler.server";

const location = "/tmp/winesnap-dev11";
const secret = z.string().regex(/^[a-f0-9]{64}$/);
const credentials = z.strictObject({
  proof: secret,
  password: secret,
  anon: z
    .string()
    .max(4096)
    .refine((token) => {
      try {
        const parts = token.split(".");
        const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        return (
          parts.length === 3 && claims.role === "anon" && claims.ref === "winesnap-owned-local"
        );
      } catch {
        return false;
      }
    }),
});

async function initialize() {
  const file = location + "/credentials.json";
  const dir = await lstat(location);
  const entry = await lstat(file);
  const uid = process.getuid?.();
  if (
    !dir.isDirectory() ||
    !entry.isFile() ||
    !uid ||
    dir.uid !== uid ||
    entry.uid !== uid ||
    dir.mode & 0o077 ||
    entry.mode & 0o077 ||
    entry.size > 8192
  )
    throw new Error("Private journal credentials unavailable");
  const { proof, password, anon } = credentials.parse(JSON.parse(await readFile(file, "utf8")));
  const auth = createClient(ownedBackendOrigin, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: localBackendFetch },
  }).auth;
  const sql = postgres({
    host: "winesnap-owned-db",
    port: 5432,
    database: "postgres",
    username: "winesnap_dev11_api",
    password,
    idle_timeout: 8,
    connect_timeout: 4,
    max: 2,
    connection: { statement_timeout: 5000, application_name: "winesnap-dev11" },
    onnotice: () => {},
  });
  return createJournalHandler({
    proof,
    ownerForToken: async (token) => {
      const result = await auth.getUser(token);
      return result.error ? undefined : result.data.user?.id;
    },
    command: async (owner, input) => {
      const rows = await sql`
        SELECT winesnap_dev11_control.command(${owner}::uuid,${sql.json(input)}::jsonb) AS result
      `;
      return rows[0]?.result;
    },
    confirm: async (owner, stamp, expiresAt) => {
      const rows = await sql`
        SELECT winesnap_dev11_control.confirm(${owner}::uuid,${stamp}::uuid,${expiresAt}::timestamptz) AS okay
      `;
      return rows[0]?.okay === true;
    },
  });
}

let runtime: ReturnType<typeof initialize> | undefined;

export async function handleOwnedPrivateJournal(request: Request) {
  if (
    process.env.WINESNAP_OWNED_DEV11_ENABLED !== "true" ||
    approvedLocalBackend(process.env) !== ownedBackendOrigin ||
    !/^[a-f0-9]{64}$/.test(request.headers.get(journalProofHeader) ?? "")
  )
    return journalUnavailable();
  try {
    const handle = await (runtime ??= initialize());
    return handle(request);
  } catch {
    return journalUnavailable();
  }
}
