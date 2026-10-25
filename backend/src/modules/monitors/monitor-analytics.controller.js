
import { monitorAnalyticsQuerySchema } from "./monitor-analytics.validator.js";

import {
  getMonitorAnalytics as fetchMonitorAnalytics,
} from "./monitor-analytics.service.js";

export const getMonitorAnalytics = async (req, res, next) => {
  const parsed = monitorAnalyticsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid analytics query parameters",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    const data = await fetchMonitorAnalytics({
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
