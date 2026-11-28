import { promisify } from "node:util";
import { crc32, deflate } from "node:zlib";
import { mealPhotoFrameSideLimit } from "../features/meal-photos/domain";

const compress = promisify(deflate);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function hasMealPhotoFrameType(request: Request) {
  return (
    request.headers.get("content-type") === "application/octet-stream" &&
    !request.headers.has("content-encoding")
  );
}

function dimension(value: string | null) {
  if (value === null || !/^[1-9]\d{0,3}$/.test(value)) return 0;
  const side = Number(value);
  return side <= mealPhotoFrameSideLimit ? side : 0;
}

export function mealPhotoFrame(request: Request) {
  const width = dimension(request.headers.get("x-meal-photo-width"));
  const height = dimension(request.headers.get("x-meal-photo-height"));
  const length = width * height * 3;
  const declaredLength = request.headers.get("content-length");
  if (!length || (declaredLength !== null && declaredLength !== String(length))) return null;
  return { width, height, length };
}

async function readPixels(request: Request, length: number, signal: AbortSignal) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const pixels = Buffer.alloc(length);
  let offset = 0;
  const cancel = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) return offset === length ? pixels : null;
      if (offset + value.byteLength > length) {
        cancel();
        return null;
      }
      pixels.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function pngChunk(type: "IHDR" | "IDAT" | "IEND", data: Buffer) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

export async function encodeMealPhotoFrame(
  request: Request,
  { width, height, length }: NonNullable<ReturnType<typeof mealPhotoFrame>>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const rgb = await readPixels(request, length, signal);
  if (!rgb) return null;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  // Each row starts with the PNG "no filter" byte. No original-file metadata is accepted.
  const stride = width * 3;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++)
    rgb.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", await compress(rows, { level: 1 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
