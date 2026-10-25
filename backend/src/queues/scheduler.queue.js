import { Queue } from "bullmq";
import redisConnection from "../config/redis.js";

export const schedulerQueue = new Queue("monitor-scheduler", {
  connection: redisConnection,
});

schedulerQueue.on("error", (error) => {
  console.error("Scheduler queue error:", error.message);
});