import { z } from "zod";
import {
  safeAiObservation,
  type AiCallObservation,
} from "../../supabase/functions/_shared/aiObservation";

export const liveQualityIds = [
  "LIVE-01",
  "LIVE-02",
  "LIVE-03",
  "LIVE-04",
  "LIVE-05",
  "LIVE-06",
  "LIVE-07",
  "LIVE-08",
] as const;
export type LiveQualityId = (typeof liveQualityIds)[number];
const actions = [
  "analyze-wine",
  "analyze-wine",
  "chef-generate",
  "chef-adapt",
  "chef-chat",
  "ask-winesnap",
  "wine-suggestions",
  "chef-extract",
] as const;
export const qualityAction = (id: LiveQualityId) => actions[liveQualityIds.indexOf(id)];
const observation = z
  .object({
    selectedModel: z.string().nullable(),
    returnedModel: z.string().nullable(),
    providerStatus: z.number().nullable(),
    outcome: z.enum(["http_ok", "http_error", "timeout", "cancelled", "network_error"]),
    durationMs: z.number().nullable(),
    attempts: z.number().nullable(),
    inputTokens: z.number().nullable(),
    outputTokens: z.number().nullable(),
  })
  .strict()
  .transform((value) => safeAiObservation(value as AiCallObservation));
export const liveQualityCaseSchema = z
  .object({
    id: z.enum(liveQualityIds),
    passed: z.boolean(),
    outboundAttempts: z.number().int().min(0).max(1),
    routeStatus: z.number().int().min(200).max(599).nullable(),
    durationMs: z.number().int().min(0).max(3_600_000),
    failureKind: z.enum([
      "none",
      "pending",
      "http_error",
      "content_gate",
      "request_blocked",
      "unexpected_failure",
    ]),
    observation: observation.nullable(),
  })
  .strict();
export type LiveQualityCase = z.infer<typeof liveQualityCaseSchema>;
export const liveQualityReportSchema = z
  .object({
    suite: z.literal("winesnap-ai-quality-live-v1"),
    project: z.literal("winesnap-owned-local"),
    completed: z.boolean(),
    finished: z.boolean(),
    cleanupCompleted: z.boolean(),
    backendVerified: z.boolean().nullable(),
    productionTouched: z.literal(false),
    configurationChanged: z.literal(false),
    realAccountsChanged: z.literal(false),
    liveProvider: z.literal(true),
    sourceHandlers: z.literal(true),
    browserVerified: z.literal(false),
    semanticQualityVerified: z.literal(false),
    medicalSafetyCertified: z.literal(false),
    cases: z
      .array(liveQualityCaseSchema)
      .max(8)
      .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length),
    failure: z.enum(["none", "owned_ai_quality_incomplete"]),
    checkedAt: z.string().datetime(),
  })
  .strict();
export type LiveQualityReport = z.infer<typeof liveQualityReportSchema>;
export function freshQualityCase(id: LiveQualityId): LiveQualityCase {
  return {
    id,
    passed: false,
    outboundAttempts: 0,
    routeStatus: null,
    durationMs: 0,
    failureKind: "pending",
    observation: null,
  };
}
export function maySendQualityCase(value: LiveQualityCase) {
  return liveQualityCaseSchema.parse(value).outboundAttempts === 0;
}
