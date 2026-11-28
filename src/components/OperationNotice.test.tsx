import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperationNotice } from "./OperationNotice";
describe("actionable operation states", () => {
  it("announces failures and labels a real 48px retry control", () => {
    const html = renderToStaticMarkup(
      <OperationNotice kind="error" action={{ label: "Load again", onClick: () => {} }}>
        Could not load
      </OperationNotice>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('type="button"');
    expect(html).toContain("Load again");
  });
  it("distinguishes loading from offline and successful acknowledgement", () => {
    expect(
      renderToStaticMarkup(<OperationNotice kind="loading">Loading</OperationNotice>),
    ).toContain('aria-busy="true"');
    expect(
      renderToStaticMarkup(<OperationNotice kind="offline">Offline</OperationNotice>),
    ).not.toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<OperationNotice kind="success">Saved</OperationNotice>)).toContain(
      'role="status"',
    );
  });
});
