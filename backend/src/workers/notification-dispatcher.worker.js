
import prisma from "../config/database.js";
import {
  enqueueIncidentNotification,
  notificationQueue,
} from "../queues/notification.queue.js";

const BATCH_SIZE = 20;
const POLL_INTERVAL = 5000;

let isShuttingDown = false;
let isRunning = false;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function dispatchPendingNotifications() {
  const pendingEvents = await prisma.notificationOutbox.findMany({
    where: {
      processedAt: null,
    },
    orderBy: {
      createdAt: "asc",
    },
    take: BATCH_SIZE,
  });

  for (const event of pendingEvents) {
    try {
      await enqueueIncidentNotification({
        incidentId: event.incidentId,
        eventType: event.eventType,
      });

      await prisma.notificationOutbox.updateMany({
        where: {
          id: event.id,
          processedAt: null,
        },
        data: {
          processedAt: new Date(),
          attempts: {
            increment: 1,
          },
          lastError: null,
        },
      });

      console.log("[Notification Dispatcher] Enqueued:", {
        outboxId: event.id,
        incidentId: event.incidentId,
        eventType: event.eventType,
      });
    } catch (error) {
      await prisma.notificationOutbox.updateMany({
        where: {
          id: event.id,
          processedAt: null,
        },
        data: {
          attempts: {
            increment: 1,
          },
          lastError: error.message,
        },
      });

      console.error("[Notification Dispatcher] Failed:", {
        outboxId: event.id,
        error: error.message,
      });
    }
  }

  return pendingEvents.length;
}

async function startDispatcher() {
  console.log("[Notification Dispatcher] Started");

  while (!isShuttingDown) {
    if (!isRunning) {
      isRunning = true;

      try {
        await dispatchPendingNotifications();
      } catch (error) {
        console.error(
          "[Notification Dispatcher] Polling error:",
          error.message,
        );
      } finally {
        isRunning = false;
      }
    }

    if (!isShuttingDown) {
      await sleep(POLL_INTERVAL);
    }
  }

  console.log("[Notification Dispatcher] Stopped");

  await notificationQueue.close();
  await prisma.$disconnect();
}

function shutdown() {
  if (isShuttingDown) return;

  isShuttingDown = true;
  console.log("[Notification Dispatcher] Shutdown requested");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startDispatcher().catch((error) => {
  console.error("[Notification Dispatcher] Fatal error:", error);
  process.exitCode = 1;
});
