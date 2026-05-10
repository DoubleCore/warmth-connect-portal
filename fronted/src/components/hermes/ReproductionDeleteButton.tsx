import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteReproductionRecord } from "@/api/reproduction";
import { ApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function ReproductionDeleteButton({
  recordId,
  paperTitle,
}: {
  recordId: string;
  paperTitle: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => deleteReproductionRecord(recordId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reproduction-records"] });
      setOpen(false);
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <button
          type="button"
          aria-label={t("workspace.record.deleteBtn")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("workspace.record.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="mb-1 block font-mono text-xs text-foreground">{paperTitle}</span>
            {t("workspace.record.deleteDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {mutation.isError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <div>{t("workspace.record.deleteError", { message: errMsg(mutation.error) })}</div>
            {mutation.error instanceof ApiError && mutation.error.requestId && (
              <div className="mt-1 font-mono text-[10px] opacity-70">
                {t("workspace.record.requestIdHint", { rid: mutation.error.requestId })}
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t("workspace.record.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                {t("workspace.record.saving")}
              </>
            ) : (
              t("workspace.record.deleteConfirm")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
