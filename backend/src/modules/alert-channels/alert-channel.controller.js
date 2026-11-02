
import {
  createAlertChannel,
  listAlertChannels,
  getAlertChannel,
  updateAlertChannel,
  deleteAlertChannel,
  attachAlertChannelToMonitor,
  detachAlertChannelFromMonitor,
} from "./alert-channel.service.js";

import {
  createAlertChannelSchema,
  updateAlertChannelSchema,
} from "./alert-channel.validator.js";

export const create = async (req, res, next) => {
  try {
    const data = createAlertChannelSchema.parse(req.body);

    const alertChannel = await createAlertChannel(
      req.params.organizationId,
      data,
    );

    return res.status(201).json({
      success: true,
      data: { alertChannel },
    });
  } catch (error) {
    return next(error);
  }
};

export const list = async (req, res, next) => {
  try {
    const alertChannels = await listAlertChannels(
      req.params.organizationId,
    );

    return res.status(200).json({
      success: true,
      data: { alertChannels },
    });
  } catch (error) {
    return next(error);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const alertChannel = await getAlertChannel(
      req.params.organizationId,
      req.params.alertChannelId,
    );

    if (!alertChannel) {
      return res.status(404).json({
        success: false,
        error: {
          code: "ALERT_CHANNEL_NOT_FOUND",
          message: "Alert channel not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: { alertChannel },
    });
  } catch (error) {
    return next(error);
  }
};

export const update = async (req, res, next) => {
  try {
    const data = updateAlertChannelSchema.parse(req.body);

    const result = await updateAlertChannel(
      req.params.organizationId,
      req.params.alertChannelId,
      data,
    );

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "ALERT_CHANNEL_NOT_FOUND",
          message: "Alert channel not found",
        },
      });
    }

    const alertChannel = await getAlertChannel(
      req.params.organizationId,
      req.params.alertChannelId,
    );

    return res.status(200).json({
      success: true,
      data: { alertChannel },
    });
  } catch (error) {
    return next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    const result = await deleteAlertChannel(
      req.params.organizationId,
      req.params.alertChannelId,
    );

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "ALERT_CHANNEL_NOT_FOUND",
          message: "Alert channel not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Alert channel deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};

export const attachToMonitor = async (req, res, next) => {
  try {
    const result = await attachAlertChannelToMonitor({
      organizationId: req.params.organizationId,
      monitorId: req.params.monitorId,
      alertChannelId: req.params.alertChannelId,
    });

    return res.status(201).json({
      success: true,
      data: { attachment: result },
    });
  } catch (error) {
    if (error.code === "P2002") {
      error.statusCode = 409;
      error.code = "ALERT_CHANNEL_ALREADY_ATTACHED";
      error.message = "Alert channel is already attached to this monitor";
    }

    return next(error);
  }
};

export const detachFromMonitor = async (req, res, next) => {
  try {
    const result = await detachAlertChannelFromMonitor({
      organizationId: req.params.organizationId,
      monitorId: req.params.monitorId,
      alertChannelId: req.params.alertChannelId,
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: "ATTACHMENT_NOT_FOUND",
          message: "Alert channel is not attached to this monitor",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Alert channel detached successfully",
    });
  } catch (error) {
    return next(error);
  }
};
