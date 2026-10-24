
import { Router } from "express";

import {
  create,
  list,
  getOne,
  update,
  remove,
} from "./monitor.controller.js";

import { requireAuth } from "../../middleware/auth.middleware.js";

import {
  loadProjectAccess,
  requireProjectRole,
} from "../../middleware/project.middleware.js";

const router = Router();

const projectAccess = [
  requireAuth,
  loadProjectAccess,
];

const canManageMonitors = requireProjectRole(
  "OWNER",
  "ADMIN",
  "MEMBER",
);

router.post(
  "/:projectId/monitors",
  ...projectAccess,
  canManageMonitors,
  create,
);

router.get(
  "/:projectId/monitors",
  ...projectAccess,
  list,
);

router.get(
  "/:projectId/monitors/:monitorId",
  ...projectAccess,
  getOne,
);

router.patch(
  "/:projectId/monitors/:monitorId",
  ...projectAccess,
  canManageMonitors,
  update,
);

router.delete(
  "/:projectId/monitors/:monitorId",
  ...projectAccess,
  canManageMonitors,
  remove,
);

export default router;
