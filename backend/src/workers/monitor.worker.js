
import { Worker } from "bullmq";
import prisma from "../config/database.js";
import redisConnection from "../config/redis.js";
import { performHttpCheck } from "../utils/http-check.js";
import {
  openIncidentIfNeeded,
  resolveOpenIncidentIfNeeded,
} from "../modules/incidents/incident.service.js";

const worker = new Worker(
  "monitor-checks",
  async (job) => {
    if (job.name !== "check-monitor") {
      throw new Error(`Unknown monitor job: ${job.name}`);
    }

    const { monitorId } = job.data;

    if (!monitorId) {
      throw new Error("Missing monitorId in job data");
    }

    const monitor = await prisma.monitor.findUnique({
      where: { id: monitorId },
    });

    if (!monitor || !monitor.enabled) {
      console.log(
        `[Monitor Worker] Skipping disabled/missing monitor ${monitorId}`,
      );

      return { skipped: true };
    }

    // Perform the HTTP check outside the database transaction.
    const result = await performHttpCheck(monitor);
    const checkedAt = new Date();

    const transactionResult = await prisma.$transaction(
      async (tx) => {
        // Lock the monitor row to serialize concurrent checks
        // for this monitor.
        const lockedRows = await tx.$queryRaw`
          SELECT "id"
          FROM "Monitor"
          WHERE "id" = ${monitorId}
          FOR UPDATE
        `;

        if (lockedRows.length === 0) {
          return { skipped: true };
        }

        // Re-read after acquiring the lock so counters and status
        // are based on the latest committed monitor state.
        const current = await tx.monitor.findUnique({
          where: { id: monitorId },
        });

        if (!current) {
          return { skipped: true };
        }

        // Save every completed HTTP check.
        await tx.checkResult.create({
          data: {
            monitorId,
            outcome: result.outcome,
            statusCode: result.statusCode,
            durationMs: result.durationMs,
            errorType: result.errorType,
            errorMessage: result.errorMessage,
            checkedAt,
          },
        });

        // A monitor may have been disabled while the HTTP request
        // was running. Keep it paused and don't change its incidents.
        if (!current.enabled) {
          await tx.monitor.update({
            where: { id: monitorId },
            data: {
              status: "PAUSED",
              consecutiveFailures: 0,
              consecutiveSuccesses: 0,
              lastCheckedAt: checkedAt,
            },
          });

          return {
            monitorId,
            outcome: result.outcome,
            status: "PAUSED",
            skippedIncidentProcessing: true,
          };
        }

        const successful = result.outcome === "SUCCESS";

        const consecutiveFailures = successful
          ? 0
          : current.consecutiveFailures + 1;

        const consecutiveSuccesses = successful
          ? current.consecutiveSuccesses + 1
          : 0;

        let status = current.status;

        if (successful) {
          if (
            current.status !== "DOWN" ||
            consecutiveSuccesses >= current.recoveryThreshold
          ) {
            status = "UP";
          }
        } else if (
          consecutiveFailures >= current.failureThreshold
        ) {
          status = "DOWN";
        }

        // Update monitor status and counters first.
        await tx.monitor.update({
          where: { id: monitorId },
          data: {
            status,
            consecutiveFailures,
            consecutiveSuccesses,
            lastCheckedAt: checkedAt,
            nextCheckAt: new Date(
              checkedAt.getTime() +
                current.intervalSeconds * 1000,
            ),
          },
        });

        // Create one incident when the failure threshold is reached.
        if (
          !successful &&
          consecutiveFailures >= current.failureThreshold
        ) {
          await openIncidentIfNeeded(
            tx,
            current,
            result,
            checkedAt,
          );
        }

        // Resolve the existing incident only when recovery
        // actually changes the monitor from DOWN to UP.
        if (
          current.status === "DOWN" &&
          status === "UP"
        ) {
          await resolveOpenIncidentIfNeeded(
            tx,
            current,
            checkedAt,
          );
        }

        return {
          monitorId,
          outcome: result.outcome,
          status,
          consecutiveFailures,
          consecutiveSuccesses,
        };
      },
      {
        maxWait: 5000,
        timeout: 15000,
      },
    );

    console.log("[Monitor Worker] Result:", {
      name: monitor.name,
      outcome: result.outcome,
      statusCode: result.statusCode,
      errorType: result.errorType,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
      monitorStatus: transactionResult.status,
    });

    return {
      monitorId,
      outcome: result.outcome,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
      ...transactionResult,
    };
  },
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

worker.on("completed", (job) => {
  console.log(
    `[Monitor Worker] Job ${job.id} completed`,
  );
});

worker.on("failed", (job, error) => {
  console.error(
    `[Monitor Worker] Job ${job?.id} failed:`,
    error.message,
  );
});

worker.on("error", (error) => {
  console.error(
    "[Monitor Worker] Worker error:",
    error.message,
  );
});

console.log(
  "[Monitor Worker] Listening for monitor checks...",
);

async function shutdown() {
  console.log("[Monitor Worker] Shutting down...");

  await worker.close();
  await prisma.$disconnect();

  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
