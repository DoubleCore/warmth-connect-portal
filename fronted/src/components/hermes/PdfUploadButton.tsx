import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { uploadPaperPdf } from "@/api/papers";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/** Keep in sync with backend PDF_MAX_BYTES. 26MB covers typical academic PDFs. */
const MAX_BYTES = 26 * 1024 * 1024;
const MAX_LABEL = "26 MB";

/**
 * Paper detail "Upload PDF" control. Click to browse or drag a PDF onto the
 * card. Enforces the same 26 MB / PDF-only rules the backend uses so the
 * user gets instant feedback rather than waiting for the round trip.
 *
 * Not using react-dropzone to keep the bundle lean; a native drag handler is
 * ~30 lines.
 */
export function PdfUploadButton({ paperId }: { paperId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const mutation = useMutation({
    mutationFn: (file: File) => uploadPaperPdf(paperId, file),
    onSuccess: async () => {
      setErrorMsg(null);
      await queryClient.invalidateQueries({ queryKey: ["paper-detail", paperId] });
      await queryClient.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "upload failed";
      setErrorMsg(t("paper.uploadError", { message: msg }));
    },
  });

  const submit = (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg(t("paper.uploadNotPdf"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setErrorMsg(t("paper.uploadTooLarge", { limit: MAX_LABEL }));
      return;
    }
    setErrorMsg(null);
    mutation.mutate(file);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input value so picking the same filename later still triggers
    // onChange. Doing it before `submit` is safe because File refs stay alive.
    e.target.value = "";
    if (!file) return;
    submit(file);
  };

  const onDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) submit(file);
  };

  // If a mutation just succeeded its `variables` is the File we last uploaded;
  // show that name/size so the user can confirm the right file landed.
  const lastFile = mutation.variables as File | undefined;
  const showSuccessLine = mutation.isSuccess && lastFile && !errorMsg;

  const pending = mutation.isPending;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!pending) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        disabled={pending}
        aria-describedby="pdf-upload-hint"
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-60",
          dragActive
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary",
        )}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-4 w-4" aria-hidden />
        )}
        {pending ? t("paper.uploading") : t("paper.upload")}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={onPick}
      />

      <p id="pdf-upload-hint" className="max-w-xs text-right text-[10px] text-muted-foreground">
        {t("paper.uploadHint")} · ≤ {MAX_LABEL}
      </p>

      {errorMsg && (
        <p className="max-w-xs text-right text-xs text-destructive" role="alert">
          {errorMsg}
        </p>
      )}

      {showSuccessLine && (
        <p className="flex max-w-xs items-center gap-1 text-right text-xs text-[oklch(0.74_0.18_155)]">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("paper.uploadSuccess")}
        </p>
      )}

      {lastFile && (showSuccessLine || pending) && (
        <p className="flex max-w-xs items-center gap-1 overflow-hidden text-right text-[10px] text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">
            {t("paper.uploadedFile", {
              name: lastFile.name,
              size: formatBytes(lastFile.size),
            })}
          </span>
        </p>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
