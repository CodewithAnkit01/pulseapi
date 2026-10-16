import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const requireAuth = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "A valid access token is required",
      },
    });
  }

  const token = authorization.slice(7);

  try {
    const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET, {
      algorithms: ["HS256"],
    });

    if (typeof payload === "string" || !payload.sub) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_ACCESS_TOKEN",
          message: "Invalid access token",
        },
      });
    }

    req.user = {
      userId: payload.sub,
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_ACCESS_TOKEN",
        message: "Access token is invalid or expired",
      },
    });
  }
};