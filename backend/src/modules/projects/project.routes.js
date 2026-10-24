
import { Router } from "express";

import {
  create,
  list,
  getOne,
  update,
  remove,
} from "./project.controller.js";

import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  loadOrganizationMembership,
  requireOrganizationRole,
} from "../../middleware/organization.middleware.js";

const router = Router();

const organizationAccess = [
  requireAuth,
  loadOrganizationMembership,
];

const canManageProjects = requireOrganizationRole(
  "OWNER",
  "ADMIN",
  "MEMBER",
);

router.post(
  "/:organizationId/projects",
  ...organizationAccess,
  canManageProjects,
  create,
);

router.get(
  "/:organizationId/projects",
  ...organizationAccess,
  list,
);

router.get(
  "/:organizationId/projects/:projectId",
  ...organizationAccess,
  getOne,
);

router.patch(
  "/:organizationId/projects/:projectId",
  ...organizationAccess,
  canManageProjects,
  update,
);

router.delete(
  "/:organizationId/projects/:projectId",
  ...organizationAccess,
  canManageProjects,
  remove,
);

export default router;
