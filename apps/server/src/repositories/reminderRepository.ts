import {
  createReminderSchema,
  updateReminderSchema,
  FREE_REMINDER_GLOBAL_CAP,
  FREE_REMINDER_UNLOCK_THRESHOLD,
  FREE_TIER_GUILD_REMINDER_LIMIT,
  GLOBAL_LIMITS_DOC_PATH,
  getDueBucketKeysForReminder,
  type CreateReminderInput,
  type Reminder,
  type ScheduleType,
  type GuildConfig,
  type UpdateReminderInput
} from "@reminder/shared";
import { getDb } from "./firestore.js";

export class ReminderRepository {
  private db = getDb();

  async getGuildConfig(guildId: string): Promise<GuildConfig> {
    const ref = this.db.collection("guilds").doc(guildId);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() ?? {} : {};
    return {
      guildId,
      timezone: String(data.timezone ?? "UTC"),
      managerRoleIds: Array.isArray(data.managerRoleIds) ? data.managerRoleIds : [],
      planTier: (data.planTier ?? "free") as GuildConfig["planTier"],
      reminderLimit: Number(data.reminderLimit ?? FREE_TIER_GUILD_REMINDER_LIMIT),
      activeReminderCount: Number(data.activeReminderCount ?? 0)
    };
  }

  async listByGuild(guildId: string): Promise<Reminder[]> {
    const snap = await this.db.collection("reminders").where("guildId", "==", guildId).get();
    return snap.docs.map((d) => ({ reminderId: d.id, ...(d.data() as Omit<Reminder, "reminderId">) }));
  }

  async create(input: CreateReminderInput): Promise<{ reminderId: string; message: string }> {
    const parsed = createReminderSchema.parse(input);
    const guildRef = this.db.collection("guilds").doc(parsed.guildId);
    const globalRef = this.db.doc(GLOBAL_LIMITS_DOC_PATH);
    const reminderRef = this.db.collection("reminders").doc();

    await this.db.runTransaction(async (tx) => {
      const guildSnap = await tx.get(guildRef);
      const globalSnap = await tx.get(globalRef);

      const guildData = (guildSnap.exists ? guildSnap.data() : null) ?? {
        timezone: "UTC",
        managerRoleIds: [],
        planTier: "free",
        reminderLimit: FREE_TIER_GUILD_REMINDER_LIMIT,
        activeReminderCount: 0
      };

      const globalData = (globalSnap.exists ? globalSnap.data() : null) ?? {
        freeReminderGlobalCap: FREE_REMINDER_GLOBAL_CAP,
        freeReminderGlobalCount: 0,
        freeCreateLocked: false,
        lockReason: "",
        updatedAt: new Date().toISOString()
      };

      const guildLimit = Number(guildData.reminderLimit ?? FREE_TIER_GUILD_REMINDER_LIMIT);
      const guildCount = Number(guildData.activeReminderCount ?? 0);
      const isFree = (guildData.planTier ?? "free") === "free";

      if (guildCount >= guildLimit) {
        throw new Error(`此伺服器已達免費方案提醒上限（${guildLimit} 筆），請先刪除舊提醒或升級方案。`);
      }

      const globalCap = Number(globalData.freeReminderGlobalCap ?? FREE_REMINDER_GLOBAL_CAP);
      const globalCount = Number(globalData.freeReminderGlobalCount ?? 0);
      const freeCreateLocked = Boolean(globalData.freeCreateLocked);
      if (isFree && (freeCreateLocked || globalCount >= globalCap)) {
        throw new Error(`目前免費方案提醒名額已滿（全域上限 ${globalCap.toLocaleString()}），暫時無法新增提醒。請稍後再試、刪除舊提醒，或升級方案。`);
      }

      const timezone = guildData.timezone ?? "UTC";
      const dueBucketKeys = getDueBucketKeysForReminder(
        parsed.scheduleType as ScheduleType,
        parsed.timeHHmm,
        timezone,
        parsed.weekdays ?? []
      );

      tx.set(reminderRef, {
        ...parsed,
        timezone,
        weekdays: parsed.weekdays ?? [],
        dueBucketKeys,
        enabled: true,
        updatedAt: new Date().toISOString()
      });

      tx.set(guildRef, {
        ...guildData,
        activeReminderCount: guildCount + 1
      }, { merge: true });

      if (isFree) {
        tx.set(globalRef, {
          ...globalData,
          freeReminderGlobalCount: globalCount + 1,
          freeCreateLocked: globalCount + 1 >= globalCap,
          lockReason: globalCount + 1 >= globalCap ? "free global cap reached" : "",
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      for (const bucketKey of dueBucketKeys) {
        const bucketRef = this.db.collection("due_buckets").doc(bucketKey).collection("items").doc(reminderRef.id);
        tx.set(bucketRef, {
          guildId: parsed.guildId,
          reminderRef: reminderRef.id,
          enabled: true
        });
      }
    });

    return { reminderId: reminderRef.id, message: `提醒已建立：${reminderRef.id}` };
  }

  async update(reminderId: string, patch: UpdateReminderInput): Promise<void> {
    const parsed = updateReminderSchema.parse(patch);
    const reminderRef = this.db.collection("reminders").doc(reminderId);

    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(reminderRef);
      if (!snap.exists) {
        throw new Error("提醒不存在");
      }
      const current = snap.data() as Omit<Reminder, "reminderId">;
      const next = {
        ...current,
        ...parsed
      };
      if (parsed.scheduleType || parsed.timeHHmm || parsed.weekdays) {
        next.dueBucketKeys = getDueBucketKeysForReminder(
          next.scheduleType,
          next.timeHHmm,
          next.timezone,
          next.weekdays
        );
      }
      next.updatedAt = new Date().toISOString();
      tx.set(reminderRef, next, { merge: true });
    });
  }

  async delete(reminderId: string): Promise<void> {
    const reminderRef = this.db.collection("reminders").doc(reminderId);
    const globalRef = this.db.doc(GLOBAL_LIMITS_DOC_PATH);

    await this.db.runTransaction(async (tx) => {
      const reminderSnap = await tx.get(reminderRef);
      if (!reminderSnap.exists) {
        throw new Error("提醒不存在");
      }
      const reminder = reminderSnap.data() as Omit<Reminder, "reminderId">;
      const guildRef = this.db.collection("guilds").doc(reminder.guildId);
      const guildSnap = await tx.get(guildRef);
      const globalSnap = await tx.get(globalRef);
      const guildData = guildSnap.data() ?? {};
      const globalData = globalSnap.data() ?? {};
      const isFree = (guildData.planTier ?? "free") === "free";

      tx.delete(reminderRef);
      tx.set(guildRef, {
        activeReminderCount: Math.max(0, Number(guildData.activeReminderCount ?? 1) - 1)
      }, { merge: true });

      if (isFree) {
        const nextCount = Math.max(0, Number(globalData.freeReminderGlobalCount ?? 1) - 1);
        tx.set(globalRef, {
          freeReminderGlobalCount: nextCount,
          freeCreateLocked: nextCount > FREE_REMINDER_UNLOCK_THRESHOLD ? Boolean(globalData.freeCreateLocked) : false,
          lockReason: nextCount > FREE_REMINDER_UNLOCK_THRESHOLD ? (globalData.lockReason ?? "") : "",
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      for (const key of reminder.dueBucketKeys ?? []) {
        const bucketRef = this.db.collection("due_buckets").doc(key).collection("items").doc(reminderId);
        tx.delete(bucketRef);
      }
    });
  }

  async listDueReminderIds(bucketKey: string): Promise<string[]> {
    const snap = await this.db.collection("due_buckets").doc(bucketKey).collection("items").where("enabled", "==", true).get();
    return snap.docs.map((d) => d.id);
  }

  async getReminder(reminderId: string): Promise<Reminder | null> {
    const snap = await this.db.collection("reminders").doc(reminderId).get();
    if (!snap.exists) {
      return null;
    }
    return { reminderId: snap.id, ...(snap.data() as Omit<Reminder, "reminderId">) };
  }

  async createDispatchLogIfAbsent(id: string, reminderId: string, bucketKey: string): Promise<boolean> {
    const ref = this.db.collection("dispatch_logs").doc(id);
    return this.db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        return false;
      }
      tx.set(ref, {
        reminderId,
        bucketKey,
        status: "skipped",
        sentAt: new Date().toISOString(),
        errorCode: null
      });
      return true;
    });
  }

  async updateDispatchLogStatus(id: string, status: "sent" | "failed" | "skipped", errorCode?: string): Promise<void> {
    await this.db.collection("dispatch_logs").doc(id).set({
      status,
      errorCode: errorCode ?? null,
      sentAt: new Date().toISOString()
    }, { merge: true });
  }

  async deleteOldDispatchLogs(olderThanIso: string, limit: number): Promise<number> {
    const snap = await this.db.collection("dispatch_logs")
      .where("sentAt", "<", olderThanIso)
      .limit(limit)
      .get();
    const batch = this.db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    return snap.size;
  }

  async updateGuildTimezoneAndRebuildBuckets(guildId: string, timezone: string): Promise<void> {
    const guildRef = this.db.collection("guilds").doc(guildId);
    const reminders = await this.listByGuild(guildId);
    const batch = this.db.batch();

    batch.set(guildRef, { timezone, updatedAt: new Date().toISOString() }, { merge: true });
    for (const reminder of reminders) {
      for (const oldKey of reminder.dueBucketKeys) {
        const oldBucketItem = this.db.collection("due_buckets").doc(oldKey).collection("items").doc(reminder.reminderId);
        batch.delete(oldBucketItem);
      }
      const nextKeys = getDueBucketKeysForReminder(
        reminder.scheduleType,
        reminder.timeHHmm,
        timezone,
        reminder.weekdays
      );
      const reminderRef = this.db.collection("reminders").doc(reminder.reminderId);
      batch.set(reminderRef, { timezone, dueBucketKeys: nextKeys, updatedAt: new Date().toISOString() }, { merge: true });
      for (const nextKey of nextKeys) {
        const nextBucketItem = this.db.collection("due_buckets").doc(nextKey).collection("items").doc(reminder.reminderId);
        batch.set(nextBucketItem, { guildId, reminderRef: reminder.reminderId, enabled: reminder.enabled }, { merge: true });
      }
    }
    await batch.commit();
  }
}
