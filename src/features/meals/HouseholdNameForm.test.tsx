import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HouseholdNameForm } from "./HouseholdNameForm";
const household = {
  id: "synthetic-household",
  user_id: "synthetic-owner",
  name: "Synthetic household",
  revision: 1,
};
describe("household name form", () => {
  it("renders a labelled draft field without starting a write", () => {
    const onSave = vi.fn();
    const html = renderToStaticMarkup(
      <HouseholdNameForm
        household={household}
        busy={false}
        draft={null}
        onDraft={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(html).toContain('aria-label="Ändra hushållets namn"');
    expect(html).toContain('name="groupName"');
    expect(html).toContain('value="Synthetic household"');
    expect(html).toContain('<button class="k-text" disabled="" type="submit">');
    expect(onSave).not.toHaveBeenCalled();
  });
  it("disables the name input while the captured write is pending", () => {
    const html = renderToStaticMarkup(
      <HouseholdNameForm
        household={household}
        busy
        draft={null}
        onDraft={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const input = html.match(/<input[^>]*>/)?.[0] ?? "";
    expect(input).toContain('disabled=""');
    expect(html).not.toContain("Avbryt namnändring");
  });
  it("retains the typed name and blocks saving against a newer server revision", () => {
    const onDraft = vi.fn(),
      onSave = vi.fn();
    const html = renderToStaticMarkup(
      <HouseholdNameForm
        household={{ ...household, revision: 2, name: "New server name" }}
        busy={false}
        draft={{ householdId: household.id, revision: 1, name: "Original draft" }}
        onDraft={onDraft}
        onSave={onSave}
      />,
    );
    expect(html).toContain('value="Original draft"');
    expect(html).toContain("Hushållet har ändrats");
    expect(html).toContain('<button class="k-text" disabled="" type="submit">');
    expect(html).toContain("Avbryt namnändring");
    expect(onDraft).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
  it("does not claim a conflict while an in-flight own write is still being confirmed", () => {
    const html = renderToStaticMarkup(
      <HouseholdNameForm
        household={{ ...household, revision: 2 }}
        busy
        draft={{ householdId: household.id, revision: 1, name: "Pending draft" }}
        onDraft={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(html).not.toContain("Hushållet har ändrats");
    expect(html).toContain('value="Pending draft"');
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });
});
