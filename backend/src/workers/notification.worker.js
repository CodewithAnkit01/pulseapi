
import { Worker } from "bullmq";
import nodemailer from "nodemailer";
import prisma from "../config/database.js";
import redisConnection from "../config/redis.js";
import { sendSafeWebhook } from "../utils/ssrf-safe-request.js";
import { moveToDeadLetter } from "../queues/notification-dlq.queue.js";
const QUEUE_NAME = "incident-notifications";
const STALE_PROCESSING_MINUTES = 5;

const smtpConfigured = Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.SMTP_FROM
);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== "false",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

function logError(label, error) {
  console.error(label, {
    message: error?.message,
    code: error?.code,
    meta: error?.meta,
    stack: error?.stack,
  });
}

async function sendEmail(channel, incident, eventType) {
  if (!transporter) {
    throw new Error("SMTP is not configured");
  }

  const monitorName = incident.monitor.name;

  const subject =
    eventType === "OPENED"
      ? `[PulseAPI] Monitor DOWN: ${monitorName}`
      : `[PulseAPI] Monitor RECOVERED: ${monitorName}`;

  const text = [
    `Event: ${eventType}`,
    `Monitor: ${monitorName}`,
    `Monitor URL: ${incident.monitor.url}`,
    `Incident ID: ${incident.id}`,
    `Incident status: ${incident.status}`,
    `Description: ${incident.description || "No description provided"}`,
    `Opened at: ${incident.openedAt.toISOString()}`,
    `Resolved at: ${incident.resolvedAt?.toISOString() || "Not resolved"}`,
  ].join("\n");

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: channel.destination,
    subject,
    text,
  });

  console.log("[Notification Worker] Email sent:", {
    incidentId: incident.id,
    eventType,
    channelId: channel.id,
  });
}


async function sendWebhook(channel, incident, eventType) {
  const payload = {
    provider: "PulseAPI",
    eventType,
    timestamp: new Date().toISOString(),
    incident: {
      id: incident.id,
      status: incident.status,
      title: incident.title,
      description: incident.description,
      openedAt: incident.openedAt,
      resolvedAt: incident.resolvedAt,
    },
    monitor: {
      id: incident.monitor.id,
      name: incident.monitor.name,
      url: incident.monitor.url,
      status: incident.monitor.status,
    },
  };

  const result = await sendSafeWebhook(
    channel.destination,
    payload
  );

  console.log("[Notification Worker] Webhook sent:", {
    incidentId: incident.id,
    eventType,
    channelId: channel.id,
    statusCode: result.statusCode,
  });

  return result;
}


async function deliverToChannel(channel, incident, eventType) {
  console.log("[DEBUG] Creating delivery record:", {
    incidentId: incident.id,
    eventType,
    alertChannelId: channel.id,
    channelType: channel.type,
  });

  let delivery;

  try {
    delivery = await prisma.notificationDelivery.upsert({
      where: {
        incidentId_eventType_alertChannelId: {
          incidentId: incident.id,
          eventType,
          alertChannelId: channel.id,
        },
      },
      update: {},
      create: {
        incidentId: incident.id,
        eventType,
        alertChannelId: channel.id,
        status: "PENDING",
      },
    });

    console.log("[DEBUG] Delivery record created/retrieved:", delivery);
  } catch (error) {
    logError("[DEBUG] NotificationDelivery upsert failed:", error);
    throw error;
  }

  if (delivery.status === "SENT") {
    console.log("[Notification Worker] Already delivered:", {
      incidentId: incident.id,
      eventType,
      channelId: channel.id,
    });

    return { skipped: true, reason: "ALREADY_SENT" };
  }

  const staleBefore = new Date(
    Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000
  );

  console.log("[DEBUG] Attempting atomic delivery claim:", {
    deliveryId: delivery.id,
    currentStatus: delivery.status,
  });

  const claim = await prisma.notificationDelivery.updateMany({
    where: {
      id: delivery.id,
      OR: [
        { status: { in: ["PENDING", "FAILED"] } },
        {
          status: "PROCESSING",
          processingAt: { lt: staleBefore },
        },
      ],
    },
    data: {
      status: "PROCESSING",
      processingAt: new Date(),
      attempts: { increment: 1 },
      lastError: null,
    },
  });

  console.log("[DEBUG] Delivery claim result:", {
    deliveryId: delivery.id,
    claimed: claim.count,
  });

  if (claim.count === 0) {
    console.log("[Notification Worker] Delivery already processing:", {
      incidentId: incident.id,
      channelId: channel.id,
    });

    return { skipped: true, reason: "ALREADY_PROCESSING" };
  }

  try {
    console.log("[DEBUG] Starting channel delivery:", {
      channelId: channel.id,
      type: channel.type,
    });

    if (channel.type === "EMAIL") {
      await sendEmail(channel, incident, eventType);
    } else if (channel.type === "WEBHOOK") {
      await sendWebhook(channel, incident, eventType);
    } else {
      throw new Error(`Unsupported channel type: ${channel.type}`);
    }

    const updatedDelivery = await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        processingAt: null,
        lastError: null,
      },
    });

    console.log("[DEBUG] Delivery marked SENT:", updatedDelivery);

    console.log("[Notification Worker] Channel delivered:", {
      incidentId: incident.id,
      eventType,
      channelId: channel.id,
      type: channel.type,
    });

    return { delivered: true };
  } catch (error) {
    logError("[Notification Worker] Channel delivery failed:", error);

    try {
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          processingAt: null,
          lastError: error.message || "Unknown delivery error",
        },
      });
    } catch (dbError) {
      logError("[Notification Worker] Failed to update delivery status:", dbError);
    }

    throw error;
  }
}

class PermanentNotificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermanentNotificationError";
    this.permanent = true;
  }
}

async function processNotification(job) {
  console.log("[DEBUG] Processing notification job:", {
    jobId: job.id,
    data: job.data,
  });

  const { incidentId, eventType } = job.data;

if (!incidentId || !["OPENED", "RESOLVED"].includes(eventType)) {
  throw new PermanentNotificationError(
    "Invalid notification job payload"
  );
}

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      monitor: {
        include: {
          alertChannels: {
            include: {
              alertChannel: true,
            },
          },
        },
      },
    },
  });

  if (!incident) {
    console.warn("[Notification Worker] Incident not found:", incidentId);
    return { skipped: true, reason: "INCIDENT_NOT_FOUND" };
  }

  console.log("[DEBUG] Incident loaded:", {
    incidentId: incident.id,
    monitorId: incident.monitor.id,
    monitorName: incident.monitor.name,
  });

  const channels = incident.monitor.alertChannels
    .map((item) => item.alertChannel)
    .filter((channel) => channel.enabled);

  console.log("[DEBUG] Enabled alert channels:", channels.map((channel) => ({
    id: channel.id,
    type: channel.type,
    enabled: channel.enabled,
  })));

  if (channels.length === 0) {
    console.log("[Notification Worker] No enabled channels:", {
      incidentId,
    });

    return { skipped: true, reason: "NO_ENABLED_CHANNELS" };
  }

  const results = await Promise.allSettled(
    channels.map((channel) =>
      deliverToChannel(channel, incident, eventType)
    )
  );

  console.log("[DEBUG] Channel delivery results:", results);

  const failures = results.filter(
    (result) => result.status === "rejected"
  );

  const delivered = results.filter(
    (result) =>
      result.status === "fulfilled" &&
      result.value?.delivered
  ).length;

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} of ${channels.length} channel deliveries failed`
    );
  }

  console.log("[Notification Worker] Job completed:", {
    jobId: job.id,
    incidentId,
    eventType,
    delivered,
  });

  return { delivered };
}

const worker = new Worker(
  QUEUE_NAME,
  processNotification,
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

worker.on("completed", (job, result) => {
  console.log("[Notification Worker] Completed:", job.id, result);
});

worker.on("failed", async (job, error) => {
  if (!job) return;

  const maxAttempts = job.opts.attempts ?? 1;
  const permanent = error?.permanent === true;
  const exhausted = job.attemptsMade >= maxAttempts;

  console.error("[Notification Worker] Job failed:", {
    jobId: job.id,
    attemptsMade: job.attemptsMade,
    maxAttempts,
    permanent,
    error: error.message,
  });

  // Wait for retries unless the error is permanent.
  if (!permanent && !exhausted) {
    console.log("[Retry] Job will be retried:", job.id);
    return;
  }

  console.log("[DLQ] Archiving failed job:", job.id);

  try {
    const dlqJob = await moveToDeadLetter(job, error);

    console.log("[DLQ] Archive result:", {
      originalJobId: job.id,
      dlqJobId: dlqJob?.id ?? null,
    });
  } catch (dlqError) {
    logError("[DLQ] Archive failed:", dlqError);
  }
});


worker.on("error", (error) => {
  logError("[Notification Worker] Worker error:", error);
});

async function shutdown() {
  console.log("[Notification Worker] Shutting down...");

  await worker.close();
  await prisma.$disconnect();

  console.log("[Notification Worker] Stopped");
}

process.once("SIGINT", () => {
  shutdown().catch((error) => {
    logError("[Notification Worker] Shutdown error:", error);
    process.exitCode = 1;
  });
});

process.once("SIGTERM", () => {
  shutdown().catch((error) => {
    logError("[Notification Worker] Shutdown error:", error);
    process.exitCode = 1;
  });
});

console.log("[Notification Worker] Listening on", QUEUE_NAME);
