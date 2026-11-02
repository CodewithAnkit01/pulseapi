-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "eventType" "IncidentEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationOutbox_processedAt_createdAt_idx" ON "NotificationOutbox"("processedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_incidentId_eventType_key" ON "NotificationOutbox"("incidentId", "eventType");
