import prisma from "../../config/database.js";

const PERIODS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

async function findMonitor(projectId, monitorId) {
  const monitor = await prisma.monitor.findFirst({
    where: {
      id: monitorId,
      projectId,
    },
    select: {
      id: true,
      name: true,
      intervalSeconds: true,
    },
  });

  if (!monitor) {
    throw Object.assign(new Error("Monitor not found"), {
      statusCode: 404,
      code: "MONITOR_NOT_FOUND",
    });
  }

  return monitor;
}

function getPeriodRange(period) {
  const to = new Date();
  const from = new Date(to.getTime() - PERIODS[period]);

  return { from, to };
}

export async function getMonitorCheckHistory({
  projectId,
  monitorId,
  page,
  limit,
  period,
}) {
  const monitor = await findMonitor(projectId, monitorId);
  const { from, to } = getPeriodRange(period);

  const where = {
    monitorId: monitor.id,
    checkedAt: {
      gte: from,
      lte: to,
    },
  };

  const [checks, total] = await Promise.all([
    prisma.checkResult.findMany({
      where,
      orderBy: {
        checkedAt: "desc",
      },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        outcome: true,
        statusCode: true,
        durationMs: true,
        errorType: true,
        errorMessage: true,
        checkedAt: true,
      },
    }),
    prisma.checkResult.count({ where }),
  ]);

  return {
    monitor,
    period,
    from,
    to,
    checks,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getMonitorUptime({
  projectId,
  monitorId,
  period,
}) {
  const monitor = await findMonitor(projectId, monitorId);
  const { from, to } = getPeriodRange(period);

  const where = {
    monitorId: monitor.id,
    checkedAt: {
      gte: from,
      lte: to,
    },
  };

  const [totalChecks, successfulChecks, responseTime] =
    await Promise.all([
      prisma.checkResult.count({ where }),

      prisma.checkResult.count({
        where: {
          ...where,
          outcome: "SUCCESS",
        },
      }),

      prisma.checkResult.aggregate({
        where: {
          ...where,
          outcome: "SUCCESS",
        },
        _avg: {
          durationMs: true,
        },
      }),
    ]);

  const failedChecks = totalChecks - successfulChecks;

  const uptimePercentage =
    totalChecks === 0
      ? null
      : Number(
          ((successfulChecks / totalChecks) * 100).toFixed(2)
        );

  return {
    monitor,
    period,
    from,
    to,
    totalChecks,
    successfulChecks,
    failedChecks,
    uptimePercentage,
    averageResponseTimeMs:
      responseTime._avg.durationMs === null
        ? null
        : Math.round(responseTime._avg.durationMs),
  };
}