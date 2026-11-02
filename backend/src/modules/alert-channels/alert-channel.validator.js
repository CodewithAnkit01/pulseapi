
import { z } from "zod";

const destinationSchema = z.string().trim().min(1).max(2048);

export const createAlertChannelSchema = z
  .object({
    name: z.string().trim().min(2).max(100),

    type: z.enum(["EMAIL", "WEBHOOK"]),

    destination: destinationSchema,
  })
  .superRefine((data, ctx) => {
    if (data.type === "EMAIL") {
      if (!z.string().email().safeParse(data.destination).success) {
        ctx.addIssue({
          code: "custom",
          path: ["destination"],
          message: "A valid email address is required",
        });
      }
    }

    if (data.type === "WEBHOOK") {
      try {
        const url = new URL(data.destination);

        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password
        ) {
          throw new Error("Invalid webhook URL");
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["destination"],
          message: "A valid HTTPS webhook URL is required",
        });
      }
    }
  });

export const updateAlertChannelSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  destination: destinationSchema.optional(),
  enabled: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  {
    message: "At least one field is required",
  },
);

export const alertChannelIdSchema = z.object({
  alertChannelId: z.string().uuid(),
});
