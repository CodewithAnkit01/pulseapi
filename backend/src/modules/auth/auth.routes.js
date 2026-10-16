import { Router } from "express";

import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
} from "./auth.controller.js";

import { requireAuth } from "../../middleware/auth.middleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);

router.get("/me", requireAuth, me);
router.post("/logout-all", requireAuth, logoutAll);

export default router;