import { monitorHistoryQuerySchema } from "./monitor-history.validator.js";

import {
  getMonitorCheckHistory as fetchMonitorCheckHistory,
  getMonitorUptime as fetchMonitorUptime,
} from "./monitor-history.service.js";

export const getMonitorCheckHistory = async (req, res, next) => {
  const parsed = monitorHistoryQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid history query parameters",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    const data = await fetchMonitorCheckHistory({
      projectId: req.params.projectId,
      monitorId: req.params.monitorId,
      ...parsed.data,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getMonitorUptime = async (req, res, next) => {
  const parsed = monitorHistoryQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid uptime query parameters",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    const data = await fetchMonitorUptime({
      projectId: req.params.projectId,
      monitorId: req.params.monitorId,
      period: parsed.data.period,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};