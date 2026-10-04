import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessageContent } from "./ChatMessageContent";

const answer = (content: string) =>
  renderToStaticMarkup(<ChatMessageContent role="assistant" content={content} />);

describe("sommelier message formatting", () => {
  it("renders saved answers with emphasis, paragraphs and real bullet lists", () => {
    const html = answer(
      "Din smak är **frisk och mångsidig**.\n\n* **Balans:** Låg strävhet.\n* **Favoriter:** Merlot och *Shiraz*.\n\nKort sagt: fruktiga viner.",
    );
    expect(html).toContain("<strong>frisk och mångsidig</strong>");
    expect(html).toContain("<strong>Balans:</strong>");
    expect(html).toContain("<em>Shiraz</em>");
    expect(html).toContain("<ul>");
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain("<p>Kort sagt: fruktiga viner.</p>");
    expect(html).not.toContain("**");
  });

  it("supports compact headings, numbered lists, quotes and comparison tables", () => {
    const html = answer(
      "### Matparning\n\n1. Fisk\n2. Kyckling\n\n> Servera svalt.\n\n| Vin | Stil |\n| --- | --- |\n| Riesling | Frisk |",
    );
    expect(html).toContain("<h3>Matparning</h3>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<table>");
    expect(html).toContain('aria-label="Table in AI answer"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("overflow-x-auto");
  });

  it("keeps user messages as escaped plain text with their line breaks", () => {
    const html = renderToStaticMarkup(
      <ChatMessageContent role="user" content={'**Riesling**\n<script>alert("x")</script>'} />,
    );
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("**Riesling**\n&lt;script&gt;");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("<script>");
  });

  it("rejects unsafe links and does not render model-authored HTML", () => {
    const html = answer(
      '[unsafe](javascript:alert%281%29)\n\n[data](data:text/html,attack)\n\n<script>alert("x")</script>\n\n<img src="https://example.com/track" onerror="alert(1)">',
    );
    expect(html).toContain("<span>unsafe</span>");
    expect(html).toContain("<span>data</span>");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
  });

  it("opens safe links separately and never automatically loads remote images", () => {
    const html = answer(
      "[Producent](https://example.com/wine)\n\n![Etikett](https://example.com/track)",
    );
    expect(html).toContain('href="https://example.com/wine"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain("<span>Etikett</span>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("example.com/track");
    expect(html).not.toContain('rel="preload"');
  });
});
