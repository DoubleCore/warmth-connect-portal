import { jsx, jsxs } from "react/jsx-runtime";
import { S as Shell } from "./Shell-D8Pakp7k.js";
import "@tanstack/react-router";
import "lucide-react";
import "clsx";
import "tailwind-merge";
import "./router-DbOKu9BE.js";
import "@tanstack/react-query";
import "react";
import "zod";
function ErrorView({
  message
}) {
  return /* @__PURE__ */ jsx(Shell, { active: "Library", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-2xl px-8 py-20 text-center", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold", children: "Something went wrong" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: message })
  ] }) });
}
const SplitErrorComponent = ({
  error
}) => /* @__PURE__ */ jsx(ErrorView, { message: error.message });
export {
  SplitErrorComponent as errorComponent
};
