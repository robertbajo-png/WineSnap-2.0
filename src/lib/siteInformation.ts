import { z } from "zod";
export const siteInformation = {
  operator: import.meta.env.VITE_SITE_OPERATOR?.trim() || null,
  contact: z
    .string()
    .email()
    .safeParse(import.meta.env.VITE_SUPPORT_EMAIL).success
    ? import.meta.env.VITE_SUPPORT_EMAIL
    : null,
  retention: import.meta.env.VITE_PRIVACY_RETENTION?.trim() || null,
  legalBasis: import.meta.env.VITE_PRIVACY_LEGAL_BASIS?.trim() || null,
};
export const privacyInformationComplete = Object.values(siteInformation).every(Boolean);
