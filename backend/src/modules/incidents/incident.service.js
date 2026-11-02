
const UNRESOLVED_STATUSES = ["OPEN", "ACKNOWLEDGED"];

async function createNotificationOutbox(
  tx,
  incident,
  monitor,
  eventType,
) {
  await tx.notificationOutbox.create({
    data: {
      incidentId: incident.id,
      eventType,
      payload: {
        incidentId: incident.id,
        monitorId: monitor.id,
        monitorName: monitor.name,
        title: incident.title,
        description: incident.description,
        eventType,
      },
    },
  });
}

export async function openIncidentIfNeeded(
  tx,
  monitor,
  result,
  checkedAt,
) {
  const existingIncident = await tx.incident.findFirst({
    where: {
      monitorId: monitor.id,
      status: { in: UNRESOLVED_STATUSES },
    },
    select: { id: true },
  });

  if (existingIncident) {
    return existingIncident;
  }

  const details =
    result.errorMessage ??
    (result.statusCode
      ? `Unexpected HTTP status: ${result.statusCode}`
      : `Monitor check failed: ${result.outcome}`);

  const incident = await tx.incident.create({
    data: {
      monitorId: monitor.id,
      status: "OPEN",
      title: `${monitor.name} is down`,
      description: details,
      openedAt: checkedAt,
      events: {
        create: {
          type: "OPENED",
          message: `Failure threshold reached. Latest outcome: ${result.outcome}.`,
        },
      },
    },
  });

  await createNotificationOutbox(
    tx,
    incident,
    monitor,
    "OPENED",
  );

  console.log("[Incident] Opened:", {
    incidentId: incident.id,
    monitorId: monitor.id,
  });

  return incident;
}

export async function resolveOpenIncidentIfNeeded(
  tx,
  monitor,
  checkedAt,
) {
  const incident = await tx.incident.findFirst({
    where: {
      monitorId: monitor.id,
      status: { in: UNRESOLVED_STATUSES },
    },
    orderBy: { openedAt: "desc" },
  });

  if (!incident) {
    return null;
  }

  const resolvedIncident = await tx.incident.update({
    where: { id: incident.id },
    data: {
      status: "RESOLVED",
      resolvedAt: checkedAt,
      events: {
        create: {
          type: "RESOLVED",
          message: "Recovery threshold reached. Monitor is UP again.",
        },
      },
    },
  });

  await createNotificationOutbox(
    tx,
    resolvedIncident,
    monitor,
    "RESOLVED",
  );

  console.log("[Incident] Resolved:", {
    incidentId: resolvedIncident.id,
    monitorId: monitor.id,
  });

  return resolvedIncident;
}
