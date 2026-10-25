import { Worker } from "bullmq";
import prisma from "../config/database.js";
import redisConnection from "../config/redis.js";
import { performHttpCheck } from "../utils/http-check.js";

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
      console.log(`[Monitor Worker] Skipping disabled/missing monitor ${monitorId}`);
      return { skipped: true };
    }

    // Make the HTTP request and classify its result.
    const result = await performHttpCheck(monitor);
    const checkedAt = new Date();

    await prisma.$transaction(async (tx) => {
      // Re-read the monitor in case it was changed during the request.
      const current = await tx.monitor.findUnique({
        where: { id: monitorId },
      });

      if (!current) {
        return;
      }

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

      // A monitor might have been disabled while the request was running.
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

        return;
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

      await tx.monitor.update({
        where: { id: monitorId },
        data: {
          status,
          consecutiveFailures,
          consecutiveSuccesses,
          lastCheckedAt: checkedAt,
          nextCheckAt: new Date(
            checkedAt.getTime() + current.intervalSeconds * 1000
          ),
        },
      });
    });

  console.log("[Monitor Worker] Result:", {
  name: monitor.name,
  outcome: result.outcome,
  statusCode: result.statusCode,
  errorType: result.errorType,
  errorMessage: result.errorMessage,
  durationMs: result.durationMs,
});

    return {
      monitorId,
      outcome: result.outcome,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
    };
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(`[Monitor Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(
    `[Monitor Worker] Job ${job?.id} failed:`,
    error.message
  );
});

worker.on("error", (error) => {
  console.error("[Monitor Worker] Worker error:", error.message);
});

console.log("[Monitor Worker] Listening for monitor checks...");

async function shutdown() {
  console.log("[Monitor Worker] Shutting down...");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);