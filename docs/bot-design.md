# Bot Module Design (`apps/bot`)

## Responsibility

- Register slash commands.
- Receive interaction and respond quickly within Discord 3-second window.
- Forward create/update/delete/list requests to server API.
- Provide `/reminder help` usage guide via Discord embed.
- Handle `/reminder timezone show|set` for guild timezone display/config.
- Handle select-menu interaction for multi-delete flow.

## Command Contract

- `/reminder create`
  - `schedule_type`: `daily | weekday`
  - `time`: `HH:mm` and `mm % 5 == 0`
  - `weekdays`: required for `weekday` mode
  - `title`, `content`, `channel`
- `/reminder update`
  - `id` and partial fields
- `/reminder delete`
  - no additional fields in slash command
  - bot returns a multi-select menu for choosing reminders to delete
- `/reminder list`
  - no additional fields
- `/reminder help`
  - no additional fields
  - returns examples for `create/list/update/delete/delete_all/timezone`
- `/reminder timezone show`
  - no additional fields
  - reads guild timezone and returns it to user
- `/reminder timezone set`
  - `timezone`: IANA timezone string, e.g. `Asia/Taipei`
  - validates format before calling server API

## 3-Second ACK Strategy

- Always call `await interaction.deferReply({ ephemeral: true })` first.
- After server transaction completes, reply with `interaction.editReply()`.

## Permission Model

- `list/help/timezone show` can be used by all users.
- `create/update/delete/timezone set` require configured manager roles from server guild config.
- If guild has no manager roles configured, bot allows command for bootstrap stage.

## Failure Messages

- Guild limit reached:
  - `此伺服器已達免費方案提醒上限（4 筆），請先刪除舊提醒或升級方案。`
- Global free pool reached:
  - `目前免費方案提醒名額已滿（全域上限 10,000），暫時無法新增提醒。請稍後再試、刪除舊提醒，或升級方案。`
- Invalid timezone:
  - `時區格式無效，請使用 IANA 時區名稱。`
  - `範例：Asia/Taipei、Asia/Tokyo、UTC`

## Timezone Handling Rule

- Bot side timezone is used for user-facing input and response.
- Server converts schedule to UTC bucket keys at write time.
- Runtime worker dispatch remains UTC-only and does not depend on local timezone at send time.
