import { describe, expect, it } from "vitest";
import { selectOwnedTextAi, textAiRollbackTag } from "./owned-text-ai.mjs";

describe("owned text AI profiles", () => {
  it("retains the installed setting and treats old unlabeled installs as Gemini", () => {
    expect(selectOwnedTextAi({ action: "Resume" })).toEqual({
      provider: "gemini",
      model: undefined,
    });
    expect(
      selectOwnedTextAi({
        action: "RestartApp",
        installed: "openai",
        installedModel: "gpt-6.2-sol",
      }),
    ).toEqual({ provider: "openai", model: "gpt-6.2-sol" });
  });

  it("chooses Luna by default and Sol only explicitly", () => {
    expect(selectOwnedTextAi({ action: "TextAiUpdate", requested: "openai" })).toEqual({
      provider: "openai",
      model: "gpt-6-luna",
    });
    expect(
      selectOwnedTextAi({ action: "TextAiUpdate", requested: "openai", model: "gpt-6.2-sol" }),
    ).toEqual({ provider: "openai", model: "gpt-6.2-sol" });
    expect(
      selectOwnedTextAi({
        action: "TextAiUpdate",
        requested: "gemini",
        installed: "openai",
        installedModel: "gpt-6-luna",
      }),
    ).toEqual({ provider: "gemini", model: undefined });
  });

  it.each([
    { action: "TextAiUpdate" },
    { action: "Start", requested: "openai" },
    { action: "Update", requested: "gemini" },
    { action: "TextAiUpdate", requested: "other" },
    { action: "TextAiUpdate", requested: "gemini", model: "gpt-6-luna" },
    { action: "TextAiUpdate", requested: "openai", model: "unknown" },
    { action: "Verify", installed: "openai" },
    { action: "Verify", installedModel: "gpt-6-luna" },
  ])("rejects ambiguous or uncontrolled choices: %j", (options) => {
    expect(() => selectOwnedTextAi(options)).toThrow();
  });

  it("retains an image identity, not a mutable image name", () => {
    expect(textAiRollbackTag("sha256:" + "a".repeat(64))).toBe(
      "winesnap-owned:text-ai-rollback-aaaaaaaaaaaa",
    );
    expect(() => textAiRollbackTag("winesnap-owned:local")).toThrow();
  });
});
