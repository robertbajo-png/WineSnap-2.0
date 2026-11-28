const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const maxBytes = 256 * 1024;
const quietTransaction = `BEGIN;
SET LOCAL search_path = '';
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '8s';
SET LOCAL log_statement = 'none';
SET LOCAL log_duration = off;
SET LOCAL log_min_duration_statement = -1;
SET LOCAL log_min_duration_sample = -1;
SET LOCAL log_transaction_sample_rate = 0;
SET LOCAL log_min_error_statement = 'panic';
SET LOCAL log_min_messages = 'panic';
SET LOCAL log_parameter_max_length = 0;
SET LOCAL log_parameter_max_length_on_error = 0;
SET LOCAL TIME ZONE 'UTC';`;

function refuse() {
  return new Error("Private journal operator unavailable");
}

// The executor must use a verified, local database container and a private stdin/stdout pipe.
export function createOwnedJournalOperator({ execute, backendId, journalId }) {
  if (
    typeof execute !== "function" ||
    typeof backendId !== "string" ||
    !/^[a-f0-9]{32}$/.test(backendId) ||
    typeof journalId !== "string" ||
    !uuid.test(journalId)
  )
    throw refuse();
  const installation = `'${journalId}'::uuid`;
  const bound = `EXISTS (SELECT 1 FROM winesnap_local.installation WHERE id = '${backendId}')
    AND EXISTS (SELECT 1 FROM winesnap_dev11_control.installation WHERE identity = ${installation})`;
  const active = (attempt) => {
    if (typeof attempt !== "string" || !uuid.test(attempt)) throw refuse();
    return `${bound}
      AND EXISTS (SELECT 1 FROM winesnap_dev11_control.maintenance
        WHERE installation = ${installation} AND attempt = '${attempt}'::uuid
          AND started_at <= clock_timestamp() AND started_at > clock_timestamp() - interval '5 minutes'
        FOR SHARE)`;
  };
  async function scalar(statement) {
    try {
      const returned = await execute(`${quietTransaction}\n${statement};\nCOMMIT;`);
      if (typeof returned !== "string" || Buffer.byteLength(returned) > maxBytes) throw refuse();
      return returned.trim();
    } catch {
      throw refuse();
    }
  }
  return Object.freeze({
    async begin() {
      const result = await scalar(
        `SELECT winesnap_dev11_control.maintenance_begin(${installation}) WHERE ${bound}`,
      );
      if (!result) return null;
      if (!uuid.test(result)) throw refuse();
      return result;
    },
    async pass(attempt) {
      if (typeof attempt !== "string" || !uuid.test(attempt)) throw refuse();
      const result = await scalar(
        `SELECT winesnap_dev11_control.maintenance_pass(${installation},'${attempt}'::uuid) WHERE ${bound}`,
      );
      return result === "t";
    },
    async prune(attempt) {
      const result = await scalar(`SELECT winesnap_dev11_control.prune() WHERE ${active(attempt)}`);
      if (!/^(0|[1-9]\d{0,2})$/.test(result) || Number(result) > 600) throw refuse();
      return Number(result);
    },
    async capture(attempt) {
      const result = await scalar(`SELECT coalesce((
        SELECT winesnap_dev11_control.capture(owner)::text FROM winesnap_dev11_control.account
      ), 'null') WHERE ${active(attempt)}`);
      if (result === "null") return null;
      if (result[0] !== "{" || result.at(-1) !== "}") throw refuse();
      return result;
    },
    async restore(attempt, bytes) {
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxBytes) throw refuse();
      const result = await scalar(`SELECT winesnap_dev11_control.restore(owner,
        convert_from(decode('${bytes.toString("hex")}','hex'),'UTF8')::jsonb)
        FROM winesnap_dev11_control.account WHERE ${active(attempt)}`);
      try {
        const counts = JSON.parse(result);
        if (
          counts.status !== 200 ||
          ![0, 1].includes(counts.goals) ||
          !Number.isInteger(counts.readings) ||
          counts.readings < 0 ||
          counts.readings > 600
        )
          throw refuse();
        return { status: 200, goals: counts.goals, readings: counts.readings };
      } catch {
        throw refuse();
      }
    },
  });
}
