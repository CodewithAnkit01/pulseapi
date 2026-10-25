import { z } from "zod";

export const monitorHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  period: z.enum(["24h", "7d", "30d"]).default("24h"),
});