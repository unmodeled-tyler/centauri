import type { ReactNode } from "react";
import { Highlight, themes, type RenderProps, type Token } from "prism-react-renderer";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  astro: "tsx",
  c: "c",
  cc: "cpp",
  coffee: "coffeescript",
  cpp: "cpp",
  css: "css",
  cxx: "cpp",
  go: "go",
  gql: "graphql",
  graphql: "graphql",
  h: "c",
  htm: "html",
  hpp: "cpp",
  html: "html",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  py: "python",
  rs: "rust",
  scss: "css",
  sql: "sql",
  svelte: "tsx",
  swift: "swift",
  ts: "typescript",
  tsx: "tsx",
  vue: "tsx",
  xml: "markup",
  yaml: "yaml",
  yml: "yaml",
};

const LANGUAGE_BY_FILENAME: Record<string, string> = {
  "package-lock.json": "json",
  "package.json": "json",
};

const EMPTY_LINE_TOKENS: Token[] = [{ content: "", types: ["plain"] }];

function getLanguageForPath(filePath?: string | null): string {
  if (!filePath) {
    return "text";
  }

  const fileName = filePath.split("/").pop()?.toLowerCase() ?? "";
  const byName = LANGUAGE_BY_FILENAME[fileName];
  if (byName) {
    return byName;
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : undefined;
  return extension ? LANGUAGE_BY_EXTENSION[extension] ?? "text" : "text";
}

export function HighlightedTokens({
  tokens,
  getTokenProps,
}: {
  tokens: Token[];
  getTokenProps: RenderProps["getTokenProps"];
}) {
  return (
    <>
      {tokens.map((token, tokenIndex) => {
        const tokenProps = getTokenProps({ token });
        return <span key={tokenIndex} {...tokenProps} />;
      })}
    </>
  );
}

export function SyntaxHighlightedLines<T>({
  items,
  filePath,
  getLineContent,
  children,
}: {
  items: T[];
  filePath?: string | null;
  getLineContent: (item: T) => string;
  children: (line: {
    item: T;
    index: number;
    tokens: Token[];
    getTokenProps: RenderProps["getTokenProps"];
  }) => ReactNode;
}) {
  const code = items.map(getLineContent).join("\n");
  const language = getLanguageForPath(filePath);

  return (
    <Highlight code={code} language={language} theme={themes.oneDark}>
      {({ tokens, getTokenProps }) => (
        <>
          {items.map((item, index) =>
            children({
              item,
              index,
              tokens: tokens[index] ?? EMPTY_LINE_TOKENS,
              getTokenProps,
            }),
          )}
        </>
      )}
    </Highlight>
  );
}
