import { invokeAi } from "./aiTransport";

export const analyzeWine = (body: Record<string, unknown>) => invokeAi("analyze-wine", body);
