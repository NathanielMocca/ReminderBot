import { DISPATCH_LOG_RETENTION_DAYS, getCurrentUtcBucketKeys, getDispatchLogId } from "@reminder/shared";
import { ReminderRepository } from "../repositories/reminderRepository.js";
import { sendReminderMessage } from "../discord/sender.js";

export class DispatchWorker {
  constructor(private repository: ReminderRepository) {}

  async runOnce(): Promise<void> {
    const now = new Date();
    if (now.getUTCMinutes() % 5 !== 0) {
      return;
    }

    const bucketKeys = getCurrentUtcBucketKeys(now);
    for (const bucketKey of bucketKeys) {
      const reminderIds = await this.repository.listDueReminderIds(bucketKey);
      for (const reminderId of reminderIds) {
        const logId = getDispatchLogId(reminderId, now);
        const canSend = await this.repository.createDispatchLogIfAbsent(logId, reminderId, bucketKey);
        if (!canSend) {
          continue;
        }

        const reminder = await this.repository.getReminder(reminderId);
        if (!reminder || !reminder.enabled) {
          continue;
        }

        try {
          await sendReminderMessage(
            reminder.channelId,
            reminder.title,
            reminder.content,
            reminder.mentionRoleIds ?? []
          );
          await this.repository.updateDispatchLogStatus(logId, "sent");
        } catch (error) {
          await this.repository.updateDispatchLogStatus(logId, "failed", String(error));
        }
      }
    }
  }

  async cleanupDispatchLogs(): Promise<number> {
    const cutoff = new Date(Date.now() - DISPATCH_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    // Keep delete batch bounded to avoid hitting Spark daily delete quota unexpectedly.
    return this.repository.deleteOldDispatchLogs(cutoff, 500);
  }
}
