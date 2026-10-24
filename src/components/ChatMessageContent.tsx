import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useT } from "@/i18n";
import type { ReactNode } from "react";

function SectionHeading({ children }: { children?: ReactNode }) {
  return <h2>{children}</h2>;
}

export function ChatMessageContent({
  role,
  content,
  normalizeHeadings = false,
}: {
  role: "user" | "assistant";
  content: string;
  normalizeHeadings?: boolean;
}) {
  const t = useT();
  if (role === "user") return <p className="whitespace-pre-wrap break-words">{content}</p>;

  return (
    <div className="chat-answer">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          ...(normalizeHeadings
            ? {
                h1: SectionHeading,
                h2: SectionHeading,
                h3: SectionHeading,
                h4: SectionHeading,
                h5: SectionHeading,
                h6: SectionHeading,
              }
            : {}),
          a: ({ children, href, title }) =>
            href ? (
              <a href={href} title={title} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          // Keep model-authored images from loading third-party tracking URLs.
          img: ({ alt }) => (alt ? <span>{alt}</span> : null),
          table: ({ children }) => (
            <div
              className="max-w-full overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label={t("ask.answerTable")}
            >
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
