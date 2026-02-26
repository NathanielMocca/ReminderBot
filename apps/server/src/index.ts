import express from "express";
import { config } from "./config.js";
import { reminderRouter, getRepositoryForWorkers } from "./routes/reminderRoutes.js";
import { DispatchWorker } from "./services/dispatchWorker.js";

const app = express();
app.use(express.json());

app.get("/healthz", (_, res) => {
  res.json({ ok: true, utc: new Date().toISOString() });
});

app.use("/api/reminders", reminderRouter);

const server = app.listen(config.port, () => {
  console.log(`Server listening at http://localhost:${config.port}`);
});

const worker = new DispatchWorker(getRepositoryForWorkers());
const workerTimer = setInterval(() => {
  worker.runOnce().catch((error) => {
    console.error("dispatch worker failed:", error);
  });
}, config.workerIntervalMs);

const cleanupTimer = setInterval(() => {
  worker.cleanupDispatchLogs().then((count) => {
    if (count > 0) {
      console.log(`cleanup removed ${count} dispatch_logs`);
    }
  }).catch((error) => {
    console.error("cleanup failed:", error);
  });
}, config.cleanupIntervalMs);

function shutdown(): void {
  clearInterval(workerTimer);
  clearInterval(cleanupTimer);
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
