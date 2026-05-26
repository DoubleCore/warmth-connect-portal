import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type ChatMarkdownProps = {
  children: string;
  className?: string;
};

type MarkdownPart = { type: "text"; text: string } | { type: "image"; alt: string; src: string };

const IMAGE_HEADER_RE = /!\[([^\]]*)\]\s*\(\s*(data:image\/[a-zA-Z0-9.+-]+;base64,)/g;

/**
 * Markdown tuned for chat bubbles rather than long-form documents.
 * It keeps headings, tables, code, and lists readable without letting
 * assistant replies sprawl vertically.
 */
export function ChatMarkdown({ children, className }: ChatMarkdownProps) {
  return (
    <div className={cn("command-md space-y-2 break-words text-sm leading-relaxed", className)}>
      {renderContentWithDataImages(children) ?? <MarkdownBlocks>{children}</MarkdownBlocks>}
    </div>
  );
}

function MarkdownBlocks({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url, key, node) => defaultUrlTransform(url, key, node)}
      components={{
        h1: (props) => <h3 className="mt-3 mb-1 text-base font-semibold leading-snug" {...props} />,
        h2: (props) => (
          <h4 className="mt-3 mb-1 text-[15px] font-semibold leading-snug" {...props} />
        ),
        h3: (props) => <h5 className="mt-2 mb-1 text-sm font-semibold leading-snug" {...props} />,
        h4: (props) => <h6 className="mt-2 mb-1 text-sm font-semibold leading-snug" {...props} />,
        h5: (props) => <h6 className="mt-2 mb-1 text-sm font-semibold leading-snug" {...props} />,
        h6: (props) => <h6 className="mt-2 mb-1 text-sm font-semibold leading-snug" {...props} />,
        p: (props) => <p className="my-1 leading-relaxed" {...props} />,
        ul: (props) => <ul className="my-1 list-disc space-y-1 pl-5" {...props} />,
        ol: (props) => <ol className="my-1 list-decimal space-y-1 pl-5" {...props} />,
        li: (props) => <li className="leading-relaxed" {...props} />,
        strong: (props) => <strong className="font-semibold" {...props} />,
        em: (props) => <em className="italic" {...props} />,
        hr: () => <hr className="my-3 border-border" />,
        a: ({ href, ...rest }) => (
          <a
            href={href}
            target={isExternalHref(href) ? "_blank" : undefined}
            rel={isExternalHref(href) ? "noopener noreferrer" : undefined}
            className="text-primary underline-offset-2 hover:underline"
            {...rest}
          />
        ),
        blockquote: (props) => (
          <blockquote
            className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
            {...props}
          />
        ),
        code: ({ className, children: codeChildren, ...rest }) => {
          const isBlock = /language-/.test(className ?? "");
          if (isBlock) {
            return (
              <code className={cn("block font-mono text-xs leading-relaxed", className)} {...rest}>
                {codeChildren}
              </code>
            );
          }
          return (
            <code className="rounded bg-secondary/70 px-1 py-0.5 font-mono text-[0.85em]" {...rest}>
              {codeChildren}
            </code>
          );
        },
        pre: (props) => (
          <pre
            className="my-2 max-h-72 overflow-auto rounded-lg border border-border bg-secondary/70 p-3 text-xs leading-relaxed"
            {...props}
          />
        ),
        table: (props) => (
          <div className="my-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-left text-xs" {...props} />
          </div>
        ),
        thead: (props) => <thead className="bg-secondary/70" {...props} />,
        th: (props) => (
          <th
            className="border-b border-r border-border px-2 py-1.5 font-semibold last:border-r-0"
            {...props}
          />
        ),
        td: (props) => (
          <td
            className="border-b border-r border-border px-2 py-1.5 align-top last:border-r-0"
            {...props}
          />
        ),
        img: ({ alt, ...rest }) => (
          <img alt={alt ?? ""} className="my-2 h-auto max-w-full rounded-lg" {...rest} />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function renderContentWithDataImages(content: string): React.ReactNode | null {
  const parts = splitDataImages(content);
  if (!parts.some((part) => part.type === "image")) return null;

  return (
    <>
      {parts.map((part, index) =>
        part.type === "image" ? (
          <img
            key={index}
            src={part.src}
            alt={part.alt}
            className="my-2 h-auto max-w-full rounded-lg"
          />
        ) : (
          <MarkdownBlocks key={index}>{part.text}</MarkdownBlocks>
        ),
      )}
    </>
  );
}

function splitDataImages(content: string): MarkdownPart[] {
  const parts: MarkdownPart[] = [];
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

function isExternalHref(href: string | undefined): boolean {
  if (!href || !/^https?:\/\//i.test(href)) return false;
  if (typeof window === "undefined") return true;
  try {
    return new URL(href).host !== window.location.host;
  } catch {
    return false;
  }
}
