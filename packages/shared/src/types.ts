export type PlanTier = "free" | "pro" | "lifetime";
export type ScheduleType = "daily" | "weekday";

export interface GuildConfig {
  guildId: string;
  timezone: string;
  managerRoleIds: string[];
  planTier: PlanTier;
  reminderLimit: number;
  activeReminderCount: number;
}

export interface SystemLimits {
  freeReminderGlobalCap: number;
  freeReminderGlobalCount: number;
  freeCreateLocked: boolean;
  lockReason: string;
  updatedAt: string;
}

export interface Reminder {
  reminderId: string;
  guildId: string;
  channelId: string;
  title: string;
  content: string;
  mentionRoleIds: string[];
  scheduleType: ScheduleType;
  timeHHmm: string;
  timezone: string;
  weekdays: number[];
  dueBucketKeys: string[];
  enabled: boolean;
  createdBy: string;
  updatedAt: string;
}

export interface CreateReminderInput {
  guildId: string;
  channelId: string;
  title: string;
  content: string;
  mentionRoleIds: string[];
  scheduleType: ScheduleType;
  timeHHmm: string;
  weekdays?: number[];
  createdBy: string;
}

export interface UpdateReminderInput {
  title?: string;
  content?: string;
  mentionRoleIds?: string[];
  scheduleType?: ScheduleType;
  timeHHmm?: string;
  weekdays?: number[];
  enabled?: boolean;
}

export interface DispatchLog {
  id: string;
  reminderId: string;
  bucketKey: string;
  status: "sent" | "failed" | "skipped";
  sentAt: string;
  errorCode?: string;
}

export interface ReminderCreateResponse {
  ok: boolean;
  reminderId?: string;
  code?: string;
  message: string;
}
