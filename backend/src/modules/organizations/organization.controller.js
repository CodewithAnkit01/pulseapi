
import {
  createOrganization,
  listUserOrganizations,
  updateOrganization,
} from "./organization.service.js";

import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "./organization.validator.js";

export const create = async (req, res, next) => {
  try {
    const data = createOrganizationSchema.parse(req.body);

    const result = await createOrganization(
      req.user.userId,
      data,
    );

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.code === "P2002") {
      error.statusCode = 409;
      error.code = "ORGANIZATION_SLUG_EXISTS";
      error.message = "An organization with this slug already exists";
    }

    return next(error);
  }
};

export const listMine = async (req, res, next) => {
  try {
    const organizations = await listUserOrganizations(
      req.user.userId,
    );

    return res.status(200).json({
      success: true,
      data: { organizations },
    });
  } catch (error) {
    return next(error);
  }
};

export const getOne = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        organization: req.organization,
        membership: {
          role: req.organizationMembership.role,
          joinedAt: req.organizationMembership.createdAt,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const update = async (req, res, next) => {
  try {
    const data = updateOrganizationSchema.parse(req.body);

    const organization = await updateOrganization(
      req.organization.id,
      data,
    );

    return res.status(200).json({
      success: true,
      data: { organization },
    });
  } catch (error) {
    if (error.code === "P2002") {
      error.statusCode = 409;
      error.code = "ORGANIZATION_SLUG_EXISTS";
      error.message = "An organization with this slug already exists";
    }

    return next(error);
  }
};
