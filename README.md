# Discord Reminder Bot (Spark-only)

Monorepo for a Discord reminder bot with separated bot I/O and server scheduling logic.

## Packages

- `apps/bot`: Discord slash command entrypoint and command UX.
- `apps/server`: Reminder API, due-bucket worker, retention cleanup worker.
- `packages/shared`: Shared types, constants, validation, and time utilities.

## Quick Start

1. Copy `.env.example` files in each app and fill values.
2. Install dependencies from root:
   - `npm install`
3. Build all packages:
   - `npm run build`
4. Start server and bot in separate terminals:
   - `npm run dev:server`
   - `npm run dev:bot`

## Notes

- This project is designed for Firebase Spark constraints.
- Worker logic uses UTC bucket keys and converts guild timezone rules at write-time.
