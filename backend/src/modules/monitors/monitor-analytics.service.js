
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
      status: true,
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

export async function getMonitorAnalytics({
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

  const successfulWhere = {
    ...where,
    outcome: "SUCCESS",
  };

  const [
    totalChecks,
    successfulChecks,
    responseTimeStats,
    outcomeGroups,
  ] = await Promise.all([
    prisma.checkResult.count({
      where,
    }),

    prisma.checkResult.count({
      where: successfulWhere,
    }),

    prisma.checkResult.aggregate({
      where: {
        ...successfulWhere,
        durationMs: {
          not: null,
        },
      },
      _avg: {
        durationMs: true,
      },
      _min: {
        durationMs: true,
      },
      _max: {
        durationMs: true,
      },
    }),

    prisma.checkResult.groupBy({
      by: ["outcome"],
      where,
      _count: {
        _all: true,
      },
    }),
  ]);

  const failedChecks = totalChecks - successfulChecks;

  const uptimePercentage =
    totalChecks === 0
      ? null
      : Number(
          ((successfulChecks / totalChecks) * 100).toFixed(2),
        );

  const checksByOutcome = {
    SUCCESS: 0,
    FAILURE: 0,
    TIMEOUT: 0,
    ERROR: 0,
  };

  for (const group of outcomeGroups) {
    checksByOutcome[group.outcome] = group._count._all;
  }

  return {
    monitor,
    period,
    range: {
      from,
      to,
    },
    checks: {
      total: totalChecks,
      successful: successfulChecks,
      failed: failedChecks,
      byOutcome: checksByOutcome,
    },
    uptimePercentage,
    responseTime: {
      averageMs:
        responseTimeStats._avg.durationMs === null
          ? null
          : Math.round(responseTimeStats._avg.durationMs),
      minimumMs: responseTimeStats._min.durationMs,
      maximumMs: responseTimeStats._max.durationMs,
    },
  };
}
