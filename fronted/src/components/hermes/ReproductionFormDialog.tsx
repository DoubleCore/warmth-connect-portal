import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, Pencil, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntityCombobox, type ComboboxOption } from "@/components/hermes/EntityCombobox";
import { createReproductionRecord, updateReproductionRecord } from "@/api/reproduction";
import { listPapers } from "@/api/papers";
import { listDevices } from "@/api/devices";
import { ApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type {
  CreateReproductionInput,
  ReproductionRecord,
  ReproductionStatus,
  UpdateReproductionInput,
} from "@/types/reproduction";

const reproductionStatuses = [
  "not_started",
  "running",
  "success",
  "failed",
  "paused",
] as const satisfies readonly ReproductionStatus[];

function makeSchema(t: ReturnType<typeof useI18n>["t"]) {
  return z.object({
    paperId: z.string().trim().min(1, t("workspace.record.paperRequired")),
    deviceId: z.string().nullable(),
    status: z.enum(reproductionStatuses),
    progress: z
      .number({ invalid_type_error: t("workspace.record.progressRange") })
      .int()
      .min(0, t("workspace.record.progressRange"))
      .max(100, t("workspace.record.progressRange")),
    resultSummary: z.string(),
    trainingNotes: z.string(),
    artifactUrl: z
      .string()
      .trim()
      .refine((v) => v === "" || isUrl(v), { message: t("workspace.record.urlInvalid") }),
    startedAt: z.string(),
    finishedAt: z.string(),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function ReproductionFormDialog({
  mode,
  record,
  trigger,
}: {
  mode: "create" | "edit";
  /** Required in edit mode; ignored in create mode. */
  record?: ReproductionRecord;
  /** Custom trigger element (e.g. an inline icon button). Defaults to a primary button for create. */
  trigger?: React.ReactNode;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const schema = makeSchema(t);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues:
      mode === "edit" && record
        ? {
            paperId: record.paper.id,
            deviceId: record.device?.id ?? null,
            status: record.status,
            progress: record.progress,
            resultSummary: record.resultSummary ?? "",
            trainingNotes: record.trainingNotes ?? "",
            artifactUrl: record.artifactUrl ?? "",
            startedAt: toDatetimeLocal(record.startedAt),
            finishedAt: toDatetimeLocal(record.finishedAt),
          }
        : blankDefaults(),
  });

  // Reset form when dialog reopens (especially important for edit so we pick
  // up any fresh record data from cache).
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && record) {
      form.reset({
        paperId: record.paper.id,
        deviceId: record.device?.id ?? null,
        status: record.status,
        progress: record.progress,
        resultSummary: record.resultSummary ?? "",
        trainingNotes: record.trainingNotes ?? "",
        artifactUrl: record.artifactUrl ?? "",
        startedAt: toDatetimeLocal(record.startedAt),
        finishedAt: toDatetimeLocal(record.finishedAt),
      });
    } else {
      form.reset(blankDefaults());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const papersQuery = useQuery({
    queryKey: ["papers", { page: 1, pageSize: 100 }],
    queryFn: () => listPapers({ page: 1, pageSize: 100 }),
    enabled: open,
  });
  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
    enabled: open,
  });

  const paperOptions: ComboboxOption[] = (papersQuery.data?.items ?? []).map((p) => ({
    value: p.id,
    label: p.title,
    hint:
      [p.authors[0], p.publishedYear ? String(p.publishedYear) : null, p.source]
        .filter(Boolean)
        .join(" · ") || null,
  }));
  const deviceOptions: ComboboxOption[] = (devicesQuery.data?.items ?? []).map((d) => ({
    value: d.id,
    label: d.name,
    hint: [d.deviceType, d.location].filter(Boolean).join(" · ") || null,
  }));

  const createMutation = useMutation({
    mutationFn: (input: CreateReproductionInput) => createReproductionRecord(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reproduction-records"] });
      setOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateReproductionInput }) =>
      updateReproductionRecord(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reproduction-records"] });
      setOpen(false);
    },
  });

  const mutation = mode === "create" ? createMutation : updateMutation;

  const onSubmit = form.handleSubmit((values) => {
    const payload: CreateReproductionInput = {
      paperId: values.paperId,
      deviceId: values.deviceId || null,
      status: values.status,
      progress: values.progress,
      resultSummary: values.resultSummary.trim() ? values.resultSummary : null,
      trainingNotes: values.trainingNotes.trim() ? values.trainingNotes : null,
      artifactUrl: values.artifactUrl.trim() ? values.artifactUrl : null,
      startedAt: values.startedAt ? fromDatetimeLocal(values.startedAt) : null,
      finishedAt: values.finishedAt ? fromDatetimeLocal(values.finishedAt) : null,
    };
    if (mode === "create") {
      createMutation.mutate(payload);
    } else if (record) {
      // paperId is immutable in edit mode; strip it to match UpdateReproductionInput.
      const { paperId: _omit, ...patch } = payload;
      void _omit;
      updateMutation.mutate({ id: record.id, input: patch });
    }
  });

  const titleKey =
    mode === "create" ? "workspace.record.dialogTitleCreate" : "workspace.record.dialogTitleEdit";

  const defaultTrigger =
    mode === "create" ? (
      <Button size="sm" className="gap-2">
        <Plus className="h-4 w-4" aria-hidden />
        {t("workspace.record.addBtn")}
      </Button>
    ) : (
      <button
        type="button"
        aria-label={t("workspace.record.editBtn")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t("workspace.record.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* paper (immutable in edit mode) */}
          <div className="space-y-1.5">
            <Label htmlFor="record-paper">
              {t("workspace.record.paper")} <span className="text-destructive">*</span>
            </Label>
            <EntityCombobox
              id="record-paper"
              options={paperOptions}
              value={form.watch("paperId") || null}
              onChange={(next) => form.setValue("paperId", next ?? "", { shouldValidate: true })}
              loading={papersQuery.isLoading}
              disabled={mode === "edit"}
              ariaInvalid={Boolean(form.formState.errors.paperId)}
            />
            {form.formState.errors.paperId && (
              <p className="text-xs text-destructive">{form.formState.errors.paperId.message}</p>
            )}
          </div>

          {/* device (clearable) */}
          <div className="space-y-1.5">
            <Label htmlFor="record-device">{t("workspace.record.device")}</Label>
            <EntityCombobox
              id="record-device"
              options={deviceOptions}
              value={form.watch("deviceId")}
              onChange={(next) => form.setValue("deviceId", next)}
              loading={devicesQuery.isLoading}
              clearable
              clearLabel={t("workspace.record.deviceNone")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="record-status">{t("workspace.record.status")}</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(v) => form.setValue("status", v as ReproductionStatus)}
              >
                <SelectTrigger id="record-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reproductionStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`repro.status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="record-progress">{t("workspace.record.progressLabel")}</Label>
              <Input
                id="record-progress"
                type="number"
                min={0}
                max={100}
                step={1}
                {...form.register("progress", { valueAsNumber: true })}
                aria-invalid={Boolean(form.formState.errors.progress) || undefined}
              />
              {form.formState.errors.progress && (
                <p className="text-xs text-destructive">{form.formState.errors.progress.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="record-started-at">{t("workspace.record.startedAtLabel")}</Label>
              <Input id="record-started-at" type="datetime-local" {...form.register("startedAt")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="record-finished-at">{t("workspace.record.finishedAtLabel")}</Label>
              <Input
                id="record-finished-at"
                type="datetime-local"
                {...form.register("finishedAt")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="record-artifact">{t("workspace.record.artifactUrlLabel")}</Label>
            <Input
              id="record-artifact"
              type="url"
              placeholder={t("workspace.record.artifactUrlPlaceholder")}
              {...form.register("artifactUrl")}
              aria-invalid={Boolean(form.formState.errors.artifactUrl) || undefined}
            />
            {form.formState.errors.artifactUrl && (
              <p className="text-xs text-destructive">
                {form.formState.errors.artifactUrl.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="record-summary">{t("workspace.record.resultSummaryLabel")}</Label>
            <Textarea
              id="record-summary"
              rows={3}
              placeholder={t("workspace.record.resultSummaryPlaceholder")}
              {...form.register("resultSummary")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="record-training-notes">
              {t("workspace.record.trainingNotesLabel")}
            </Label>
            <Textarea
              id="record-training-notes"
              rows={3}
              placeholder={t("workspace.record.trainingNotesPlaceholder")}
              {...form.register("trainingNotes")}
            />
          </div>

          {mutation.isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <div>{t("workspace.record.saveError", { message: errMsg(mutation.error) })}</div>
              {mutation.error instanceof ApiError && mutation.error.requestId && (
                <div className="mt-1 font-mono text-[10px] opacity-70">
                  {t("workspace.record.requestIdHint", { rid: mutation.error.requestId })}
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
              {t("workspace.record.cancel")}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {t("workspace.record.saving")}
                </>
              ) : (
                t("workspace.record.save")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function blankDefaults(): FormValues {
  return {
    paperId: "",
    deviceId: null,
    status: "not_started",
    progress: 0,
    resultSummary: "",
    trainingNotes: "",
    artifactUrl: "",
    startedAt: "",
    finishedAt: "",
  };
}

/** Convert ISO8601 to the local-datetime value the <input type="datetime-local"> expects. */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromDatetimeLocal(local: string): string | null {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
