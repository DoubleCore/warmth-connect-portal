/**
 * "开始复现" 按钮 — 放在论文详情页
 *
 * 点击后弹出设备选择对话框，选好设备后：
 *   1. 创建 reproduction_record (status=running, startedAt=now)
 *   2. 跳转到 /manager?runId=<新记录id>
 */

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EntityCombobox, type ComboboxOption } from "@/components/hermes/EntityCombobox";
import { listDevices } from "@/api/devices";
import { createReproductionRecord } from "@/api/reproduction";
import { ApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/I18nProvider";

interface Props {
  paperId: string;
  paperTitle: string;
}

export function StartReproductionButton({ paperId, paperTitle }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
    enabled: open,
  });

  const deviceOptions: ComboboxOption[] = (devicesQuery.data?.items ?? []).map((d) => ({
    value: d.id,
    label: d.name,
    hint: [d.deviceType, d.location].filter(Boolean).join(" · ") || null,
  }));

  const mutation = useMutation({
    mutationFn: () =>
      createReproductionRecord({
        paperId,
        deviceId: selectedDeviceId,
        status: "running",
        progress: 0,
        startedAt: new Date().toISOString(),
      }),
    onSuccess: async (record) => {
      await queryClient.invalidateQueries({ queryKey: ["reproduction-records"] });
      setOpen(false);
      void navigate({ to: "/manager", search: { runId: record.id } });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        setOpen(next);
        if (!next) {
          mutation.reset();
          setSelectedDeviceId(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          <Play className="h-4 w-4 text-primary" aria-hidden />
          {t("paper.startReproduction")}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("paper.startReproduction")}</DialogTitle>
          <DialogDescription>
            {t("paper.startReproductionDesc", { title: paperTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="repro-device">{t("paper.selectDevice")}</Label>
            <EntityCombobox
              id="repro-device"
              options={deviceOptions}
              value={selectedDeviceId}
              onChange={setSelectedDeviceId}
              loading={devicesQuery.isLoading}
              clearable
              clearLabel={t("paper.noDevice")}
            />
          </div>

          {mutation.isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : (mutation.error as Error).message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={mutation.isPending}
          >
            {t("paper.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                {t("paper.creating")}
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" aria-hidden />
                {t("paper.startNow")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
