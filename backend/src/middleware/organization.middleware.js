
import prisma from "../config/database.js";

export const loadOrganizationMembership = async (
  req,
  res,
  next,
) => {
  try {
    const { organizationId } = req.params;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.userId,
          organizationId,
        },
      },
      include: {
        organization: true,
      },
    });

    // Do not reveal whether an organization exists
    // if the current user is not a member.
    if (!membership) {
      return res.status(404).json({
        success: false,
        error: {
          code: "ORGANIZATION_NOT_FOUND",
          message: "Organization not found",
        },
      });
    }

    req.organizationMembership = membership;
    req.organization = membership.organization;

    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireOrganizationRole = (...allowedRoles) => {
  return (req, res, next) => {
    const membership = req.organizationMembership;

    if (!membership) {
      return res.status(500).json({
        success: false,
        error: {
          code: "ORGANIZATION_MIDDLEWARE_MISSING",
          message: "Organization membership must be loaded first",
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
