import { accountAccessToken, type AccountWriteScope } from "@/lib/accountWriteScope";
import { journalReply, journalSnapshot, type JournalCommand, type JournalState } from "./domain";
import { canOpenPrivateJournal, privateJournalEndpoint } from "./feature";

export class JournalRequestError extends Error {
  constructor(readonly status: number) {
    super("private_journal_unavailable");
  }
}

async function call(
  path: "journal" | "export",
  body: unknown,
  scope: AccountWriteScope,
  signal: AbortSignal,
) {
  if (!canOpenPrivateJournal() || !navigator.onLine) throw new JournalRequestError(404);
  const access = await accountAccessToken(scope, 8000, signal);
  if (!scope.current()) throw new JournalRequestError(409);
  const response = await fetch(privateJournalEndpoint + "/api/dev11/" + path, {
    method: "POST",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + access },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(21000)]),
  });
  if (!response.ok) throw new JournalRequestError(response.status);
  const result: unknown = await response.json();
  if (!scope.current() || signal.aborted) throw new JournalRequestError(409);
  return result;
}

export async function sendJournal(
  command: JournalCommand,
  scope: AccountWriteScope,
  signal: AbortSignal,
) {
  return journalReply.parse(await call("journal", command, scope, signal));
}

export async function exportJournal(
  state: JournalState,
  scope: AccountWriteScope,
  signal: AbortSignal,
) {
  return journalSnapshot.parse(
    await call(
      "export",
      {
        action: "export",
        goalRevision: state.goalChoice.revision,
        readingsRevision: state.readingsChoice.revision,
      },
      scope,
      signal,
    ),
  );
}
