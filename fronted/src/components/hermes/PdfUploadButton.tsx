import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { uploadPaperPdf } from "@/api/papers";
import { useI18n } from "@/lib/i18n/I18nProvider";

/**
 * Inline "Upload PDF" button for the paper detail header.
 *
 * Uses a hidden <input type="file"> driven by a button click so the control
 * stays visually consistent with the "Download PDF" CTA next to it. On
 * success we invalidate the paper-detail cache so the page re-renders with
 * any new metadata, and the browser reloads the GET .../pdf endpoint next
 * time the user clicks "Download PDF".
 */
export function PdfUploadButton({ paperId }: { paperId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => uploadPaperPdf(paperId, file),
    onSuccess: async () => {
      setErrorMsg(null);
      await queryClient.invalidateQueries({ queryKey: ["paper-detail", paperId] });
      // Also nudge any list view caches so the "has local PDF" badge (when
      // we add one) stays in sync.
      await queryClient.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "upload failed";
      setErrorMsg(t("paper.uploadError", { message: msg }));
    },
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input value so the user can re-upload the same filename later.
    e.target.value = "";
    if (!file) return;
    setErrorMsg(null);
    mutation.mutate(file);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={mutation.isPending}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-4 w-4" aria-hidden />
        )}
        {mutation.isPending ? t("paper.uploading") : t("paper.upload")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={onPick}
      />
      {errorMsg && (
        <p className="max-w-xs text-right text-xs text-destructive">{errorMsg}</p>
      )}
      {mutation.isSuccess && !errorMsg && (
        <p className="text-xs text-[oklch(0.74_0.18_155)]">{t("paper.uploadSuccess")}</p>
      )}
    </div>
  );
}
