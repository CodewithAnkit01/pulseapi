
import {
  createMonitor,
  listMonitors,
  getMonitor,
  updateMonitor,
  deleteMonitor,
} from "./monitor.service.js";

import {
  createMonitorSchema,
  updateMonitorSchema,
} from "./monitor.validator.js";

import { validateMonitorUrl } from "../../utils/ssrf.js";

export const create = async (req, res, next) => {
  try {
    const data = createMonitorSchema.parse(req.body);

    data.url = await validateMonitorUrl(data.url);

    const monitor = await createMonitor(req.project.id, data);

    return res.status(201).json({
      success: true,
      data: { monitor },
    });
  } catch (error) {
    return next(error);
  }
};

export const list = async (req, res, next) => {
  try {
    const monitors = await listMonitors(req.project.id);

    return res.status(200).json({
      success: true,
      data: { monitors },
    });
  } catch (error) {
    return next(error);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const monitor = await getMonitor(
      req.project.id,
      req.params.monitorId,
    );

    if (!monitor) {
      return res.status(404).json({
        success: false,
        error: {
          code: "MONITOR_NOT_FOUND",
          message: "Monitor not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: { monitor },
    });
  } catch (error) {
    return next(error);
  }
};

export const update = async (req, res, next) => {
  try {
    const data = updateMonitorSchema.parse(req.body);

    if (data.url) {
      data.url = await validateMonitorUrl(data.url);
    }

    const result = await updateMonitor(
      req.project.id,
      req.params.monitorId,
      data,
    );

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "MONITOR_NOT_FOUND",
          message: "Monitor not found",
        },
      });
    }

    const monitor = await getMonitor(
      req.project.id,
      req.params.monitorId,
    );

    return res.status(200).json({
      success: true,
      data: { monitor },
    });
  } catch (error) {
    return next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    const result = await deleteMonitor(
      req.project.id,
      req.params.monitorId,
    );

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "MONITOR_NOT_FOUND",
          message: "Monitor not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Monitor deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};
