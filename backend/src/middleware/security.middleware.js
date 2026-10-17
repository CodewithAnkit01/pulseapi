
import { env } from "../config/env.js";

export const validateRequestOrigin = (req, res, next) => {
  const origin = req.get("origin");

  // Allow clients such as Postman that do not send Origin.
  // Browser requests that do send Origin must match our frontend.
  if (origin && origin !== env.FRONTEND_URL) {
    return res.status(403).json({
      success: false,
      error: {
        code: "UNTRUSTED_ORIGIN",
        message: "Requests from this origin are not allowed",
      },
    });
  }

  return next();
};
