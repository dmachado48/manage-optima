import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]);

export function assertAllowedUpload(file: File) {
  if (file.size <= 0) throw new Error("Ficheiro vazio");
  if (file.size > MAX_BYTES) throw new Error("Ficheiro demasiado grande (máx. 10 MB)");
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error("Tipo de ficheiro não permitido");
  }
  return mime;
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\-()+\s]/g, "_").slice(0, 120) || "ficheiro";
}

export async function storeUpload(requestId: string, file: File) {
  const mime = assertAllowedUpload(file);
  const dir = path.join(UPLOADS_ROOT, requestId);
  await mkdir(dir, { recursive: true });
  const key = `${randomBytes(8).toString("hex")}-${safeFileName(file.name)}`;
  const absolute = path.join(dir, key);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolute, buffer);
  return {
    storageKey: path.join(requestId, key),
    fileName: file.name.slice(0, 200) || "ficheiro",
    mimeType: mime,
    sizeBytes: file.size,
  };
}

export function absoluteUploadPath(storageKey: string) {
  const resolved = path.resolve(UPLOADS_ROOT, storageKey);
  if (!resolved.startsWith(UPLOADS_ROOT)) {
    throw new Error("Caminho inválido");
  }
  return resolved;
}
