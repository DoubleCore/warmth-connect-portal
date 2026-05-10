import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDevice } from "@/api/devices";
import { ApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { DeviceStatus } from "@/types/device";

const deviceStatuses = ["idle", "running", "offline", "error"] as const satisfies readonly DeviceStatus[];

function makeSchema(t: ReturnType<typeof useI18n>["t"]) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("workspace.device.required"))
      .max(120, t("workspace.device.nameMax")),
    deviceType: z.string().trim().max(200).optional(),
    status: z.enum(deviceStatuses),
    location: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).optional(),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function DeviceFormDialog() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const schema = makeSchema(t);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      deviceType: "",
      status: "idle",
      location: "",
      description: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createDevice({
        name: values.name,
        deviceType: values.deviceType?.trim() ? values.deviceType : null,
        status: values.status,
        location: values.location?.trim() ? values.location : null,
        description: values.description?.trim() ? values.description : null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["devices"] });
      form.reset();
      setOpen(false);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    mutation.mutate(values);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        setOpen(next);
        if (!next) {
          form.reset();
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          {t("workspace.device.addBtn")}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("workspace.device.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("workspace.device.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="device-name">
              {t("workspace.device.name")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="device-name"
              placeholder={t("workspace.device.namePlaceholder")}
              autoFocus
              {...form.register("name")}
              aria-invalid={Boolean(form.formState.errors.name) || undefined}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="device-type">{t("workspace.device.type")}</Label>
              <Input
                id="device-type"
                placeholder={t("workspace.device.typePlaceholder")}
                {...form.register("deviceType")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="device-status">{t("workspace.device.status")}</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(v) => form.setValue("status", v as DeviceStatus)}
              >
                <SelectTrigger id="device-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deviceStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`workspace.status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="device-location">{t("workspace.device.location")}</Label>
            <Input
              id="device-location"
              placeholder={t("workspace.device.locationPlaceholder")}
              {...form.register("location")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="device-description">{t("workspace.device.description")}</Label>
            <Textarea
              id="device-description"
              placeholder={t("workspace.device.descriptionPlaceholder")}
              rows={3}
              {...form.register("description")}
            />
          </div>

          {mutation.isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <div>
                {t("workspace.device.createError", { message: errMsg(mutation.error) })}
              </div>
              {mutation.error instanceof ApiError && mutation.error.requestId && (
                <div className="mt-1 font-mono text-[10px] opacity-70">
                  {t("workspace.device.requestIdHint", { rid: mutation.error.requestId })}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              {t("workspace.device.cancel")}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {t("workspace.device.saving")}
                </>
              ) : (
                t("workspace.device.save")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
