import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction
} from "discord.js";
import {
  createReminder,
  deleteReminder,
  getGuildConfig,
  listReminders,
  updateGuildTimezone,
  updateReminder
} from "../client/serverApi.js";

const DELETE_SELECT_CUSTOM_ID_PREFIX = "reminder_delete_select";
const DELETE_SELECT_MAX_OPTIONS = 25;

export const reminderCommand = new SlashCommandBuilder()
  .setName("reminder")
  .setDescription("管理定時提醒")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("建立提醒")
      .addStringOption((o) => o.setName("schedule_type").setDescription("daily 或 weekday").setRequired(true))
      .addStringOption((o) => o.setName("time").setDescription("HH:mm (5 分鐘刻度)").setRequired(true))
      .addStringOption((o) => o.setName("title").setDescription("提醒標題").setRequired(true))
      .addStringOption((o) => o.setName("content").setDescription("提醒內容").setRequired(true))
      .addChannelOption((o) => o.setName("channel").setDescription("發送頻道").addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((o) => o.setName("weekdays").setDescription("weekday 模式使用，例 1,2,3,4,5"))
  )
  .addSubcommand((sub) =>
    sub
      .setName("update")
      .setDescription("更新提醒")
      .addStringOption((o) => o.setName("id").setDescription("提醒 ID").setRequired(true))
      .addStringOption((o) => o.setName("title").setDescription("提醒標題"))
      .addStringOption((o) => o.setName("content").setDescription("提醒內容"))
      .addStringOption((o) => o.setName("time").setDescription("HH:mm (5 分鐘刻度)"))
      .addStringOption((o) => o.setName("weekdays").setDescription("1,2,3,4,5"))
      .addBooleanOption((o) => o.setName("enabled").setDescription("是否啟用"))
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("勾選刪除提醒")
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("列出提醒"))
  .addSubcommand((sub) => sub.setName("help").setDescription("查看 reminder 指令說明"))
  .addSubcommandGroup((group) =>
    group
      .setName("timezone")
      .setDescription("檢視或設定伺服器時區")
      .addSubcommand((sub) => sub.setName("show").setDescription("顯示目前伺服器時區"))
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("設定伺服器時區（IANA，例如 Asia/Taipei）")
          .addStringOption((o) => o.setName("timezone").setDescription("IANA timezone").setRequired(true))
      )
  );

function parseCsvNumbers(input: string | null): number[] | undefined {
  if (!input) {
    return undefined;
  }
  const parsed = input
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x));
  return parsed.length > 0 ? parsed : undefined;
}

function normalizeScheduleType(input: string): "daily" | "weekday" | null {
  const normalized = input.trim().toLowerCase();
  if (normalized === "daily" || normalized === "weekday") {
    return normalized;
  }
  return null;
}

function validateReminderTimeHHmm(timeHHmm: string): string | null {
  const trimmed = timeHHmm.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) {
    return "`time` 格式錯誤，請使用 `HH:mm`（24 小時制），例如：`09:00`、`18:30`。";
  }
  const minute = Number(match[2]);
  if (minute % 5 !== 0) {
    return "`time` 分鐘必須為 0,5,10...55（5 分鐘刻度）。";
  }
  return null;
}

function truncateForDiscord(input: string, maxLength: number): string {
  return input.length > maxLength ? `${input.slice(0, maxLength - 1)}…` : input;
}

function buildDeleteSelectCustomId(userId: string): string {
  return `${DELETE_SELECT_CUSTOM_ID_PREFIX}:${userId}`;
}

function parseDeleteSelectCustomId(customId: string): string | null {
  if (!customId.startsWith(`${DELETE_SELECT_CUSTOM_ID_PREFIX}:`)) {
    return null;
  }
  const ownerId = customId.slice(`${DELETE_SELECT_CUSTOM_ID_PREFIX}:`.length);
  return ownerId || null;
}

export function isReminderDeleteSelectCustomId(customId: string): boolean {
  return customId.startsWith(`${DELETE_SELECT_CUSTOM_ID_PREFIX}:`);
}

function isValidIanaTimezone(value: string): boolean {
  try {
    return Intl.DateTimeFormat(undefined, { timeZone: value }).resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function parseJsonSafely(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapApiFieldName(field: string): string {
  const fieldMap: Record<string, string> = {
    scheduleType: "schedule_type",
    timeHHmm: "time",
    weekdays: "weekdays",
    title: "title",
    content: "content",
    channelId: "channel",
    timezone: "timezone",
    enabled: "enabled",
    id: "id"
  };
  return fieldMap[field] ?? field;
}

function formatValidationIssue(issue: unknown): string | null {
  if (!issue || typeof issue !== "object") {
    return null;
  }
  const candidate = issue as {
    path?: Array<string | number>;
    message?: string;
    code?: string;
    options?: unknown[];
  };
  const field = mapApiFieldName(String(candidate.path?.[0] ?? "unknown"));

  if (candidate.code === "invalid_enum_value" && Array.isArray(candidate.options) && candidate.options.length > 0) {
    const options = candidate.options.map((item) => `\`${String(item)}\``).join(" 或 ");
    return `欄位 \`${field}\` 輸入錯誤：請使用 ${options}。`;
  }

  if (typeof candidate.message === "string" && candidate.message.length > 0) {
    return `欄位 \`${field}\` 輸入錯誤：${candidate.message}`;
  }

  return null;
}

function toUserFacingErrorMessage(error: unknown): string {
  const fallback = `處理失敗：${getErrorMessage(error)}`;
  if (!(error instanceof Error)) {
    return fallback;
  }

  const match = /^Server API error \d+:\s*([\s\S]+)$/u.exec(error.message);
  if (!match) {
    return fallback;
  }

  const payload = parseJsonSafely(match[1]);
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const message = (payload as { message?: unknown }).message;
  const issues = Array.isArray(message)
    ? message
    : typeof message === "string"
      ? parseJsonSafely(message)
      : null;

  if (!Array.isArray(issues) || issues.length === 0) {
    return fallback;
  }

  const lines = issues
    .map((issue) => formatValidationIssue(issue))
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return fallback;
  }

  return ["輸入資料有誤，請修正以下欄位：", ...lines].join("\n");
}

function formatScheduleTypeLabel(scheduleType: string): string {
  if (scheduleType === "weekday") {
    return "平日";
  }
  if (scheduleType === "daily") {
    return "每日";
  }
  return scheduleType;
}

function formatWeekdayList(weekdays: number[]): string {
  const labels: Record<number, string> = {
    1: "週一",
    2: "週二",
    3: "週三",
    4: "週四",
    5: "週五",
    6: "週六",
    7: "週日"
  };
  const normalized = Array.from(new Set(weekdays))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((a, b) => a - b);
  if (normalized.length === 0) {
    return "未設定";
  }
  return normalized.map((day) => labels[day]).join(", ");
}

function buildReminderHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Reminder 指令說明")
    .setDescription("以下是常用操作範例，請依需求替換參數。")
    .addFields(
      {
        name: "/reminder create",
        value:
          [
            "`/reminder create schedule_type:daily time:09:00 title:早安 content:開始今天工作 channel:#general`",
            "`/reminder create schedule_type:weekday time:18:00 weekdays:1,2,3,4,5 title:下班收尾 content:提交每日進度 channel:#general`",
            "weekday 格式：`1,2,3,4,5` 代表週一到週五（1=週一 ... 7=週日）"
          ].join("\n")
      },
      {
        name: "/reminder list",
        value: "`/reminder list` 查看目前伺服器所有提醒。"
      },
      {
        name: "/reminder update",
        value:
          [
            "`/reminder update id:<提醒ID> time:10:30`",
            "`/reminder update id:<提醒ID> title:新標題 content:新內容 enabled:true`"
          ].join("\n")
      },
      {
        name: "/reminder delete / delete_all",
        value:
          [
            "`/reminder delete` 後可多選提醒刪除。",
            "若要等同 delete_all，請在選單中全選全部提醒後送出。"
          ].join("\n")
      },
      {
        name: "/reminder timezone",
        value:
          [
            "`/reminder timezone show` 查看目前伺服器時區。",
            "`/reminder timezone set timezone:Asia/Taipei` 設定時區。"
          ].join("\n")
      }
    );
}

export async function handleReminderCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const subGroup = interaction.options.getSubcommandGroup(false);

  try {
    if (sub === "help") {
      await interaction.editReply({ embeds: [buildReminderHelpEmbed()] });
      return;
    }

    if (subGroup === "timezone" && sub === "show") {
      const guildId = interaction.guildId ?? "";
      const guildConfig = await getGuildConfig(guildId);
      await interaction.editReply(`目前伺服器時區為：\`${guildConfig.timezone}\``);
      return;
    }

    const requiresManagerRole = !(sub === "list" || sub === "help" || (subGroup === "timezone" && sub === "show"));
    if (requiresManagerRole) {
      const guildId = interaction.guildId ?? "";
      const guildConfig = await getGuildConfig(guildId);
      const member = interaction.member;
      const roleIds = Array.isArray((member as any)?.roles) ? ((member as any).roles as string[]) : [];
      const hasManagerRole =
        guildConfig.managerRoleIds.length === 0 ||
        guildConfig.managerRoleIds.some((r) => roleIds.includes(r));
      if (!hasManagerRole) {
        await interaction.editReply("你沒有管理提醒的權限。");
        return;
      }
    }

    if (subGroup === "timezone" && sub === "set") {
      const timezone = interaction.options.getString("timezone", true).trim();
      if (!isValidIanaTimezone(timezone)) {
        await interaction.editReply(
          [
            "時區格式無效，請使用 IANA 時區名稱。",
            "範例：`Asia/Taipei`、`Asia/Tokyo`、`UTC`"
          ].join("\n")
        );
        return;
      }
      const guildId = interaction.guildId ?? "";
      const result = await updateGuildTimezone(guildId, timezone);
      await interaction.editReply(`${result.message}\n目前時區：\`${timezone}\``);
      return;
    }

    if (sub === "create") {
      const rawScheduleType = interaction.options.getString("schedule_type", true);
      const scheduleType = normalizeScheduleType(rawScheduleType);
      const time = interaction.options.getString("time", true).trim();
      const weekdays = parseCsvNumbers(interaction.options.getString("weekdays"));
      const title = interaction.options.getString("title", true);
      const content = interaction.options.getString("content", true);
      const channel = interaction.options.getChannel("channel", true);

      if (!scheduleType) {
        await interaction.editReply("`schedule_type` 只支援 `daily` 或 `weekday`（不分大小寫）。");
        return;
      }

      const timeValidationError = validateReminderTimeHHmm(time);
      if (timeValidationError) {
        await interaction.editReply(timeValidationError);
        return;
      }

      if (scheduleType === "weekday") {
        if (!weekdays || weekdays.length === 0) {
          await interaction.editReply("`weekday` 模式必須提供 `weekdays`，例如：`1,2,3,4,5`（1=週一 ... 7=週日）。");
          return;
        }
        const hasInvalidWeekday = weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7);
        if (hasInvalidWeekday) {
          await interaction.editReply("`weekdays` 格式錯誤，請使用 1~7 的逗號清單，例如：`1,2,3,4,5`。");
          return;
        }
      }

      const result = await createReminder({
        guildId: interaction.guildId ?? "",
        channelId: channel.id,
        title,
        content,
        mentionRoleIds: [],
        scheduleType,
        timeHHmm: time,
        weekdays,
        createdBy: interaction.user.id
      });
      await interaction.editReply(result.message);
      return;
    }

    if (sub === "update") {
      const id = interaction.options.getString("id", true);
      const title = interaction.options.getString("title");
      const content = interaction.options.getString("content");
      const time = interaction.options.getString("time");
      const weekdays = parseCsvNumbers(interaction.options.getString("weekdays"));
      const enabled = interaction.options.getBoolean("enabled");

      if (time) {
        const timeValidationError = validateReminderTimeHHmm(time);
        if (timeValidationError) {
          await interaction.editReply(timeValidationError);
          return;
        }
      }

      const result = await updateReminder(id, {
        title: title ?? undefined,
        content: content ?? undefined,
        timeHHmm: time?.trim() ?? undefined,
        weekdays: weekdays ?? undefined,
        enabled: enabled ?? undefined
      });
      await interaction.editReply(result.message);
      return;
    }

    if (sub === "delete") {
      const reminders = await listReminders(interaction.guildId ?? "");
      if (reminders.reminders.length === 0) {
        await interaction.editReply("目前沒有提醒可刪除。");
        return;
      }
      const availableReminders = reminders.reminders.slice(0, DELETE_SELECT_MAX_OPTIONS);
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(buildDeleteSelectCustomId(interaction.user.id))
        .setPlaceholder("請勾選要刪除的提醒")
        .setMinValues(1)
        .setMaxValues(availableReminders.length)
        .addOptions(
          availableReminders.map((reminder) => ({
            label: truncateForDiscord(reminder.title, 100),
            description: truncateForDiscord(
              `${reminder.scheduleType} ${reminder.timeHHmm} | ${reminder.enabled ? "啟用" : "停用"}`,
              100
            ),
            value: reminder.reminderId
          }))
        );
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      const warning =
        reminders.reminders.length > DELETE_SELECT_MAX_OPTIONS
          ? `提醒數量超過 ${DELETE_SELECT_MAX_OPTIONS} 筆，請先刪除部分項目後再操作。`
          : "";

      await interaction.editReply({
        content: warning ? `請勾選要刪除的提醒。\n${warning}` : "請勾選要刪除的提醒。",
        components: [row]
      });
      return;
    }

    const result = await listReminders(interaction.guildId ?? "");
    if (result.reminders.length === 0) {
      await interaction.editReply("目前沒有提醒。");
      return;
    }
    const guildConfig = await getGuildConfig(interaction.guildId ?? "");
    const lines = result.reminders.map((r) => {
      const scheduleLine =
        r.scheduleType === "weekday"
          ? `排程：${formatScheduleTypeLabel(r.scheduleType)} ${r.timeHHmm}（${formatWeekdayList(r.weekdays)}）`
          : `排程：${formatScheduleTypeLabel(r.scheduleType)} ${r.timeHHmm}`;
      return [
        `【${r.title}】`,
        `ID：\`${r.reminderId}\``,
        scheduleLine,
        `狀態：${r.enabled ? "啟用" : "停用"}`
      ].join("\n");
    });
    await interaction.editReply([`目前時區：\`${guildConfig.timezone}\``, "", ...lines].join("\n\n"));
  } catch (error) {
    await interaction.editReply(toUserFacingErrorMessage(error));
  }
}

export async function handleReminderDeleteSelection(interaction: StringSelectMenuInteraction): Promise<void> {
  const ownerId = parseDeleteSelectCustomId(interaction.customId);
  if (!ownerId) {
    return;
  }
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "這不是你的刪除選單，請重新執行 /reminder delete。", ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  const selectedIds = Array.from(new Set(interaction.values));
  let successCount = 0;
  const failures: string[] = [];

  for (const reminderId of selectedIds) {
    try {
      await deleteReminder(reminderId);
      successCount += 1;
    } catch (error) {
      failures.push(`${reminderId}: ${getErrorMessage(error)}`);
    }
  }

  const lines = [`刪除完成：成功 ${successCount} 筆，失敗 ${failures.length} 筆。`];
  if (failures.length > 0) {
    lines.push(...failures.slice(0, 5).map((item) => `- ${item}`));
    if (failures.length > 5) {
      lines.push(`...其餘 ${failures.length - 5} 筆失敗，請稍後重試。`);
    }
  }

  await interaction.editReply({
    content: lines.join("\n"),
    components: []
  });
}
