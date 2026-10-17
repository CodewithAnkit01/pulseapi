
import { Router } from "express";

import {
  create,
  listMine,
  getOne,
  update,
} from "./organization.controller.js";

import { requireAuth } from "../../middleware/auth.middleware.js";

import {
  loadOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware.js";

const router = Router();

// Create an organization. The creator becomes OWNER.
router.post("/", requireAuth, create);

// List organizations that belong to the authenticated user.
router.get("/", requireAuth, listMine);

// Organization details: any member can view.
router.get(
  "/:organizationId",
  requireAuth,
  loadOrganizationMembership,
  getOne,
);

// Only OWNER and ADMIN can update organization settings.
router.patch(
  "/:organizationId",
  requireAuth,
  loadOrganizationMembership,
  requireOrganizationRole("OWNER", "ADMIN"),
  update,
);

export default router;
