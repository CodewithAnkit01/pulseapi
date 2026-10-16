
import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain lowercase letters, numbers, and single hyphens",
    ),
  description: z.string().trim().max(500).optional(),
});

export const organizationIdSchema = z.object({
  organizationId: z.string().uuid(),
});
