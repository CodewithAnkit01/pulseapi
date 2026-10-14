import app from "./app.js";
import { env } from "./config/env.js";
import prisma from "./config/database.js";

let server;

async function startServer() {
  try {
    await prisma.$connect();

    console.log("PostgreSQL connected successfully");

    server = app.listen(env.PORT, () => {
      console.log(
        `PulseAPI running at http://localhost:${env.PORT}`
      );

      console.log(`Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    console.error("Failed to start PulseAPI:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  if (server) {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  } else {
    await prisma.$disconnect();
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();