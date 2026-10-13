import { z } from "zod";

const exportSchema = z.object({
  format: z.literal("WineSnap user export v2"),
  exported_at: z.string(),
  account: z.object({ id: z.string() }).passthrough(),
  tables: z.record(z.array(z.record(z.unknown()))),
  files: z.array(z.object({ bucket: z.string(), path: z.string(), signedUrl: z.string() })),
  excluded: z.array(z.string()),
});

export async function completePrivacyExport(
  input: unknown,
  owner: string,
  origin: string,
  read: (url: string) => Promise<Response>,
  stillOwner: () => boolean,
  maxBytes = 50 * 1024 * 1024,
) {
  const data = exportSchema.parse(input);
  if (data.account.id !== owner || !stillOwner()) throw new Error("Account changed");
  let total = new TextEncoder().encode(JSON.stringify(data.tables)).length;
  if (total > maxBytes) throw new Error("export_requires_support");
  const files = [];
  for (const file of data.files) {
    if (!stillOwner()) throw new Error("Account changed");
    const url = new URL(file.signedUrl);
    if (
      url.origin !== new URL(origin).origin ||
      !url.pathname.startsWith("/storage/v1/object/sign/")
    ) {
      throw new Error("Invalid export file origin");
    }
    const response = await read(url.href);
    if (!response.ok || !response.body) throw new Error("Could not download export file");
    const chunks: Uint8Array[] = [];
    const stream = response.body.getReader();
    let bytes = 0;
    try {
      while (true) {
        if (!stillOwner()) throw new Error("Account changed");
        const part = await stream.read();
        if (part.done) break;
        bytes += part.value.length;
        total += part.value.length;
        if (total > maxBytes) throw new Error("export_requires_support");
        chunks.push(part.value);
      }
    } finally {
      await stream.cancel();
    }
    const content = new Uint8Array(bytes);
    let position = 0;
    for (const chunk of chunks) {
      content.set(chunk, position);
      position += chunk.length;
    }
    let binary = "";
    for (let offset = 0; offset < content.length; offset += 8192) {
      binary += String.fromCharCode(...content.subarray(offset, offset + 8192));
    }
    files.push({
      bucket: file.bucket,
      path: file.path,
      mimeType: response.headers.get("content-type"),
      base64: btoa(binary),
    });
  }
  if (!stillOwner()) throw new Error("Account changed");
  return { ...data, files };
}
