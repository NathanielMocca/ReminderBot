import { z } from "zod";
import { FIVE_MINUTE_STEP } from "./constants.js";

const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const createReminderBaseSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(2000),
  mentionRoleIds: z.array(z.string()).default([]),
  scheduleType: z.enum(["daily", "weekday"]),
  timeHHmm: z.string().regex(hhmmRegex),
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  createdBy: z.string().min(1)
});

export const createReminderSchema = createReminderBaseSchema.superRefine((data, ctx) => {
  const minute = Number(data.timeHHmm.split(":")[1]);
  if (minute % FIVE_MINUTE_STEP !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timeHHmm"],
      message: "分鐘必須為 0,5,10...55。"
    });
  }

  if (data.scheduleType === "weekday") {
    if (!data.weekdays || data.weekdays.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "weekday 模式必須提供至少一個星期。"
      });
    }
  }
});

export const updateReminderSchema = createReminderBaseSchema
  .pick({
    title: true,
    content: true,
    mentionRoleIds: true,
    scheduleType: true,
    timeHHmm: true,
    weekdays: true
  })
  .partial()
  .extend({
    enabled: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    if (!data.timeHHmm) {
      return;
    }
    const minute = Number(data.timeHHmm.split(":")[1]);
    if (minute % FIVE_MINUTE_STEP !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timeHHmm"],
        message: "分鐘必須為 0,5,10...55。"
      });
    }
  });
