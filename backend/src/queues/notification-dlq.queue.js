
import { Queue } from "bullmq";
import redisConnection from "../config/redis.js";

export const notificationDLQ = new Queue(
  "notification-dead-letter",
  {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: false,
      removeOnFail: false,
    },
  }
);

export async function moveToDeadLetter(job, error) {
  if (!job) {
    throw new Error("Cannot move missing job to DLQ");
  }

  const maxAttempts = job.opts.attempts ?? 1;

  if (job.attemptsMade < maxAttempts) {
    console.log("[DLQ] Job still has retries remaining:", {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      maxAttempts,
    });
    return null;
  }

  const dlqJobId = `dlq-${job.id}`;

  const payload = {
    originalQueue: "incident-notifications",
    originalJobId: job.id,
    originalJobName: job.name,
    originalData: job.data,
    attemptsMade: job.attemptsMade,
    maxAttempts,
    failedReason: error?.message || job.failedReason || "Unknown failure",
    stacktrace: job.stacktrace || [],
    failedAt: new Date().toISOString(),
  };

  const existing = await notificationDLQ.getJob(dlqJobId);

  if (existing) {
    console.log("[DLQ] Job already archived:", dlqJobId);
    return existing;
  }

  const dlqJob = await notificationDLQ.add(
    "notification-permanently-failed",
    payload,
    { jobId: dlqJobId }
  );

  console.log("[DLQ] Archived permanently failed job:", {
    originalJobId: job.id,
    dlqJobId: dlqJob.id,
    attemptsMade: job.attemptsMade,
  });

  return dlqJob;
}
