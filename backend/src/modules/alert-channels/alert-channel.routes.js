
import { Router } from "express";

import {
  create,
  list,
  getOne,
  update,
  remove,
  attachToMonitor,
  detachFromMonitor,
} from "./alert-channel.controller.js";

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

const canManageAlertChannels = requireOrganizationRole(
  "OWNER",
  "ADMIN",
);

router.post(
  "/:organizationId/alert-channels",
  ...organizationAccess,
  canManageAlertChannels,
  create,
);

router.get(
  "/:organizationId/alert-channels",
  ...organizationAccess,
  list,
);

router.get(
  "/:organizationId/alert-channels/:alertChannelId",
  ...organizationAccess,
  getOne,
);

router.patch(
  "/:organizationId/alert-channels/:alertChannelId",
  ...organizationAccess,
  canManageAlertChannels,
  update,
);

router.delete(
  "/:organizationId/alert-channels/:alertChannelId",
  ...organizationAccess,
  canManageAlertChannels,
  remove,
);

router.post(
  "/:organizationId/monitors/:monitorId/alert-channels/:alertChannelId",
  ...organizationAccess,
  canManageAlertChannels,
  attachToMonitor,
);

router.delete(
  "/:organizationId/monitors/:monitorId/alert-channels/:alertChannelId",
  ...organizationAccess,
  canManageAlertChannels,
  detachFromMonitor,
);

export default router;
