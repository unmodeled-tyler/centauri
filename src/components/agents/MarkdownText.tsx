import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const remarkPlugins = [remarkGfm];

const components: Components = {
  p: ({ children }) => <p className="my-2">{children}</p>,
  h1: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold text-zinc-100">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-4 text-sm font-semibold text-zinc-100">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-2 mt-4 text-sm font-semibold text-zinc-100">{children}</h4>,
  h4: ({ children }) => <h4 className="mb-2 mt-3 text-sm font-semibold text-zinc-100">{children}</h4>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-zinc-700 pl-3 text-zinc-400">{children}</blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.startsWith("language-") || String(children).includes("\n");
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[0.9em] text-zinc-100">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5 text-zinc-200">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-800 bg-zinc-900 px-2 py-1 font-semibold text-zinc-100">{children}</th>
  ),
  td: ({ children }) => <td className="border border-zinc-800 px-2 py-1 text-zinc-300">{children}</td>,
};

export function MarkdownText({ content }: { content: string }) {
  return (
    <div className="text-sm leading-6 text-zinc-200">
      <ReactMarkdown components={components} remarkPlugins={remarkPlugins} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
