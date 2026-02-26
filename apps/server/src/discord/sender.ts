import { REST, Routes } from "discord.js";
import { DISCORD_RETRY_MAX } from "@reminder/shared";
import { config } from "../config.js";

const rest = new REST({ version: "10" }).setToken(config.discordToken);

export async function sendReminderMessage(
  channelId: string,
  title: string,
  content: string,
  mentionRoleIds: string[] = []
): Promise<void> {
  let retries = 0;
  while (true) {
    try {
      const safeMentionRoleIds = Array.isArray(mentionRoleIds) ? mentionRoleIds : [];
      const mentions = safeMentionRoleIds.map((id) => `<@&${id}>`).join(" ");
      const payload = {
        content: mentions ? `${mentions}\n**${title}**\n${content}` : `**${title}**\n${content}`,
        allowed_mentions: {
          parse: [],
          roles: safeMentionRoleIds
        }
      };
      await rest.post(Routes.channelMessages(channelId), { body: payload });
      return;
    } catch (error: any) {
      const retryAfterMs = Number(error?.rawError?.retry_after ?? 0) * 1000;
      if (retryAfterMs > 0 && retries < DISCORD_RETRY_MAX) {
        retries += 1;
        await new Promise((r) => setTimeout(r, retryAfterMs * retries));
        continue;
      }
      throw error;
    }
  }
}
