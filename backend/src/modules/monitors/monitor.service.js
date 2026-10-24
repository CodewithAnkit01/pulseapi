
import prisma from "../../config/database.js";

const monitorSelect = {
  id: true,
  projectId: true,
  name: true,
  url: true,
  method: true,
  headers: true,
  expectedStatusCodes: true,
  timeoutMs: true,
  intervalSeconds: true,
  failureThreshold: true,
  recoveryThreshold: true,
  consecutiveFailures: true,
  consecutiveSuccesses: true,
  enabled: true,
  status: true,
  lastCheckedAt: true,
  nextCheckAt: true,
  createdAt: true,
  updatedAt: true,
};

export const createMonitor = (projectId, data) =>
  prisma.monitor.create({
    data: {
      ...data,
      projectId,
      status: data.enabled ? "UP" : "PAUSED",
    },
    select: monitorSelect,
  });

export const listMonitors = (projectId) =>
  prisma.monitor.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: monitorSelect,
  });

export const getMonitor = (projectId, monitorId) =>
  prisma.monitor.findFirst({
    where: { id: monitorId, projectId },
    select: monitorSelect,
  });

export const updateMonitor = (projectId, monitorId, data) => {
  const updateData = { ...data };

  if (typeof data.enabled === "boolean") {
    updateData.status = data.enabled ? "UP" : "PAUSED";
  }

  return prisma.monitor.updateMany({
    where: { id: monitorId, projectId },
    data: updateData,
  });
};

export const deleteMonitor = (projectId, monitorId) =>
  prisma.monitor.deleteMany({
    where: { id: monitorId, projectId },
  });
