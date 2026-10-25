import { Queue } from "bullmq";
import redisConnection from "../config/redis.js";

export const monitorQueue = new Queue("monitor-checks", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

monitorQueue.on("error", (error) => {
  console.error("Monitor queue error:", error.message);
});