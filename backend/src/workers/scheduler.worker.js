import { Worker } from "bullmq";
import prisma from "../config/database.js";
import redisConnection from "../config/redis.js";
import { monitorQueue } from "../queues/monitor.queue.js";

const schedulerWorker = new Worker(
  "monitor-scheduler",
  async (job) => {
    if (job.name !== "dispatch-due-monitors") {
      throw new Error(`Unknown scheduler job: ${job.name}`);
    }

    const now = new Date();

    const monitors = await prisma.monitor.findMany({
      where: {
        enabled: true,
        OR: [
          { nextCheckAt: null },
          { nextCheckAt: { lte: now } },
        ],
      },
      select: {
        id: true,
        intervalSeconds: true,
        nextCheckAt: true,
      },
      take: 500,
      orderBy: {
        nextCheckAt: "asc",
      },
    });

    let queuedCount = 0;

    for (const monitor of monitors) {
      // Add the check job to Redis.
      await monitorQueue.add(
        "check-monitor",
        {
          monitorId: monitor.id,
          scheduledAt: now.toISOString(),
        },
        {
          // Avoid duplicate IDs for repeated dispatches in the same second.
          jobId: `monitor-${monitor.id}-${Math.floor(
            now.getTime() / 1000
          )}`,
        }
      );

      // Schedule the monitor's next check.
      const nextCheckAt = new Date(
        now.getTime() + monitor.intervalSeconds * 1000
      );

      // Update only if another dispatcher hasn't changed the schedule.
      await prisma.monitor.updateMany({
        where: {
          id: monitor.id,
          enabled: true,
          nextCheckAt: monitor.nextCheckAt,
        },
        data: {
          nextCheckAt,
        },
      });

      queuedCount++;
    }

    console.log(
      `[Scheduler] Found ${monitors.length} due monitors; ` +
      `queued ${queuedCount} check jobs`
    );

    return { queuedCount };
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

schedulerWorker.on("completed", (job) => {
  console.log(`[Scheduler] Job ${job.id} completed`);
});

schedulerWorker.on("failed", (job, error) => {
  console.error(
    `[Scheduler] Job ${job?.id} failed:`,
    error.message
  );
});

schedulerWorker.on("error", (error) => {
  console.error("[Scheduler] Worker error:", error.message);
});

async function startScheduler() {
  const { schedulerQueue } = await import(
    "../queues/scheduler.queue.js"
  );

  await schedulerQueue.upsertJobScheduler(
    "dispatch-due-monitors",
    { every: 15_000 },
    {
      name: "dispatch-due-monitors",
      data: {},
      opts: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    }
  );

  console.log("[Scheduler] Running; checking for due monitors every 15 seconds");
}

startScheduler().catch((error) => {
  console.error("[Scheduler] Startup failed:", error);
  process.exitCode = 1;
});

async function shutdown() {
  console.log("[Scheduler] Shutting down...");

  await schedulerWorker.close();
  await monitorQueue.close();

  const { schedulerQueue } = await import(
    "../queues/scheduler.queue.js"
  );

  await schedulerQueue.close();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);