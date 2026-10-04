import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useT } from "@/i18n";

export function ChatMessageContent({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const t = useT();
  if (role === "user") return <p className="whitespace-pre-wrap break-words">{content}</p>;

  return (
    <div className="chat-answer">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
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
