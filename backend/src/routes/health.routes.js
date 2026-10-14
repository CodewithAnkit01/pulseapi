import { Router } from "express";
import prisma from "../config/database.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      success: true,
      message: "PulseAPI backend is healthy",
      data: {
        status: "ok",
        database: "connected",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;