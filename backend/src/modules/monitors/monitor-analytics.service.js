
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

function getBucketStart(date, period) {
  const bucket = new Date(date);

  if (period === "24h") {
    bucket.setUTCMinutes(0, 0, 0);
  } else {
    bucket.setUTCHours(0, 0, 0, 0);
  }

  return bucket;
}

async function getMonitorTimeSeries({
  monitorId,
  period,
  from,
  to,
}) {
  const unit = period === "24h" ? "hour" : "day";

  const rows = await prisma.$queryRaw`
    SELECT
      date_trunc(${unit}, "checkedAt") AS bucket,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE "outcome" = 'SUCCESS'
      )::int AS successful,
      COUNT(*) FILTER (
        WHERE "outcome" <> 'SUCCESS'
      )::int AS failed,
      ROUND(
        AVG("durationMs") FILTER (
          WHERE "outcome" = 'SUCCESS'
            AND "durationMs" IS NOT NULL
        )
      )::int AS "averageResponseTimeMs"
    FROM "CheckResult"
    WHERE "monitorId" = ${monitorId}
      AND "checkedAt" >= ${from}
      AND "checkedAt" <= ${to}
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  const rowMap = new Map(
    rows.map((row) => [
      new Date(row.bucket).toISOString(),
      row,
    ]),
  );

  const bucketMs =
    period === "24h"
      ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

  const firstBucket = getBucketStart(from, period);
  const lastBucket = getBucketStart(to, period);
  const timeSeries = [];

  for (
    let timestamp = firstBucket.getTime();
    timestamp <= lastBucket.getTime();
    timestamp += bucketMs
  ) {
    const bucketDate = new Date(timestamp);
    const key = bucketDate.toISOString();
    const row = rowMap.get(key);

    timeSeries.push({
      timestamp: key,
      total: row?.total ?? 0,
      successful: row?.successful ?? 0,
      failed: row?.failed ?? 0,
      averageResponseTimeMs:
        row?.averageResponseTimeMs == null
          ? null
          : Number(row.averageResponseTimeMs),
    });
  }

  return timeSeries;
}

export async function getMonitorAnalytics({
  projectId,
  monitorId,
  period,
}) {
  if (!Object.hasOwn(PERIODS, period)) {
    throw Object.assign(new Error("Invalid analytics period"), {
      statusCode: 400,
      code: "INVALID_PERIOD",
    });
  }

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
    timeSeries,
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

    getMonitorTimeSeries({
      monitorId: monitor.id,
      period,
      from,
      to,
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
    timeSeries,
  };
}
