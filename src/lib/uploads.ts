import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

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
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Ficheiro demasiado grande (máx. 10 MB)");
  }
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
  return storeBuffer(requestId, {
    content: Buffer.from(await file.arrayBuffer()),
    fileName: file.name,
    mimeType: mime,
  });
}

export async function storeBuffer(
  scope: string,
  file: { content: Buffer; fileName: string; mimeType?: string | null },
) {
  if (file.content.length <= 0) throw new Error("Ficheiro vazio");
  if (file.content.length > MAX_UPLOAD_BYTES) {
    throw new Error("Ficheiro demasiado grande (máx. 10 MB)");
  }

  const dir = path.join(UPLOADS_ROOT, scope);
  await mkdir(dir, { recursive: true });
  const originalName = file.fileName.slice(0, 200) || "ficheiro";
  const key = `${randomBytes(8).toString("hex")}-${safeFileName(originalName)}`;
  const absolute = path.join(dir, key);
  await writeFile(absolute, file.content);
  return {
    storageKey: path.join(scope, key),
    fileName: originalName,
    mimeType: file.mimeType || "application/octet-stream",
    sizeBytes: file.content.length,
  };
}

export function absoluteUploadPath(storageKey: string) {
  const resolved = path.resolve(UPLOADS_ROOT, storageKey);
  if (!resolved.startsWith(UPLOADS_ROOT)) {
    throw new Error("Caminho inválido");
  }
  return resolved;
}
