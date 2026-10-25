import { describe, expect, it } from "vitest";
import {
  isPrivacyInformationComplete,
  isPrivacyInformationVerified,
  resolveSiteInformation,
} from "./siteInformation";

describe("public site information", () => {
  it.each([undefined, "false", "TRUE", "1", " true "])(
    "does not turn working operations into supplier approval: %s",
    (suppliers) => {
      const info = resolveSiteInformation({
        VITE_PRIVACY_RETENTION: "Test retention",
        VITE_PRIVACY_LEGAL_BASIS: "Test basis",
      });
      expect(isPrivacyInformationComplete(info)).toBe(true);
      expect(isPrivacyInformationVerified(info, "true", suppliers)).toBe(false);
    },
  );
  it("requires complete text, operational acceptance and separate supplier sign-off", () => {
    const info = resolveSiteInformation({
      VITE_PRIVACY_RETENTION: "Test retention",
      VITE_PRIVACY_LEGAL_BASIS: "Test basis",
    });
    expect(isPrivacyInformationVerified(info, "false", "true")).toBe(false);
    expect(isPrivacyInformationVerified(resolveSiteInformation({}), "true", "true")).toBe(false);
    expect(isPrivacyInformationVerified(info, "true", "true")).toBe(true);
  });
  it("uses the approved operator and postal address without inventing legal details", () => {
    const info = resolveSiteInformation({});
    expect(info).toEqual({
      operator: "Boleo AI",
      postalAddress: "Morkullev\u00e4gen 23, 30570, Haverdal",
      contact: null,
      retention: null,
      legalBasis: null,
    });
    expect(isPrivacyInformationComplete(info)).toBe(false);
  });

  it("accepts postal contact without requiring an email when legal fields are supplied", () => {
    const info = resolveSiteInformation({
      VITE_PRIVACY_RETENTION: " Test retention ",
      VITE_PRIVACY_LEGAL_BASIS: " Test basis ",
    });
    expect(info.retention).toBe("Test retention");
    expect(info.legalBasis).toBe("Test basis");
    expect(isPrivacyInformationComplete(info)).toBe(true);
  });

  it("does not inherit Boleo's address when the operator is overridden", () => {
    const info = resolveSiteInformation({ VITE_SITE_OPERATOR: " Other operator " });
    expect(info.operator).toBe("Other operator");
    expect(info.postalAddress).toBeNull();
    expect(isPrivacyInformationComplete(info)).toBe(false);
  });

  it("accepts and trims an explicitly configured operator, address and email", () => {
    const info = resolveSiteInformation({
      VITE_SITE_OPERATOR: " Other operator ",
      VITE_SITE_ADDRESS: " Test postal address ",
      VITE_SUPPORT_EMAIL: " support@example.com ",
    });
    expect(info.operator).toBe("Other operator");
    expect(info.postalAddress).toBe("Test postal address");
    expect(info.contact).toBe("support@example.com");
  });

  it("never treats a postal address as an email", () => {
    const info = resolveSiteInformation({ VITE_SUPPORT_EMAIL: "Morkullev\u00e4gen 23" });
    expect(info.contact).toBeNull();
    expect(info.postalAddress).toBe("Morkullev\u00e4gen 23, 30570, Haverdal");
  });

  it("requires a contact method and both legal fields", () => {
    const env = {
      VITE_SITE_OPERATOR: "Other operator",
      VITE_SUPPORT_EMAIL: "support@example.com",
      VITE_PRIVACY_RETENTION: "Test retention",
      VITE_PRIVACY_LEGAL_BASIS: "Test basis",
    };
    expect(isPrivacyInformationComplete(resolveSiteInformation(env))).toBe(true);
    for (const key of [
      "VITE_SUPPORT_EMAIL",
      "VITE_PRIVACY_RETENTION",
      "VITE_PRIVACY_LEGAL_BASIS",
    ] as const) {
      expect(isPrivacyInformationComplete(resolveSiteInformation({ ...env, [key]: " " }))).toBe(
        false,
      );
    }
  });
});
