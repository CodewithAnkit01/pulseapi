
import { Queue } from "bullmq";
import redisConnection from "../config/redis.js";

export const notificationQueue = new Queue("incident-notifications", {
  connection: redisConnection,

  defaultJobOptions: {
    attempts: 5,

    backoff: {
      type: "exponential",
      delay: 2000,
    },

    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 1000,
    },

    removeOnFail: false,
  },
});

export async function enqueueIncidentNotification({
  incidentId,
  eventType,
}) {
  if (!incidentId || !eventType) {
    throw new Error("incidentId and eventType are required");
  }

  if (!["OPENED", "RESOLVED"].includes(eventType)) {
    throw new Error(`Unsupported notification event: ${eventType}`);
  }

  return notificationQueue.add(
    `incident-${eventType.toLowerCase()}`,
    {
      incidentId,
      eventType,
    },
    {
      // Prevent duplicate jobs when the dispatcher retries.
      jobId: `${incidentId}-${eventType.toLowerCase()}`,
    },
  );
}
