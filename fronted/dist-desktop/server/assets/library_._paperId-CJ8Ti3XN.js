import { jsx, jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { S as Shell } from "./Shell-D8Pakp7k.js";
import { u as useI18n } from "./router-DbOKu9BE.js";
import "clsx";
import "tailwind-merge";
import "@tanstack/react-query";
import "react";
import "zod";
function NotFoundView() {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsx(Shell, { active: "Library", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-2xl px-8 py-20 text-center", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-3xl font-semibold", children: t("paper.notFound") }),
    /* @__PURE__ */ jsx("p", { className: "mt-3 text-muted-foreground", children: t("paper.notFoundHint") }),
    /* @__PURE__ */ jsxs(Link, { to: "/library", className: "mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground", children: [
      /* @__PURE__ */ jsx(ArrowLeft, { className: "h-4 w-4" }),
      " ",
      t("paper.backToLibrary")
    ] })
  ] }) });
}
export {
  NotFoundView as notFoundComponent
};
