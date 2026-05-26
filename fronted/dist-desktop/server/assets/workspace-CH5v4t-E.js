import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Trash2, Loader2, Plus, Pencil, HardDrive, CheckCircle2, RefreshCw, PowerOff, AlertCircle, AlertTriangle, Server } from "lucide-react";
import { c as cn, S as Shell } from "./Shell-D8Pakp7k.js";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { b as buttonVariants, B as Button } from "./button-toWkDJS-.js";
import { d as deleteDevice, c as createDevice, u as updateDevice, l as listDevices } from "./devices-BDVJaLc_.js";
import { u as useI18n, A as ApiError, d as deleteReproductionRecord, l as listPapers, c as createReproductionRecord, a as updateReproductionRecord, b as listReproductionRecords, i as isNetworkError } from "./router-DbOKu9BE.js";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { D as Dialog, a as DialogTrigger, b as DialogContent, c as DialogHeader, d as DialogTitle, e as DialogDescription, f as DialogFooter, E as EntityCombobox } from "./EntityCombobox-C0poqq6t.js";
import { I as Input } from "./input-vKQKnUmL.js";
import { L as Label } from "./label-CEbNblBy.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea } from "./select-CgUVDSQ3.js";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "cmdk";
import "@radix-ui/react-dialog";
import "@radix-ui/react-popover";
import "@radix-ui/react-label";
import "@radix-ui/react-select";
const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;
const AlertDialogOverlay = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AlertDialogPrimitive.Overlay,
  {
    className: cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    ),
    ...props,
    ref
  }
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;
const AlertDialogContent = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxs(AlertDialogPortal, { children: [
  /* @__PURE__ */ jsx(AlertDialogOverlay, {}),
  /* @__PURE__ */ jsx(
    AlertDialogPrimitive.Content,
    {
      ref,
      className: cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      ),
      ...props
    }
  )
] }));
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;
const AlertDialogHeader = ({ className, ...props }) => /* @__PURE__ */ jsx("div", { className: cn("flex flex-col space-y-2 text-center sm:text-left", className), ...props });
AlertDialogHeader.displayName = "AlertDialogHeader";
const AlertDialogFooter = ({ className, ...props }) => /* @__PURE__ */ jsx(
  "div",
  {
    className: cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className),
    ...props
  }
);
AlertDialogFooter.displayName = "AlertDialogFooter";
const AlertDialogTitle = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AlertDialogPrimitive.Title,
  {
    ref,
    className: cn("text-lg font-semibold", className),
    ...props
  }
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;
const AlertDialogDescription = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AlertDialogPrimitive.Description,
  {
    ref,
    className: cn("text-sm text-muted-foreground", className),
    ...props
  }
));
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;
const AlertDialogAction = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(AlertDialogPrimitive.Action, { ref, className: cn(buttonVariants(), className), ...props }));
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;
const AlertDialogCancel = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AlertDialogPrimitive.Cancel,
  {
    ref,
    className: cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className),
    ...props
  }
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;
function DeviceDeleteButton({
  deviceId,
  deviceName
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
        queryClient.invalidateQueries({ queryKey: ["reproduction-records"] })
      ]);
      setOpen(false);
    }
  });
  return /* @__PURE__ */ jsxs(
    AlertDialog,
    {
      open,
      onOpenChange: (next) => {
        if (mutation.isPending) return;
        setOpen(next);
        if (!next) mutation.reset();
      },
      children: [
        /* @__PURE__ */ jsx(AlertDialogTrigger, { asChild: true, children: /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            "aria-label": t("workspace.device.deleteBtn"),
            className: "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
            children: /* @__PURE__ */ jsx(Trash2, { className: "h-4 w-4", "aria-hidden": true })
          }
        ) }),
        /* @__PURE__ */ jsxs(AlertDialogContent, { children: [
          /* @__PURE__ */ jsxs(AlertDialogHeader, { children: [
            /* @__PURE__ */ jsx(AlertDialogTitle, { children: t("workspace.device.deleteTitle") }),
            /* @__PURE__ */ jsxs(AlertDialogDescription, { children: [
              /* @__PURE__ */ jsx("span", { className: "mb-1 block font-mono text-xs text-foreground", children: deviceName }),
              t("workspace.device.deleteDesc")
            ] })
          ] }),
          mutation.isError && /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive", children: [
            /* @__PURE__ */ jsx("div", { children: t("workspace.device.deleteError", { message: errMsg$3(mutation.error) }) }),
            mutation.error instanceof ApiError && mutation.error.requestId && /* @__PURE__ */ jsx("div", { className: "mt-1 font-mono text-[10px] opacity-70", children: t("workspace.device.requestIdHint", { rid: mutation.error.requestId }) })
          ] }),
          /* @__PURE__ */ jsxs(AlertDialogFooter, { children: [
            /* @__PURE__ */ jsx(AlertDialogCancel, { disabled: mutation.isPending, children: t("workspace.device.cancel") }),
            /* @__PURE__ */ jsx(
              AlertDialogAction,
              {
                onClick: (e) => {
                  e.preventDefault();
                  mutation.mutate();
                },
                disabled: mutation.isPending,
                className: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                children: mutation.isPending ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin", "aria-hidden": true }),
                  t("workspace.device.saving")
                ] }) : t("workspace.device.deleteConfirm")
              }
            )
          ] })
        ] })
      ]
    }
  );
}
function errMsg$3(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
const deviceStatuses = [
  "idle",
  "running",
  "offline",
  "error"
];
function makeSchema$1(t) {
  return z.object({
    name: z.string().trim().min(1, t("workspace.device.required")).max(120, t("workspace.device.nameMax")),
    deviceType: z.string().trim().max(200).optional(),
    status: z.enum(deviceStatuses),
    location: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2e3).optional()
  });
}
function DeviceFormDialog() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const schema = makeSchema$1(t);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      deviceType: "",
      status: "idle",
      location: "",
      description: ""
    }
  });
  const mutation = useMutation({
    mutationFn: (values) => createDevice({
      name: values.name,
      deviceType: values.deviceType?.trim() ? values.deviceType : null,
      status: values.status,
      location: values.location?.trim() ? values.location : null,
      description: values.description?.trim() ? values.description : null
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["devices"] });
      form.reset();
      setOpen(false);
    }
  });
  const onSubmit = form.handleSubmit((values) => {
    mutation.mutate(values);
  });
  return /* @__PURE__ */ jsxs(
    Dialog,
    {
      open,
      onOpenChange: (next) => {
        if (mutation.isPending) return;
        setOpen(next);
        if (!next) {
          form.reset();
          mutation.reset();
        }
      },
      children: [
        /* @__PURE__ */ jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(Button, { size: "sm", className: "gap-2", children: [
          /* @__PURE__ */ jsx(Plus, { className: "h-4 w-4", "aria-hidden": true }),
          t("workspace.device.addBtn")
        ] }) }),
        /* @__PURE__ */ jsxs(DialogContent, { className: "sm:max-w-md", children: [
          /* @__PURE__ */ jsxs(DialogHeader, { children: [
            /* @__PURE__ */ jsx(DialogTitle, { children: t("workspace.device.dialogTitle") }),
            /* @__PURE__ */ jsx(DialogDescription, { children: t("workspace.device.dialogDesc") })
          ] }),
          /* @__PURE__ */ jsxs("form", { onSubmit, className: "space-y-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsxs(Label, { htmlFor: "device-name", children: [
                t("workspace.device.name"),
                " ",
                /* @__PURE__ */ jsx("span", { className: "text-destructive", children: "*" })
              ] }),
              /* @__PURE__ */ jsx(
                Input,
                {
                  id: "device-name",
                  placeholder: t("workspace.device.namePlaceholder"),
                  autoFocus: true,
                  ...form.register("name"),
                  "aria-invalid": Boolean(form.formState.errors.name) || void 0
                }
              ),
              form.formState.errors.name && /* @__PURE__ */ jsx("p", { className: "text-xs text-destructive", children: form.formState.errors.name.message })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
              /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsx(Label, { htmlFor: "device-type", children: t("workspace.device.type") }),
                /* @__PURE__ */ jsx(
                  Input,
                  {
                    id: "device-type",
                    placeholder: t("workspace.device.typePlaceholder"),
                    ...form.register("deviceType")
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsx(Label, { htmlFor: "device-status", children: t("workspace.device.status") }),
                /* @__PURE__ */ jsxs(
                  Select,
                  {
                    value: form.watch("status"),
                    onValueChange: (v) => form.setValue("status", v),
                    children: [
                      /* @__PURE__ */ jsx(SelectTrigger, { id: "device-status", children: /* @__PURE__ */ jsx(SelectValue, {}) }),
                      /* @__PURE__ */ jsx(SelectContent, { children: deviceStatuses.map((s) => /* @__PURE__ */ jsx(SelectItem, { value: s, children: t(`workspace.status.${s}`) }, s)) })
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsx(Label, { htmlFor: "device-location", children: t("workspace.device.location") }),
              /* @__PURE__ */ jsx(
                Input,
                {
                  id: "device-location",
                  placeholder: t("workspace.device.locationPlaceholder"),
                  ...form.register("location")
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsx(Label, { htmlFor: "device-description", children: t("workspace.device.description") }),
              /* @__PURE__ */ jsx(
                Textarea,
                {
                  id: "device-description",
                  placeholder: t("workspace.device.descriptionPlaceholder"),
                  rows: 3,
                  ...form.register("description")
                }
              )
            ] }),
            mutation.isError && /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive", children: [
              /* @__PURE__ */ jsx("div", { children: t("workspace.device.createError", { message: errMsg$2(mutation.error) }) }),
              mutation.error instanceof ApiError && mutation.error.requestId && /* @__PURE__ */ jsx("div", { className: "mt-1 font-mono text-[10px] opacity-70", children: t("workspace.device.requestIdHint", { rid: mutation.error.requestId }) })
            ] }),
            /* @__PURE__ */ jsxs(DialogFooter, { children: [
              /* @__PURE__ */ jsx(
                Button,
                {
                  type: "button",
                  variant: "ghost",
                  onClick: () => setOpen(false),
                  disabled: mutation.isPending,
                  children: t("workspace.device.cancel")
                }
              ),
              /* @__PURE__ */ jsx(Button, { type: "submit", disabled: mutation.isPending, children: mutation.isPending ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin", "aria-hidden": true }),
                t("workspace.device.saving")
              ] }) : t("workspace.device.save") })
            ] })
          ] })
        ] })
      ]
    }
  );
}
function errMsg$2(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
const statuses = ["idle", "running", "offline", "error"];
const chipStyles = {
  idle: {
    chip: "bg-[oklch(0.74_0.18_155)]/15 text-[oklch(0.74_0.18_155)] ring-[oklch(0.74_0.18_155)]/30",
    dot: "bg-[oklch(0.74_0.18_155)]"
  },
  running: {
    chip: "bg-primary/15 text-primary ring-primary/30",
    dot: "bg-primary"
  },
  offline: {
    chip: "bg-muted text-muted-foreground ring-border",
    dot: "bg-muted-foreground"
  },
  error: {
    chip: "bg-destructive/15 text-destructive ring-destructive/30",
    dot: "bg-destructive"
  }
};
function DeviceStatusPicker({ device }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [lastError, setLastError] = useState(null);
  const mutation = useMutation({
    mutationFn: (status) => updateDevice(device.id, { status }),
    onMutate: async (status) => {
      setLastError(null);
      await queryClient.cancelQueries({ queryKey: ["devices"] });
      const previous = queryClient.getQueryData(["devices"]);
      if (previous) {
        queryClient.setQueryData(["devices"], {
          items: previous.items.map((d) => d.id === device.id ? { ...d, status } : d)
        });
      }
      return { previous };
    },
    onError: (err, _status, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["devices"], context.previous);
      }
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
      setLastError(t("workspace.status.updateError", { message }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
    }
  });
  const style = chipStyles[device.status];
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1", children: [
    /* @__PURE__ */ jsxs(
      Select,
      {
        value: device.status,
        onValueChange: (v) => mutation.mutate(v),
        disabled: mutation.isPending,
        children: [
          /* @__PURE__ */ jsxs(
            SelectTrigger,
            {
              "aria-label": `${device.name} status`,
              className: cn(
                "h-7 w-auto gap-1.5 rounded-full border-transparent px-2.5 py-1 text-xs font-medium shadow-none ring-1 focus:ring-2",
                style.chip
              ),
              children: [
                /* @__PURE__ */ jsx("span", { className: cn("h-1.5 w-1.5 rounded-full", style.dot) }),
                mutation.isPending ? /* @__PURE__ */ jsx(Loader2, { className: "h-3 w-3 animate-spin", "aria-hidden": true }) : /* @__PURE__ */ jsx(SelectValue, {})
              ]
            }
          ),
          /* @__PURE__ */ jsx(SelectContent, { children: statuses.map((s) => /* @__PURE__ */ jsx(SelectItem, { value: s, children: t(`workspace.status.${s}`) }, s)) })
        ]
      }
    ),
    lastError && /* @__PURE__ */ jsx("span", { className: "text-[10px] text-destructive", children: lastError })
  ] });
}
function ReproductionDeleteButton({
  recordId,
  paperTitle
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => deleteReproductionRecord(recordId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reproduction-records"] });
      setOpen(false);
    }
  });
  return /* @__PURE__ */ jsxs(
    AlertDialog,
    {
      open,
      onOpenChange: (next) => {
        if (mutation.isPending) return;
        setOpen(next);
        if (!next) mutation.reset();
      },
      children: [
        /* @__PURE__ */ jsx(AlertDialogTrigger, { asChild: true, children: /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            "aria-label": t("workspace.record.deleteBtn"),
            className: "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
            children: /* @__PURE__ */ jsx(Trash2, { className: "h-4 w-4", "aria-hidden": true })
          }
        ) }),
        /* @__PURE__ */ jsxs(AlertDialogContent, { children: [
          /* @__PURE__ */ jsxs(AlertDialogHeader, { children: [
            /* @__PURE__ */ jsx(AlertDialogTitle, { children: t("workspace.record.deleteTitle") }),
            /* @__PURE__ */ jsxs(AlertDialogDescription, { children: [
              /* @__PURE__ */ jsx("span", { className: "mb-1 block font-mono text-xs text-foreground", children: paperTitle }),
              t("workspace.record.deleteDesc")
            ] })
          ] }),
          mutation.isError && /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive", children: [
            /* @__PURE__ */ jsx("div", { children: t("workspace.record.deleteError", { message: errMsg$1(mutation.error) }) }),
            mutation.error instanceof ApiError && mutation.error.requestId && /* @__PURE__ */ jsx("div", { className: "mt-1 font-mono text-[10px] opacity-70", children: t("workspace.record.requestIdHint", { rid: mutation.error.requestId }) })
          ] }),
          /* @__PURE__ */ jsxs(AlertDialogFooter, { children: [
            /* @__PURE__ */ jsx(AlertDialogCancel, { disabled: mutation.isPending, children: t("workspace.record.cancel") }),
            /* @__PURE__ */ jsx(
              AlertDialogAction,
              {
                onClick: (e) => {
                  e.preventDefault();
                  mutation.mutate();
                },
                disabled: mutation.isPending,
                className: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                children: mutation.isPending ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin", "aria-hidden": true }),
                  t("workspace.record.saving")
                ] }) : t("workspace.record.deleteConfirm")
              }
            )
          ] })
        ] })
      ]
    }
  );
}
function errMsg$1(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
const reproductionStatuses = [
  "not_started",
  "running",
  "success",
  "failed",
  "paused"
];
function makeSchema(t) {
  return z.object({
    paperId: z.string().trim().min(1, t("workspace.record.paperRequired")),
    deviceId: z.string().nullable(),
    status: z.enum(reproductionStatuses),
    progress: z.number({ invalid_type_error: t("workspace.record.progressRange") }).int().min(0, t("workspace.record.progressRange")).max(100, t("workspace.record.progressRange")),
    resultSummary: z.string(),
    trainingNotes: z.string(),
    artifactUrl: z.string().trim().refine((v) => v === "" || isUrl(v), { message: t("workspace.record.urlInvalid") }),
    startedAt: z.string(),
    finishedAt: z.string()
  });
}
function ReproductionFormDialog({
  mode,
  record,
  trigger
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const schema = makeSchema(t);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: mode === "edit" && record ? {
      paperId: record.paper.id,
      deviceId: record.device?.id ?? null,
      status: record.status,
      progress: record.progress,
      resultSummary: record.resultSummary ?? "",
      trainingNotes: record.trainingNotes ?? "",
      artifactUrl: record.artifactUrl ?? "",
      startedAt: toDatetimeLocal(record.startedAt),
      finishedAt: toDatetimeLocal(record.finishedAt)
    } : blankDefaults()
  });
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
        finishedAt: toDatetimeLocal(record.finishedAt)
      });
    } else {
      form.reset(blankDefaults());
    }
  }, [open]);
  const papersQuery = useQuery({
    queryKey: ["papers", { page: 1, pageSize: 100 }],
    queryFn: () => listPapers({ page: 1, pageSize: 100 }),
    enabled: open
  });
  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
    enabled: open
  });
  const paperOptions = (papersQuery.data?.items ?? []).map((p) => ({
    value: p.id,
    label: p.title,
    hint: [p.authors[0], p.publishedYear ? String(p.publishedYear) : null, p.source].filter(Boolean).join(" · ") || null
  }));
  const deviceOptions = (devicesQuery.data?.items ?? []).map((d) => ({
    value: d.id,
    label: d.name,
    hint: [d.deviceType, d.location].filter(Boolean).join(" · ") || null
  }));
  const createMutation = useMutation({
    mutationFn: (input) => createReproductionRecord(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reproduction-records"] });
      setOpen(false);
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }) => updateReproductionRecord(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reproduction-records"] });
      setOpen(false);
    }
  });
  const mutation = mode === "create" ? createMutation : updateMutation;
  const onSubmit = form.handleSubmit((values) => {
    const payload = {
      paperId: values.paperId,
      deviceId: values.deviceId || null,
      status: values.status,
      progress: values.progress,
      resultSummary: values.resultSummary.trim() ? values.resultSummary : null,
      trainingNotes: values.trainingNotes.trim() ? values.trainingNotes : null,
      artifactUrl: values.artifactUrl.trim() ? values.artifactUrl : null,
      startedAt: values.startedAt ? fromDatetimeLocal(values.startedAt) : null,
      finishedAt: values.finishedAt ? fromDatetimeLocal(values.finishedAt) : null
    };
    if (mode === "create") {
      createMutation.mutate(payload);
    } else if (record) {
      const { paperId: _omit, ...patch } = payload;
      updateMutation.mutate({ id: record.id, input: patch });
    }
  });
  const titleKey = mode === "create" ? "workspace.record.dialogTitleCreate" : "workspace.record.dialogTitleEdit";
  const defaultTrigger = mode === "create" ? /* @__PURE__ */ jsxs(Button, { size: "sm", className: "gap-2", children: [
    /* @__PURE__ */ jsx(Plus, { className: "h-4 w-4", "aria-hidden": true }),
    t("workspace.record.addBtn")
  ] }) : /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      "aria-label": t("workspace.record.editBtn"),
      className: "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
      children: /* @__PURE__ */ jsx(Pencil, { className: "h-4 w-4", "aria-hidden": true })
    }
  );
  return /* @__PURE__ */ jsxs(
    Dialog,
    {
      open,
      onOpenChange: (next) => {
        if (mutation.isPending) return;
        setOpen(next);
        if (!next) mutation.reset();
      },
      children: [
        /* @__PURE__ */ jsx(DialogTrigger, { asChild: true, children: trigger ?? defaultTrigger }),
        /* @__PURE__ */ jsxs(DialogContent, { className: "sm:max-w-xl", children: [
          /* @__PURE__ */ jsxs(DialogHeader, { children: [
            /* @__PURE__ */ jsx(DialogTitle, { children: t(titleKey) }),
            /* @__PURE__ */ jsx(DialogDescription, { children: t("workspace.record.dialogDesc") })
          ] }),
          /* @__PURE__ */ jsxs("form", { onSubmit, className: "space-y-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsxs(Label, { htmlFor: "record-paper", children: [
                t("workspace.record.paper"),
                " ",
                /* @__PURE__ */ jsx("span", { className: "text-destructive", children: "*" })
              ] }),
              /* @__PURE__ */ jsx(
                EntityCombobox,
                {
                  id: "record-paper",
                  options: paperOptions,
                  value: form.watch("paperId") || null,
                  onChange: (next) => form.setValue("paperId", next ?? "", { shouldValidate: true }),
                  loading: papersQuery.isLoading,
                  disabled: mode === "edit",
                  ariaInvalid: Boolean(form.formState.errors.paperId)
                }
              ),
              form.formState.errors.paperId && /* @__PURE__ */ jsx("p", { className: "text-xs text-destructive", children: form.formState.errors.paperId.message })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsx(Label, { htmlFor: "record-device", children: t("workspace.record.device") }),
              /* @__PURE__ */ jsx(
                EntityCombobox,
                {
                  id: "record-device",
                  options: deviceOptions,
                  value: form.watch("deviceId"),
                  onChange: (next) => form.setValue("deviceId", next),
                  loading: devicesQuery.isLoading,
                  clearable: true,
                  clearLabel: t("workspace.record.deviceNone")
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
              /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsx(Label, { htmlFor: "record-status", children: t("workspace.record.status") }),
                /* @__PURE__ */ jsxs(
                  Select,
                  {
                    value: form.watch("status"),
                    onValueChange: (v) => form.setValue("status", v),
                    children: [
                      /* @__PURE__ */ jsx(SelectTrigger, { id: "record-status", children: /* @__PURE__ */ jsx(SelectValue, {}) }),
                      /* @__PURE__ */ jsx(SelectContent, { children: reproductionStatuses.map((s) => /* @__PURE__ */ jsx(SelectItem, { value: s, children: t(`repro.status.${s}`) }, s)) })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsx(Label, { htmlFor: "record-progress", children: t("workspace.record.progressLabel") }),
                /* @__PURE__ */ jsx(
                  Input,
                  {
                    id: "record-progress",
                    type: "number",
                    min: 0,
                    max: 100,
                    step: 1,
                    ...form.register("progress", { valueAsNumber: true }),
                    "aria-invalid": Boolean(form.formState.errors.progress) || void 0
                  }
                ),
                form.formState.errors.progress && /* @__PURE__ */ jsx("p", { className: "text-xs text-destructive", children: form.formState.errors.progress.message })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
              /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsx(Label, { htmlFor: "record-started-at", children: t("workspace.record.startedAtLabel") }),
                /* @__PURE__ */ jsx(Input, { id: "record-started-at", type: "datetime-local", ...form.register("startedAt") })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsx(Label, { htmlFor: "record-finished-at", children: t("workspace.record.finishedAtLabel") }),
                /* @__PURE__ */ jsx(
                  Input,
                  {
                    id: "record-finished-at",
                    type: "datetime-local",
                    ...form.register("finishedAt")
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsx(Label, { htmlFor: "record-artifact", children: t("workspace.record.artifactUrlLabel") }),
              /* @__PURE__ */ jsx(
                Input,
                {
                  id: "record-artifact",
                  type: "url",
                  placeholder: t("workspace.record.artifactUrlPlaceholder"),
                  ...form.register("artifactUrl"),
                  "aria-invalid": Boolean(form.formState.errors.artifactUrl) || void 0
                }
              ),
              form.formState.errors.artifactUrl && /* @__PURE__ */ jsx("p", { className: "text-xs text-destructive", children: form.formState.errors.artifactUrl.message })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsx(Label, { htmlFor: "record-summary", children: t("workspace.record.resultSummaryLabel") }),
              /* @__PURE__ */ jsx(
                Textarea,
                {
                  id: "record-summary",
                  rows: 3,
                  placeholder: t("workspace.record.resultSummaryPlaceholder"),
                  ...form.register("resultSummary")
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsx(Label, { htmlFor: "record-training-notes", children: t("workspace.record.trainingNotesLabel") }),
              /* @__PURE__ */ jsx(
                Textarea,
                {
                  id: "record-training-notes",
                  rows: 3,
                  placeholder: t("workspace.record.trainingNotesPlaceholder"),
                  ...form.register("trainingNotes")
                }
              )
            ] }),
            mutation.isError && /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive", children: [
              /* @__PURE__ */ jsx("div", { children: t("workspace.record.saveError", { message: errMsg(mutation.error) }) }),
              mutation.error instanceof ApiError && mutation.error.requestId && /* @__PURE__ */ jsx("div", { className: "mt-1 font-mono text-[10px] opacity-70", children: t("workspace.record.requestIdHint", { rid: mutation.error.requestId }) })
            ] }),
            /* @__PURE__ */ jsxs(DialogFooter, { children: [
              /* @__PURE__ */ jsx(
                Button,
                {
                  type: "button",
                  variant: "ghost",
                  onClick: () => setOpen(false),
                  disabled: mutation.isPending,
                  children: t("workspace.record.cancel")
                }
              ),
              /* @__PURE__ */ jsx(Button, { type: "submit", disabled: mutation.isPending, children: mutation.isPending ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin", "aria-hidden": true }),
                t("workspace.record.saving")
              ] }) : t("workspace.record.save") })
            ] })
          ] })
        ] })
      ]
    }
  );
}
function blankDefaults() {
  return {
    paperId: "",
    deviceId: null,
    status: "not_started",
    progress: 0,
    resultSummary: "",
    trainingNotes: "",
    artifactUrl: "",
    startedAt: "",
    finishedAt: ""
  };
}
function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function fromDatetimeLocal(local) {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
function isUrl(s) {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}
function errMsg(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
function WorkspacePage() {
  const {
    t
  } = useI18n();
  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices
  });
  const recordsQuery = useQuery({
    queryKey: ["reproduction-records"],
    queryFn: listReproductionRecords
  });
  const devices = useMemo(() => devicesQuery.data?.items ?? [], [devicesQuery.data]);
  const records = useMemo(() => recordsQuery.data?.items ?? [], [recordsQuery.data]);
  const stats = useMemo(() => {
    const by = {
      idle: 0,
      running: 0,
      offline: 0,
      error: 0
    };
    for (const d of devices) by[d.status] += 1;
    return by;
  }, [devices]);
  return /* @__PURE__ */ jsx(Shell, { active: "Workspace", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto w-full max-w-6xl px-8 py-10", children: [
    /* @__PURE__ */ jsxs("header", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-semibold tracking-tight", children: t("workspace.title") }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-muted-foreground", children: t("workspace.subtitle") })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mt-10", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold", children: t("workspace.devicesHeading") }),
        /* @__PURE__ */ jsx(DeviceFormDialog, {})
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5", children: [
        /* @__PURE__ */ jsx(StatCard, { label: t("workspace.stat.totalDevices"), value: devices.length, icon: HardDrive, accent: "text-muted-foreground" }),
        /* @__PURE__ */ jsx(StatCard, { label: t("workspace.stat.idle"), value: stats.idle, icon: CheckCircle2, accent: "text-[oklch(0.74_0.18_155)]" }),
        /* @__PURE__ */ jsx(StatCard, { label: t("workspace.stat.running"), value: stats.running, icon: RefreshCw, accent: "text-primary" }),
        /* @__PURE__ */ jsx(StatCard, { label: t("workspace.stat.offline"), value: stats.offline, icon: PowerOff, accent: "text-muted-foreground" }),
        /* @__PURE__ */ jsx(StatCard, { label: t("workspace.stat.error"), value: stats.error, icon: AlertCircle, accent: "text-destructive" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-5 overflow-hidden rounded-2xl border border-border", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr_80px] gap-4 border-b border-border bg-card/60 px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground", children: [
          /* @__PURE__ */ jsx("div", { children: t("workspace.device.name") }),
          /* @__PURE__ */ jsx("div", { children: t("workspace.device.type") }),
          /* @__PURE__ */ jsx("div", { children: t("workspace.device.status") }),
          /* @__PURE__ */ jsx("div", { children: t("workspace.device.location") }),
          /* @__PURE__ */ jsx("div", { children: t("workspace.device.description") }),
          /* @__PURE__ */ jsx("div", { className: "text-right", children: t("workspace.device.actions") })
        ] }),
        devicesQuery.isLoading ? /* @__PURE__ */ jsx(BlockMessage, { loading: true, text: t("workspace.loading") }) : devicesQuery.isError && !isNetworkError(devicesQuery.error) ? /* @__PURE__ */ jsx(BlockMessage, { tone: "error", text: t("workspace.loadError", {
          message: getErrorMessage(devicesQuery.error)
        }) }) : devices.length === 0 ? /* @__PURE__ */ jsx(BlockMessage, { text: t("workspace.empty") }) : devices.map((d) => /* @__PURE__ */ jsx(DeviceRow, { device: d }, d.id))
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "mt-10", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold", children: t("workspace.recordsHeading") }),
        /* @__PURE__ */ jsx(ReproductionFormDialog, { mode: "create" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4 overflow-hidden rounded-2xl border border-border", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[2fr_1fr_1fr_1.4fr_1fr_1fr_96px] gap-4 border-b border-border bg-card/60 px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground", children: [
          /* @__PURE__ */ jsx("div", { children: t("workspace.record.paper") }),
          /* @__PURE__ */ jsx("div", { children: t("workspace.record.device") }),
          /* @__PURE__ */ jsx("div", { children: t("workspace.record.status") }),
          /* @__PURE__ */ jsx("div", { children: t("workspace.record.progress") }),
          /* @__PURE__ */ jsx("div", { children: t("workspace.record.startedAt") }),
          /* @__PURE__ */ jsx("div", { children: t("workspace.record.finishedAt") }),
          /* @__PURE__ */ jsx("div", { className: "text-right", children: t("workspace.record.actions") })
        ] }),
        recordsQuery.isLoading ? /* @__PURE__ */ jsx(BlockMessage, { loading: true, text: t("workspace.loading") }) : recordsQuery.isError && !isNetworkError(recordsQuery.error) ? /* @__PURE__ */ jsx(BlockMessage, { tone: "error", text: t("workspace.loadError", {
          message: getErrorMessage(recordsQuery.error)
        }) }) : records.length === 0 ? /* @__PURE__ */ jsx(BlockMessage, { text: t("workspace.empty") }) : records.map((r) => /* @__PURE__ */ jsx(RecordRow, { record: r }, r.id))
      ] })
    ] })
  ] }) });
}
function StatCard({
  label,
  value,
  icon: Icon,
  accent
}) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground", children: [
      /* @__PURE__ */ jsx(Icon, { className: cn("h-4 w-4", accent) }),
      label
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-3 text-3xl font-semibold tabular-nums", children: value })
  ] });
}
function DeviceRow({
  device
}) {
  return /* @__PURE__ */ jsxs(Link, { to: "/manager", className: "grid grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr_80px] items-center gap-4 border-b border-border bg-card px-6 py-4 last:border-0 cursor-pointer transition-colors hover:bg-accent/50", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
      /* @__PURE__ */ jsx(Server, { className: "h-4 w-4 shrink-0 text-muted-foreground" }),
      /* @__PURE__ */ jsx("span", { className: "truncate font-medium", children: device.name })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "truncate text-sm text-muted-foreground", children: device.deviceType ?? "—" }),
    /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(DeviceStatusPicker, { device }) }),
    /* @__PURE__ */ jsx("div", { className: "truncate text-sm text-muted-foreground", children: device.location ?? "—" }),
    /* @__PURE__ */ jsx("div", { className: "truncate text-sm text-muted-foreground", children: device.description ?? "—" }),
    /* @__PURE__ */ jsx("div", { className: "flex justify-end", onClick: (e) => e.preventDefault(), children: /* @__PURE__ */ jsx(DeviceDeleteButton, { deviceId: device.id, deviceName: device.name }) })
  ] });
}
const recordStatusStyles = {
  not_started: {
    chip: "bg-muted text-muted-foreground ring-border",
    bar: "bg-muted"
  },
  running: {
    chip: "bg-primary/15 text-primary ring-primary/30",
    bar: "bg-primary"
  },
  success: {
    chip: "bg-[oklch(0.74_0.18_155)]/15 text-[oklch(0.74_0.18_155)] ring-[oklch(0.74_0.18_155)]/30",
    bar: "bg-[oklch(0.74_0.18_155)]"
  },
  failed: {
    chip: "bg-destructive/15 text-destructive ring-destructive/30",
    bar: "bg-destructive"
  },
  paused: {
    chip: "bg-secondary text-muted-foreground ring-border",
    bar: "bg-muted"
  }
};
function RecordRow({
  record
}) {
  const {
    t
  } = useI18n();
  const style = recordStatusStyles[record.status];
  return /* @__PURE__ */ jsxs(Link, { to: "/manager", search: {
    runId: record.id
  }, className: "grid grid-cols-[2fr_1fr_1fr_1.4fr_1fr_1fr_96px] items-center gap-4 border-b border-border bg-card px-6 py-4 last:border-0 cursor-pointer transition-colors hover:bg-accent/50", children: [
    /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
      /* @__PURE__ */ jsx("div", { className: "truncate font-medium", children: record.paper.title }),
      /* @__PURE__ */ jsx("div", { className: "mt-0.5 truncate font-mono text-xs text-muted-foreground", children: record.id })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "truncate text-sm text-muted-foreground", children: record.device?.name ?? "—" }),
    /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("span", { className: cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1", style.chip), children: t(`repro.status.${record.status}`) }) }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx("div", { className: "h-2 flex-1 overflow-hidden rounded-full bg-secondary", children: /* @__PURE__ */ jsx("div", { className: cn("h-full rounded-full transition-all", style.bar), style: {
        width: `${Math.max(0, Math.min(100, record.progress))}%`
      } }) }),
      /* @__PURE__ */ jsxs("span", { className: "w-10 text-right text-xs tabular-nums text-muted-foreground", children: [
        record.progress,
        "%"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "truncate text-xs text-muted-foreground", children: formatTs(record.startedAt) }),
    /* @__PURE__ */ jsx("div", { className: "truncate text-xs text-muted-foreground", children: formatTs(record.finishedAt) }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-end gap-1", onClick: (e) => e.preventDefault(), children: [
      /* @__PURE__ */ jsx(ReproductionFormDialog, { mode: "edit", record }),
      /* @__PURE__ */ jsx(ReproductionDeleteButton, { recordId: record.id, paperTitle: record.paper.title })
    ] })
  ] });
}
function formatTs(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
function BlockMessage({
  text,
  loading = false,
  tone = "muted"
}) {
  return /* @__PURE__ */ jsxs("div", { className: cn("flex items-center justify-center gap-2 bg-card px-6 py-12 text-sm", tone === "error" ? "text-destructive" : "text-muted-foreground"), children: [
    loading && /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin" }),
    tone === "error" && !loading && /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4" }),
    text
  ] });
}
function getErrorMessage(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
export {
  WorkspacePage as component
};
