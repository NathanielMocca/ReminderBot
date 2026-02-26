import {
  type CreateReminderInput,
  type UpdateReminderInput
} from "@reminder/shared";
import { ReminderRepository } from "../repositories/reminderRepository.js";

export class ReminderService {
  constructor(private repository: ReminderRepository) {}

  async createReminder(input: CreateReminderInput): Promise<{ message: string; reminderId: string }> {
    return this.repository.create(input);
  }

  async listReminders(guildId: string): Promise<Array<{ reminderId: string; title: string; timeHHmm: string; scheduleType: string; enabled: boolean; timezone: string; weekdays: number[] }>> {
    const reminders = await this.repository.listByGuild(guildId);
    return reminders.map((r) => ({
      reminderId: r.reminderId,
      title: r.title,
      timeHHmm: r.timeHHmm,
      scheduleType: r.scheduleType,
      enabled: r.enabled,
      timezone: r.timezone,
      weekdays: r.weekdays ?? []
    }));
  }

  async updateReminder(reminderId: string, patch: UpdateReminderInput): Promise<{ message: string }> {
    await this.repository.update(reminderId, patch);
    return { message: "提醒已更新。" };
  }

  async deleteReminder(reminderId: string): Promise<{ message: string }> {
    await this.repository.delete(reminderId);
    return { message: "提醒已刪除。" };
  }
}
