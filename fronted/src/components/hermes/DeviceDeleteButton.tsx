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
import { deleteDevice } from "@/api/devices";
import { ApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function DeviceDeleteButton({
  deviceId,
  deviceName,
}: {
  deviceId: string;
  deviceName: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => deleteDevice(deviceId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["devices"] }),
        // Device deletion sets reproduction_record.device_id to null; refresh
        // the workspace list so the affected records lose their device chip.
        queryClient.invalidateQueries({ queryKey: ["reproduction-records"] }),
      ]);
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
          aria-label={t("workspace.device.deleteBtn")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("workspace.device.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="mb-1 block font-mono text-xs text-foreground">{deviceName}</span>
            {t("workspace.device.deleteDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {mutation.isError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <div>{t("workspace.device.deleteError", { message: errMsg(mutation.error) })}</div>
            {mutation.error instanceof ApiError && mutation.error.requestId && (
              <div className="mt-1 font-mono text-[10px] opacity-70">
                {t("workspace.device.requestIdHint", { rid: mutation.error.requestId })}
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t("workspace.device.cancel")}
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
                {t("workspace.device.saving")}
              </>
            ) : (
              t("workspace.device.deleteConfirm")
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
