import { z } from "zod";
import { ownedBackendOrigin, ownedBrowserOrigin } from "./backendScope";
import { ownedBrowserApiUrl } from "./ownedHosting";

const photoBucket = "meal-photos";
const exportFile = z.union([
  z.strictObject({
    bucket: z.literal(photoBucket),
    path: z.string(),
    mealId: z.uuid(),
  }),
  z.strictObject({
    bucket: z.string().refine((bucket) => bucket !== photoBucket),
    path: z.string(),
    signedUrl: z.string(),
  }),
]);
const exportSchema = z.object({
  format: z.literal("WineSnap user export v2"),
  exported_at: z.string(),
  account: z.object({ id: z.string() }).passthrough(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  files: z.array(exportFile).max(500),
  excluded: z.array(z.string()),
});

export async function completePrivacyExport(
  input: unknown,
  owner: string,
  origin: string,
  read: (url: string) => Promise<Response>,
  stillOwner: () => boolean,
  {
    maxBytes = 50 * 1024 * 1024,
    readPrivateMealPhoto,
    ownedPage,
  }: {
    maxBytes?: number;
    readPrivateMealPhoto?: (mealId: string) => Promise<Response>;
    ownedPage?: { origin: string; publicOrigin?: string };
  } = {},
) {
  const data = exportSchema.parse(input);
  if (data.account.id !== owner || !stillOwner()) throw new Error("Account changed");
  let total = new TextEncoder().encode(JSON.stringify(data.tables)).length;
  if (total > maxBytes) throw new Error("export_requires_support");
  const files = [];
  for (const file of data.files) {
    if (!stillOwner()) throw new Error("Account changed");
    let response: Response;
    if ("mealId" in file) {
      if (!readPrivateMealPhoto || file.path !== `${owner}/${file.mealId}.png`)
        throw new Error("Invalid private export file");
      response = await readPrivateMealPhoto(file.mealId);
      if (response.headers.get("content-type") !== "image/png") {
        await response.body?.cancel();
        throw new Error("Could not download export file");
      }
    } else {
      const url = new URL(file.signedUrl);
      const owned = !!ownedPage && origin === ownedBrowserOrigin;
      if (
        (url.origin !== new URL(origin).origin && !(owned && url.origin === ownedBackendOrigin)) ||
        url.username ||
        url.password ||
        url.hash ||
        !url.pathname.startsWith("/storage/v1/object/sign/") ||
        decodeURIComponent(url.pathname.split("/")[5] ?? "") !== file.bucket
      )
        throw new Error("Invalid export file origin");
      const target = owned
        ? ownedBrowserApiUrl(origin, "true", ownedPage.publicOrigin, ownedPage.origin) +
          url.pathname +
          url.search
        : url.href;
      response = await read(target);
    }
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
