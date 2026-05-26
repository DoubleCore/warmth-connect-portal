import { jsx, Fragment } from "react/jsx-runtime";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { c as cn } from "./Shell-D8Pakp7k.js";
import { f as apiFetch, k as apiUrl } from "./router-DbOKu9BE.js";
const IMAGE_HEADER_RE = /!\[([^\]]*)\]\s*\(\s*(data:image\/[a-zA-Z0-9.+-]+;base64,)/g;
function ChatMarkdown({ children, className }) {
  return /* @__PURE__ */ jsx("div", { className: cn("command-md space-y-2 break-words text-sm leading-relaxed", className), children: renderContentWithDataImages(children) ?? /* @__PURE__ */ jsx(MarkdownBlocks, { children }) });
}
function MarkdownBlocks({ children }) {
  return /* @__PURE__ */ jsx(
    ReactMarkdown,
    {
      remarkPlugins: [remarkGfm],
      urlTransform: (url, key, node) => defaultUrlTransform(url, key, node),
      components: {
        h1: (props) => /* @__PURE__ */ jsx("h3", { className: "mt-3 mb-1 text-base font-semibold leading-snug", ...props }),
        h2: (props) => /* @__PURE__ */ jsx("h4", { className: "mt-3 mb-1 text-[15px] font-semibold leading-snug", ...props }),
        h3: (props) => /* @__PURE__ */ jsx("h5", { className: "mt-2 mb-1 text-sm font-semibold leading-snug", ...props }),
        h4: (props) => /* @__PURE__ */ jsx("h6", { className: "mt-2 mb-1 text-sm font-semibold leading-snug", ...props }),
        h5: (props) => /* @__PURE__ */ jsx("h6", { className: "mt-2 mb-1 text-sm font-semibold leading-snug", ...props }),
        h6: (props) => /* @__PURE__ */ jsx("h6", { className: "mt-2 mb-1 text-sm font-semibold leading-snug", ...props }),
        p: (props) => /* @__PURE__ */ jsx("p", { className: "my-1 leading-relaxed", ...props }),
        ul: (props) => /* @__PURE__ */ jsx("ul", { className: "my-1 list-disc space-y-1 pl-5", ...props }),
        ol: (props) => /* @__PURE__ */ jsx("ol", { className: "my-1 list-decimal space-y-1 pl-5", ...props }),
        li: (props) => /* @__PURE__ */ jsx("li", { className: "leading-relaxed", ...props }),
        strong: (props) => /* @__PURE__ */ jsx("strong", { className: "font-semibold", ...props }),
        em: (props) => /* @__PURE__ */ jsx("em", { className: "italic", ...props }),
        hr: () => /* @__PURE__ */ jsx("hr", { className: "my-3 border-border" }),
        a: ({ href, ...rest }) => /* @__PURE__ */ jsx(
          "a",
          {
            href,
            target: isExternalHref(href) ? "_blank" : void 0,
            rel: isExternalHref(href) ? "noopener noreferrer" : void 0,
            className: "text-primary underline-offset-2 hover:underline",
            ...rest
          }
        ),
        blockquote: (props) => /* @__PURE__ */ jsx(
          "blockquote",
          {
            className: "my-2 border-l-2 border-border pl-3 text-muted-foreground",
            ...props
          }
        ),
        code: ({ className, children: codeChildren, ...rest }) => {
          const isBlock = /language-/.test(className ?? "");
          if (isBlock) {
            return /* @__PURE__ */ jsx("code", { className: cn("block font-mono text-xs leading-relaxed", className), ...rest, children: codeChildren });
          }
          return /* @__PURE__ */ jsx("code", { className: "rounded bg-secondary/70 px-1 py-0.5 font-mono text-[0.85em]", ...rest, children: codeChildren });
        },
        pre: (props) => /* @__PURE__ */ jsx(
          "pre",
          {
            className: "my-2 max-h-72 overflow-auto rounded-lg border border-border bg-secondary/70 p-3 text-xs leading-relaxed",
            ...props
          }
        ),
        table: (props) => /* @__PURE__ */ jsx("div", { className: "my-2 overflow-x-auto rounded-lg border border-border", children: /* @__PURE__ */ jsx("table", { className: "w-full border-collapse text-left text-xs", ...props }) }),
        thead: (props) => /* @__PURE__ */ jsx("thead", { className: "bg-secondary/70", ...props }),
        th: (props) => /* @__PURE__ */ jsx(
          "th",
          {
            className: "border-b border-r border-border px-2 py-1.5 font-semibold last:border-r-0",
            ...props
          }
        ),
        td: (props) => /* @__PURE__ */ jsx(
          "td",
          {
            className: "border-b border-r border-border px-2 py-1.5 align-top last:border-r-0",
            ...props
          }
        ),
        img: ({ alt, ...rest }) => /* @__PURE__ */ jsx("img", { alt: alt ?? "", className: "my-2 h-auto max-w-full rounded-lg", ...rest })
      },
      children
    }
  );
}
function renderContentWithDataImages(content) {
  const parts = splitDataImages(content);
  if (!parts.some((part) => part.type === "image")) return null;
  return /* @__PURE__ */ jsx(Fragment, { children: parts.map(
    (part, index) => part.type === "image" ? /* @__PURE__ */ jsx(
      "img",
      {
        src: part.src,
        alt: part.alt,
        className: "my-2 h-auto max-w-full rounded-lg"
      },
      index
    ) : /* @__PURE__ */ jsx(MarkdownBlocks, { children: part.text }, index)
  ) });
}
function splitDataImages(content) {
  const parts = [];
  let lastIndex = 0;
  IMAGE_HEADER_RE.lastIndex = 0;
  for (let match = IMAGE_HEADER_RE.exec(content); match; match = IMAGE_HEADER_RE.exec(content)) {
    const [, alt, prefix] = match;
    const bodyStart = match.index + match[0].length;
    let cursor = bodyStart;
    while (cursor < content.length && /[A-Za-z0-9+/=]/.test(content[cursor])) cursor += 1;
    if (cursor === bodyStart) continue;
    const src = prefix + content.slice(bodyStart, cursor);
    let after = cursor;
    while (after < content.length && /[\s>]/.test(content[after])) after += 1;
    if (content[after] === ")") after += 1;
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "image", alt, src });
    lastIndex = after;
    IMAGE_HEADER_RE.lastIndex = after;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", text: content.slice(lastIndex) });
  }
  return parts;
}
function isExternalHref(href) {
  if (!href || !/^https?:\/\//i.test(href)) return false;
  if (typeof window === "undefined") return true;
  try {
    return new URL(href).host !== window.location.host;
  } catch {
    return false;
  }
}
async function createFastClawSession(input) {
  return apiFetch("/api/fastclaw/sessions", {
    method: "POST",
    json: {
      entry: input?.entry,
      initialContext: input?.initialContext ?? {},
      agentRole: input?.agentRole,
      agentId: input?.agentId
    }
  });
}
async function getFastClawSessionHistory(sessionId) {
  return apiFetch(
    `/api/fastclaw/sessions/${encodeURIComponent(sessionId)}/history`
  );
}
async function sendFastClawMessage(sessionId, input) {
  return apiFetch(
    `/api/fastclaw/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      json: {
        message: input.message,
        context: input.context ?? {},
        systemPrompt: input.systemPrompt,
        agentRole: input.agentRole,
        agentId: input.agentId
      }
    }
  );
}
async function startFastClawDeploy(sessionId, input) {
  return apiFetch(
    `/api/fastclaw/sessions/${encodeURIComponent(sessionId)}/deploy`,
    {
      method: "POST",
      json: input
    }
  );
}
function openFastClawRunStream(runId) {
  return new EventSource(apiUrl(`/api/fastclaw/runs/${encodeURIComponent(runId)}/stream`), {
    withCredentials: false
  });
}
export {
  ChatMarkdown as C,
  startFastClawDeploy as a,
  createFastClawSession as c,
  getFastClawSessionHistory as g,
  openFastClawRunStream as o,
  sendFastClawMessage as s
};
