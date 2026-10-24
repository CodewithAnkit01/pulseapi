
import { z } from "zod";

const safeHeadersSchema = z
  .record(z.string(), z.string())
  .refine(
    (headers) => {
      const blocked = new Set([
        "host",
        "content-length",
        "transfer-encoding",
        "connection",
        "proxy-authorization",
        "proxy-connection",
      ]);

      return Object.keys(headers).every(
        (name) => !blocked.has(name.toLowerCase()),
      );
    },
    { message: "One or more request headers are not allowed" },
  );

const monitorFields = {
  name: z.string().trim().min(2).max(100),
  url: z.string().trim().url().max(2048),
  method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]),
  headers: safeHeadersSchema.optional(),
  expectedStatusCodes: z
    .array(z.number().int().min(100).max(599))
    .min(1)
    .max(20),
  timeoutMs: z.number().int().min(1000).max(30000),
  intervalSeconds: z.number().int().min(30).max(86400),
  failureThreshold: z.number().int().min(1).max(20),
  recoveryThreshold: z.number().int().min(1).max(20),
  enabled: z.boolean(),
};

export const createMonitorSchema = z.object({
  name: monitorFields.name,
  url: monitorFields.url,
  method: monitorFields.method.optional().default("GET"),
  headers: monitorFields.headers,
  expectedStatusCodes: monitorFields.expectedStatusCodes
    .optional()
    .default([200]),
  timeoutMs: monitorFields.timeoutMs.optional().default(5000),
  intervalSeconds: monitorFields.intervalSeconds
    .optional()
    .default(60),
  failureThreshold: monitorFields.failureThreshold
    .optional()
    .default(3),
  recoveryThreshold: monitorFields.recoveryThreshold
    .optional()
    .default(2),
  enabled: monitorFields.enabled.optional().default(true),
});

export const updateMonitorSchema = z
  .object({
    name: monitorFields.name.optional(),
    url: monitorFields.url.optional(),
    method: monitorFields.method.optional(),
    headers: monitorFields.headers,
    expectedStatusCodes: monitorFields.expectedStatusCodes.optional(),
    timeoutMs: monitorFields.timeoutMs.optional(),
    intervalSeconds: monitorFields.intervalSeconds.optional(),
    failureThreshold: monitorFields.failureThreshold.optional(),
    recoveryThreshold: monitorFields.recoveryThreshold.optional(),
    enabled: monitorFields.enabled.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });
