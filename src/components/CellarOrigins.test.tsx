import { renderToStaticMarkup } from "react-dom/server";
import { it, expect } from "vitest";
import { CellarOrigins } from "./CellarOrigins";

it("shows a semantic country table with expandable regions, without a duplicate map legend", () => {
  const html = renderToStaticMarkup(
    <CellarOrigins
      points={[
        { country: "France", region: "Bordeaux", count: 3 },
        { country: "France", region: "Champagne", count: 1 },
        { country: "Italy", region: "Toscana", count: 3 },
      ]}
    />,
  );
  expect(html).toContain("<table");
  expect(html).toContain('scope="col"');
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('aria-controls="');
  expect(html).toContain("Bordeaux");
  expect(html).toContain("Champagne");
  expect(html).not.toContain("<ul");
  expect(html).toContain('fill="#b28c55"');
});
