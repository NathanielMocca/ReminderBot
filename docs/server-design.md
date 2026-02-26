# Server Module Design (`apps/server`)

## Responsibility

- Validate reminder input and enforce policy limits.
- Persist reminders and due bucket indexes in Firestore.
- Execute UTC due-bucket worker every minute.
- Maintain dispatch idempotency logs and retention cleanup.

## Firestore Collections

- `guilds/{guildId}`
  - `timezone`, `managerRoleIds[]`, `planTier`, `reminderLimit`, `activeReminderCount`
- `system_limits/global`
  - `freeReminderGlobalCap`, `freeReminderGlobalCount`, `freeCreateLocked`, `lockReason`, `updatedAt`
- `reminders/{reminderId}`
  - `guildId`, `channelId`, `title`, `content`, `mentionRoleIds[]`
  - `scheduleType`, `timeHHmm`, `timezone`, `weekdays[]`, `dueBucketKeys[]`
  - `enabled`, `createdBy`, `updatedAt`
- `due_buckets/{bucketKey}/items/{reminderId}`
  - `guildId`, `reminderRef`, `enabled`
- `dispatch_logs/{yyyyMMddHHmm}_{reminderId}`
  - `status`, `sentAt`, `errorCode`

## Write Path

1. Parse and validate input (`zod` schema in shared package).
2. Firestore transaction:
   - load `guilds/{guildId}`
   - load `system_limits/global`
   - enforce guild reminder limit
   - enforce global free cap
   - create reminder
   - update counters
   - create due bucket items

## UTC Worker

- Every minute:
  - if current minute is not divisible by 5, skip.
  - compute current UTC bucket keys: `daily_hhmm_utc` and `weekday_d_hhmm_utc`.
  - query due bucket items.
  - dedupe by `dispatch_logs` id.
  - send message to Discord API with allowed role mentions.

## Cleanup Job

- Runs daily by default.
- Deletes `dispatch_logs` older than 7 days in bounded batches.
- Goal: control Firestore storage under Spark 1 GiB limit.

## Scale Note

- `system_limits/global` is a single hot document.
- Current expected scale is safe.
- TODO when traffic grows: migrate global counter to distributed counters.
