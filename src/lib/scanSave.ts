export type ScanSaveAttempt = {
  id: string;
  owner: string;
  imagePath: string | null;
  insertStarted: boolean;
};

export function scanUploadPath(attempt: ScanSaveAttempt, extension: string) {
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (
    !uuid.test(attempt.owner) ||
    !uuid.test(attempt.id) ||
    !/^(jpg|png|webp|heic|heif)$/.test(extension)
  )
    throw new Error("Invalid scan upload identity");
  return `${attempt.owner}/${attempt.id}/${attempt.id}.${extension}`;
}
type SavedRow = { id: string; user_id: string; image_url: string | null };
export class ScanSaveError extends Error {
  constructor(public uncertain: boolean) {
    super("scan_save_incomplete");
  }
}

// The same ID and successful upload survive a manual retry after a lost response.
export async function saveScanOnce<T extends SavedRow>(
  attempt: ScanSaveAttempt,
  actions: {
    find: () => Promise<T | null>;
    upload?: () => Promise<string>;
    insert: (id: string, imagePath: string | null) => Promise<T>;
  },
) {
  const checked = (row: T) => {
    if (
      row.id !== attempt.id ||
      row.user_id !== attempt.owner ||
      row.image_url !== attempt.imagePath
    )
      throw new ScanSaveError(true);
    return row;
  };
  if (attempt.insertStarted) {
    // A failed read is not proof that an earlier insert failed.
    const existing = await actions.find();
    if (existing) return checked(existing);
  }
  if (actions.upload && !attempt.imagePath) attempt.imagePath = await actions.upload();
  attempt.insertStarted = true;
  try {
    return checked(await actions.insert(attempt.id, attempt.imagePath));
  } catch (cause) {
    try {
      const existing = await actions.find();
      if (existing) return checked(existing);
    } catch {
      throw new ScanSaveError(true);
    }
    const sqlCode = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
    throw new ScanSaveError(
      !(
        typeof sqlCode === "string" &&
        sqlCode !== "23505" &&
        /^(22|23|42)[0-9A-Z]{3}$/.test(sqlCode)
      ),
    );
  }
}
