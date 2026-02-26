import "dotenv/config";
import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import {
  reminderCommand,
  handleReminderCommand,
  handleReminderDeleteSelection,
  isReminderDeleteSelectCustomId
} from "./commands/reminder.js";

const token = process.env.DISCORD_BOT_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !applicationId || !guildId) {
  throw new Error("Missing DISCORD_BOT_TOKEN / DISCORD_APPLICATION_ID / DISCORD_GUILD_ID");
}

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token!);
  await rest.put(Routes.applicationGuildCommands(applicationId!, guildId!), {
    body: [reminderCommand.toJSON()]
  });
}

async function bootstrap(): Promise<void> {
  await registerCommands();

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Bot logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      if (interaction.isStringSelectMenu() && isReminderDeleteSelectCustomId(interaction.customId)) {
        await handleReminderDeleteSelection(interaction);
      }
      return;
    }
    if (interaction.commandName === "reminder") {
      await handleReminderCommand(interaction);
    }
  });

  await client.login(token!);
  
  // 處理關閉訊號，確保能用 Ctrl+C 停止
  function shutdown() {
    console.log("Shutting down bot...");
    client.destroy();
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
