import { Router } from "express";

import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
} from "./auth.controller.js";
import {
  authLimiter,
  refreshLimiter,
} from "../../middleware/rate-limit.middleware.js";

import {
  validateRequestOrigin,
} from "../../middleware/security.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

const router = Router();


router.post(
  "/register",
  validateRequestOrigin,
  authLimiter,
  register,
);

router.post(
  "/login",
  validateRequestOrigin,
  authLimiter,
  login,
);

router.post(
  "/refresh",
  validateRequestOrigin,
  refreshLimiter,
  refresh,
);

router.post(
  "/logout",
  validateRequestOrigin,
  logout,
);

router.get("/me", requireAuth, me);

router.post(
  "/logout-all",
  validateRequestOrigin,
  requireAuth,
  logoutAll,
);


export default router;