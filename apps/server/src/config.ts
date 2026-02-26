import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8080),
  apiToken: process.env.SERVER_API_TOKEN ?? "",
  discordToken: process.env.DISCORD_BOT_TOKEN ?? "",
  reminderChannelFallback: process.env.DISCORD_FALLBACK_CHANNEL_ID ?? "",
  workerIntervalMs: Number(process.env.WORKER_INTERVAL_MS ?? 60_000),
  cleanupIntervalMs: Number(process.env.CLEANUP_INTERVAL_MS ?? 24 * 60 * 60 * 1000)
};

if (!config.apiToken) {
  throw new Error("SERVER_API_TOKEN is required");
}
