export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
};


export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Invalid JSON in the request body.
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Request body contains invalid JSON",
      },
    });
  }

  // Request body exceeds express.json() limit.
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body exceeds the allowed size",
      },
    });
  }

  // Zod validation failures.
  if (err.name === "ZodError") {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    // Log the internal error on the server, not in the response.
    console.error(err);
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      code:
        statusCode >= 500
          ? "INTERNAL_SERVER_ERROR"
          : err.code || "REQUEST_ERROR",
      message:
        statusCode >= 500
          ? "An unexpected server error occurred"
          : err.message,
    },
  });
};
