import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateDevice } from "@/api/devices";
import { ApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Device, DeviceStatus } from "@/types/device";

const statuses: readonly DeviceStatus[] = ["idle", "running", "offline", "error"] as const;

const chipStyles: Record<DeviceStatus, { chip: string; dot: string }> = {
  idle: {
    chip: "bg-[oklch(0.74_0.18_155)]/15 text-[oklch(0.74_0.18_155)] ring-[oklch(0.74_0.18_155)]/30",
    dot: "bg-[oklch(0.74_0.18_155)]",
  },
  running: {
    chip: "bg-primary/15 text-primary ring-primary/30",
    dot: "bg-primary",
  },
  offline: {
    chip: "bg-muted text-muted-foreground ring-border",
    dot: "bg-muted-foreground",
  },
  error: {
    chip: "bg-destructive/15 text-destructive ring-destructive/30",
    dot: "bg-destructive",
  },
};

/**
 * Inline editor for a device's status. Uses an optimistic cache update so the
 * row reflects the new value the instant the user picks it, then rolls back
 * if the PATCH fails.
 */
export function DeviceStatusPicker({ device }: { device: Device }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [lastError, setLastError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (status: DeviceStatus) => updateDevice(device.id, { status }),
    onMutate: async (status) => {
      setLastError(null);
      await queryClient.cancelQueries({ queryKey: ["devices"] });
      const previous = queryClient.getQueryData<{ items: Device[] }>(["devices"]);
      if (previous) {
        queryClient.setQueryData<{ items: Device[] }>(["devices"], {
          items: previous.items.map((d) => (d.id === device.id ? { ...d, status } : d)),
        });
      }
      return { previous };
    },
    onError: (err, _status, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["devices"], context.previous);
      }
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
      setLastError(t("workspace.status.updateError", { message }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const style = chipStyles[device.status];

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={device.status}
        onValueChange={(v) => mutation.mutate(v as DeviceStatus)}
        disabled={mutation.isPending}
      >
        <SelectTrigger
          aria-label={`${device.name} status`}
          className={cn(
            "h-7 w-auto gap-1.5 rounded-full border-transparent px-2.5 py-1 text-xs font-medium shadow-none ring-1 focus:ring-2",
            style.chip,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
          {mutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
          {statuses.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`workspace.status.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {lastError && <span className="text-[10px] text-destructive">{lastError}</span>}
    </div>
  );
}
