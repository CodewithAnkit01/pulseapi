
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
} from "./project.service.js";

import {
  createProjectSchema,
  updateProjectSchema,
} from "./project.validator.js";

export const create = async (req, res, next) => {
  try {
    const data = createProjectSchema.parse(req.body);

    const project = await createProject(
      req.params.organizationId,
      data,
    );

    return res.status(201).json({
      success: true,
      data: { project },
    });
  } catch (error) {
    if (error.code === "P2002") {
      error.statusCode = 409;
      error.code = "PROJECT_NAME_EXISTS";
      error.message = "A project with this name already exists";
    }

    return next(error);
  }
};

export const list = async (req, res, next) => {
  try {
    const projects = await listProjects(
      req.params.organizationId,
    );

    return res.status(200).json({
      success: true,
      data: { projects },
    });
  } catch (error) {
    return next(error);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const project = await getProject(
      req.params.organizationId,
      req.params.projectId,
    );

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: "Project not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: { project },
    });
  } catch (error) {
    return next(error);
  }
};

export const update = async (req, res, next) => {
  try {
    const data = updateProjectSchema.parse(req.body);

    const result = await updateProject(
      req.params.organizationId,
      req.params.projectId,
      data,
    );

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: "Project not found",
        },
      });
    }

    const project = await getProject(
      req.params.organizationId,
      req.params.projectId,
    );

    return res.status(200).json({
      success: true,
      data: { project },
    });
  } catch (error) {
    if (error.code === "P2002") {
      error.statusCode = 409;
      error.code = "PROJECT_NAME_EXISTS";
      error.message = "A project with this name already exists";
    }

    return next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    const result = await deleteProject(
      req.params.organizationId,
      req.params.projectId,
    );

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: "Project not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
