import { describe, expect, it } from "vitest";
import {
  checkImageInput,
  createAttemptGuard,
  extensionForMime,
  isSupportedByLabelText,
  isUncertain,
  isVintageSupported,
  sanitizeAnalysis,
  MAX_IMAGE_BYTES,
} from "./scanIdentity";

const labelField = (value: unknown, confidence = 90, evidence = "printed on label") => ({
  value,
  source: "label",
  confidence,
  evidence,
});

describe("label text support", () => {
  it("accepts values printed on the label", () => {
    expect(isSupportedByLabelText("Zehn Morgen", "ZEHN MORGEN 20/23 NAHE")).toBe(true);
    expect(isSupportedByLabelText("Nahe", "ZEHN MORGEN 20/23 NAHE")).toBe(true);
  });

  it("rejects values that are nowhere on the label", () => {
    const label = "ZEHN MORGEN 20 / 23 NAHE CHARDONNAY & WEISSER BURGUNDER KALK & SANDSTEIN";
    expect(isSupportedByLabelText("Weingut Zilliken (Forstmeister Geltz)", label)).toBe(false);
    expect(isSupportedByLabelText("Zilliken Mosel Riesling", label)).toBe(false);
    expect(isSupportedByLabelText("Mosel", label)).toBe(false);
    expect(isSupportedByLabelText("Riesling", label)).toBe(false);
  });

  it("handles short and two-digit vintages", () => {
    expect(isVintageSupported(2023, "ZEHN MORGEN 20 / 23 NAHE")).toBe(true);
    expect(isVintageSupported(2015, "ZEHN MORGEN 20 / 23 NAHE")).toBe(false);
  });
});

describe("sanitizeAnalysis", () => {
  const zehnMorgenLabel =
    "ZEHN MORGEN\n20 / 23\nNAHE\nCHARDONNAY & WEISSER BURGUNDER\nKALK & SANDSTEIN";

  it("keeps identity that matches the transcribed label", () => {
    const result = sanitizeAnalysis({
      label_text: zehnMorgenLabel,
      identity: {
        wine_name: labelField("Zehn Morgen"),
        vintage: labelField("2023"),
        region: labelField("Nahe"),
        country: labelField("Germany", 80),
        grape_varieties: [labelField("Chardonnay"), labelField("Weisser Burgunder")],
        wine_type: labelField("white"),
      },
      taste: { description: "Crisp and mineral.", acidity: 8 },
    });

    expect(result.identified).toBe(true);
    expect(result.wine.wine_name).toBe("Zehn Morgen");
    expect(result.wine.vintage).toBe(2023);
    expect(result.wine.region).toBe("Nahe");
    expect(result.wine.grape_varieties).toEqual(["Chardonnay", "Weisser Burgunder"]);
    expect(result.wine.acidity).toBe(8);
  });

  it("rejects the reported Zilliken/Mosel/Riesling hallucination", () => {
    const result = sanitizeAnalysis({
      label_text: zehnMorgenLabel,
      identity: {
        producer: labelField("Weingut Zilliken (Forstmeister Geltz)"),
        wine_name: labelField("Zilliken Mosel Riesling"),
        vintage: labelField("2023"),
        region: labelField("Mosel"),
        country: labelField("Germany"),
        grape_varieties: [labelField("Riesling")],
      },
      taste: {},
    });

    expect(result.wine.producer).toBeNull();
    expect(result.wine.wine_name).toBeNull();
    expect(result.wine.region).toBeNull();
    expect(result.wine.grape_varieties).toBeNull();
    expect(result.identified).toBe(false);
    expect(result.rejected).toContain("producer");
    expect(isUncertain(result)).toBe(true);
  });

  it("never fills identity gaps from inference", () => {
    const result = sanitizeAnalysis({
      label_text: "ZEHN MORGEN",
      identity: {
        wine_name: labelField("Zehn Morgen"),
        producer: { value: "Weingut Wittmann", source: "inference", confidence: 95 },
        region: { value: "Rheinhessen", source: "inference", confidence: 90 },
      },
      taste: {},
    });
    expect(result.wine.producer).toBeNull();
    expect(result.wine.region).toBeNull();
    expect(result.wine.wine_name).toBe("Zehn Morgen");
  });

  it("treats an empty or unreadable label as not identified", () => {
    const empty = sanitizeAnalysis({ label_text: "", identity: {}, taste: {} });
    expect(empty.identified).toBe(false);

    const unreadable = sanitizeAnalysis({
      label_text: "unreadable",
      identity: { wine_name: labelField("Unknown"), producer: labelField("not visible") },
      taste: {},
    });
    expect(unreadable.identified).toBe(false);
  });

  it("drops low-confidence identity fields", () => {
    const result = sanitizeAnalysis({
      label_text: "ZEHN MORGEN NAHE",
      identity: { wine_name: labelField("Zehn Morgen", 20) },
      taste: {},
    });
    expect(result.wine.wine_name).toBeNull();
    expect(result.identified).toBe(false);
  });

  it("uses the user's own text as evidence in text mode", () => {
    const result = sanitizeAnalysis(
      {
        identity: {
          producer: labelField("Château Margaux"),
          vintage: labelField("2015"),
        },
        taste: {},
      },
      "Château Margaux 2015",
    );
    expect(result.wine.producer).toBe("Château Margaux");
    expect(result.wine.vintage).toBe(2015);
  });
});

describe("attempt guard", () => {
  it("ignores a stale response that arrives after a newer attempt", () => {
    const guard = createAttemptGuard();
    const a = guard.start();
    const b = guard.start();
    expect(guard.isCurrent(a)).toBe(false);
    expect(guard.isCurrent(b)).toBe(true);
  });

  it("ignores every response after cancel / unmount", () => {
    const guard = createAttemptGuard();
    const a = guard.start();
    guard.cancel();
    expect(guard.isCurrent(a)).toBe(false);
    expect(guard.isBusy()).toBe(false);
  });

  it("blocks a double submit while an attempt is in flight", () => {
    const guard = createAttemptGuard();
    expect(guard.isBusy()).toBe(false);
    const a = guard.start();
    expect(guard.isBusy()).toBe(true);
    guard.finish(a);
    expect(guard.isBusy()).toBe(false);
  });
});

describe("image input checks", () => {
  it("accepts common photo types and maps extensions", () => {
    expect(checkImageInput({ type: "image/png", size: 1000 })).toEqual({
      ok: true,
      mimeType: "image/png",
    });
    expect(checkImageInput({ type: "", size: 1000 })).toEqual({ ok: true, mimeType: "image/jpeg" });
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
  });

  it("rejects empty, oversized and non-image files", () => {
    expect(checkImageInput({ type: "image/jpeg", size: 0 })).toEqual({ ok: false, reason: "empty" });
    expect(checkImageInput({ type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 })).toEqual({
      ok: false,
      reason: "size",
    });
    expect(checkImageInput({ type: "application/pdf", size: 100 })).toEqual({
      ok: false,
      reason: "type",
    });
  });
});
