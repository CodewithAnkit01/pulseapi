
import { z } from "zod";
import prisma from "../config/database.js";

export const loadProjectAccess = async (req, res, next) => {
  try {
    // Step 1: Read projectId BEFORE using it.
    const { projectId } = req.params;

    // Step 2: Validate the UUID.
    const parsedId = z.string().uuid().safeParse(projectId);

    if (!parsedId.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_PROJECT_ID",
          message: "Project ID must be a valid UUID",
        },
      });
    }

    // Step 3: Find the project.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        description: true,
        environment: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: "Project not found",
        },
      });
    }

    // Step 4: Verify organization membership.
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.userId,
          organizationId: project.organizationId,
        },
      },
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: "Project not found",
        },
      });
    }

    // Step 5: Make verified data available to later middleware.
    req.project = project;
    req.organizationMembership = membership;

    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireProjectRole = (...allowedRoles) => {
  return (req, res, next) => {
    const membership = req.organizationMembership;

    if (!membership) {
      return res.status(500).json({
        success: false,
        error: {
          code: "PROJECT_MIDDLEWARE_MISSING",
          message: "Project access must be checked first",
        },
      });
    }

    if (!allowedRoles.includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "INSUFFICIENT_ORGANIZATION_ROLE",
          message: "You do not have permission to perform this action",
        },
      });
    }

    return next();
  };
};
