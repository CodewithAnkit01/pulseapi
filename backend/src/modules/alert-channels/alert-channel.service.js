
import prisma from "../../config/database.js";

const alertChannelSelect = {
  id: true,
  organizationId: true,
  name: true,
  type: true,
  destination: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
};

export const createAlertChannel = (organizationId, data) =>
  prisma.alertChannel.create({
    data: {
      organizationId,
      name: data.name,
      type: data.type,
      destination: data.destination,
    },
    select: alertChannelSelect,
  });

export const listAlertChannels = (organizationId) =>
  prisma.alertChannel.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: alertChannelSelect,
  });

export const getAlertChannel = (organizationId, alertChannelId) =>
  prisma.alertChannel.findFirst({
    where: {
      id: alertChannelId,
      organizationId,
    },
    select: alertChannelSelect,
  });

export const updateAlertChannel = (
  organizationId,
  alertChannelId,
  data,
) =>
  prisma.alertChannel.updateMany({
    where: {
      id: alertChannelId,
      organizationId,
    },
    data,
  });

export const deleteAlertChannel = (
  organizationId,
  alertChannelId,
) =>
  prisma.alertChannel.deleteMany({
    where: {
      id: alertChannelId,
      organizationId,
    },
  });


export async function attachAlertChannelToMonitor({
  organizationId,
  monitorId,
  alertChannelId,
}) {
  // 1. Verify monitor and alert channel in parallel
  const [monitor, alertChannel] = await Promise.all([
    prisma.monitor.findFirst({
      where: {
        id: monitorId,
        project: {
          organizationId,
        },
      },
      select: { id: true },
    }),

    prisma.alertChannel.findFirst({
      where: {
        id: alertChannelId,
        organizationId,
        enabled: true,
      },
      select: { id: true },
    }),
  ]);

  // 2. Validate monitor
  if (!monitor) {
    const error = new Error("Monitor not found in this organization");
    error.statusCode = 404;
    error.code = "MONITOR_NOT_FOUND";
    throw error;
  }

  // 3. Validate alert channel
  if (!alertChannel) {
    const error = new Error(
      "Enabled alert channel not found in this organization",
    );
    error.statusCode = 404;
    error.code = "ALERT_CHANNEL_NOT_FOUND";
    throw error;
  }

  // 4. Attach channel (idempotent)
  return prisma.monitorAlertChannel.upsert({
    where: {
      monitorId_alertChannelId: {
        monitorId,
        alertChannelId,
      },
    },
    update: {},
    create: {
      monitorId,
      alertChannelId,
    },
    select: {
      monitorId: true,
      alertChannelId: true,
      createdAt: true,
    },
  });
}


export async function detachAlertChannelFromMonitor({
  organizationId,
  monitorId,
  alertChannelId,
}) {
  const result = await prisma.monitorAlertChannel.deleteMany({
    where: {
      monitorId,
      alertChannelId,
      monitor: {
        project: {
          organizationId,
        },
      },
      alertChannel: {
        organizationId,
      },
    },
  });

  return result;
}
