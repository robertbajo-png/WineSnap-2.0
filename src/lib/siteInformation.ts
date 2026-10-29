import { z } from "zod";

type SiteEnvironment = {
  VITE_SITE_OPERATOR?: string;
  VITE_SITE_ADDRESS?: string;
  VITE_SUPPORT_EMAIL?: string;
  VITE_PRIVACY_RETENTION?: string;
  VITE_PRIVACY_LEGAL_BASIS?: string;
};

const approvedOperator = "Boleo AI";
const approvedPostalAddress = "Morkullev\u00e4gen 23, 30570, Haverdal";

export function resolveSiteInformation(env: SiteEnvironment) {
  const operator = env.VITE_SITE_OPERATOR?.trim() || approvedOperator;
  const email = z.string().email().safeParse(env.VITE_SUPPORT_EMAIL?.trim());
  return {
    operator,
    contact: email.success ? email.data : null,
    // A different operator must provide its own public postal address.
    postalAddress:
      env.VITE_SITE_ADDRESS?.trim() ||
      (operator === approvedOperator ? approvedPostalAddress : null),
    retention: env.VITE_PRIVACY_RETENTION?.trim() || null,
    legalBasis: env.VITE_PRIVACY_LEGAL_BASIS?.trim() || null,
  };
}

export function isPrivacyInformationComplete(info: ReturnType<typeof resolveSiteInformation>) {
  return Boolean(
    info.operator && (info.contact || info.postalAddress) && info.retention && info.legalBasis,
  );
}

export function isPrivacyInformationVerified(
  info: ReturnType<typeof resolveSiteInformation>,
  operationsVerified: string | undefined,
  suppliersVerified: string | undefined,
) {
  return (
    isPrivacyInformationComplete(info) &&
    operationsVerified === "true" &&
    suppliersVerified === "true"
  );
}

export const siteInformation = resolveSiteInformation({
  VITE_SITE_OPERATOR: import.meta.env.VITE_SITE_OPERATOR,
  VITE_SITE_ADDRESS: import.meta.env.VITE_SITE_ADDRESS,
  VITE_SUPPORT_EMAIL: import.meta.env.VITE_SUPPORT_EMAIL,
  VITE_PRIVACY_RETENTION: import.meta.env.VITE_PRIVACY_RETENTION,
  VITE_PRIVACY_LEGAL_BASIS: import.meta.env.VITE_PRIVACY_LEGAL_BASIS,
});
// Text fields alone are not proof that deletion, scheduling or vendor settings work.
export const privacyInformationComplete = isPrivacyInformationVerified(
  siteInformation,
  import.meta.env.VITE_PRIVACY_OPERATIONS_VERIFIED,
  import.meta.env.VITE_PRIVACY_SUPPLIERS_VERIFIED,
);
