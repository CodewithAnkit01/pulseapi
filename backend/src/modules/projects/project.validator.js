
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  environment: z.enum([
    "development",
    "staging",
    "production",
  ]).default("production"),
});

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    environment: z.enum([
      "development",
      "staging",
      "production",
    ]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const projectIdSchema = z.object({
  projectId: z.string().uuid(),
});
