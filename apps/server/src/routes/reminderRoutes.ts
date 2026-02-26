import express from "express";
import type { Request, Response, NextFunction } from "express";
import { ReminderRepository } from "../repositories/reminderRepository.js";
import { ReminderService } from "../services/reminderService.js";
import { config } from "../config.js";

const repository = new ReminderRepository();
const service = new ReminderService(repository);

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.header("x-api-token");
  if (token !== config.apiToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  next();
}

export const reminderRouter = express.Router();
reminderRouter.use(authMiddleware);

reminderRouter.post("/", async (req, res) => {
  try {
    const result = await service.createReminder(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

reminderRouter.get("/", async (req, res) => {
  try {
    const guildId = String(req.query.guildId ?? "");
    const reminders = await service.listReminders(guildId);
    res.json({ reminders });
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

reminderRouter.get("/guilds/:guildId/config", async (req, res) => {
  try {
    const configData = await repository.getGuildConfig(req.params.guildId);
    res.json(configData);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

reminderRouter.patch("/:id", async (req, res) => {
  try {
    const result = await service.updateReminder(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

reminderRouter.delete("/:id", async (req, res) => {
  try {
    const result = await service.deleteReminder(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

reminderRouter.put("/guilds/:guildId/timezone", async (req, res) => {
  try {
    const timezone = String(req.body.timezone ?? "UTC");
    await repository.updateGuildTimezoneAndRebuildBuckets(req.params.guildId, timezone);
    res.json({ message: "Guild 時區已更新，並已重算 bucket。" });
  } catch (error) {
    res.status(400).json({ message: String(error) });
  }
});

export function getRepositoryForWorkers(): ReminderRepository {
  return repository;
}
