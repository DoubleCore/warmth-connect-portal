import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { env, PDF_MAX_BYTES } from "@/config/env.js";
import { AppError, ValidationError } from "@/shared/errors.js";
import * as service from "./papers.service.js";

const PDF_MAGIC = "%PDF-";

/**
 * Handle the multipart file part for a PDF upload, persist it under
 * PDF_STORAGE_DIR, attach it to the paper via pdfStoragePath, and return the
 * updated paper DTO.
 *
 * Keeps the raw fs + validation work outside the route handler so the route
 * stays focused on HTTP concerns.
 */
export async function handlePdfUpload(paperId: string, file: File) {
  if (file.size <= 0) throw new ValidationError("Uploaded file is empty");
  if (file.size > PDF_MAX_BYTES) {
    throw new AppError(
      `File exceeds the ${Math.round(PDF_MAX_BYTES / 1024 / 1024)}MB limit`,
      413,
      "PAYLOAD_TOO_LARGE",
    );
  }

  // Content-type is client-controlled; trust but verify by checking the
  // magic bytes after we read the buffer.
  const contentType = file.type || "application/octet-stream";
  if (contentType !== "application/pdf") {
    // Allow octet-stream fallback but we'll re-check magic below.
    if (contentType !== "application/octet-stream") {
      throw new ValidationError("Only application/pdf files are accepted");
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const head = buffer.subarray(0, PDF_MAGIC.length).toString("latin1");
  if (head !== PDF_MAGIC) {
    throw new ValidationError("File does not look like a valid PDF");
  }

  const storageDir = resolve(env.PDF_STORAGE_DIR);
  await mkdir(storageDir, { recursive: true });

  // Use a UUID filename to avoid collisions and path traversal from the
  // uploaded filename. We still record a human-readable originalName in the
  // future if we add a dedicated assets table; for now, pdfStoragePath alone
  // is enough because the download endpoint serves with the paper.title.
  const originalExt = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0]?.toLowerCase() ?? ".pdf";
  const safeExt = originalExt === ".pdf" ? ".pdf" : ".pdf"; // hard-lock to .pdf
  const storedName = `${randomUUID()}${safeExt}`;
  const absPath = resolve(storageDir, storedName);

  await writeFile(absPath, buffer);

  return service.setPdfStoragePath(paperId, storedName);
}
