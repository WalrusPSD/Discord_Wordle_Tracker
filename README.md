## Discord Wordle Tracker

Track Wordle results in a Discord server, compute leaderboards, and render outputs as image, text, or CSV.

### Features
- **Slash commands**: `ping`, `leaderboard`, `backfill`, `alias` (set/list)
- **Leaderboard views**: PNG image table, monospaced text, or CSV export
- **Backfill**: scan historical messages to ingest prior Wordle results
- **Aliases**: map `@name` to a Discord user for historical posts
- **SQLite storage**: fast and simple persistence with `better-sqlite3`
- **Cron-ready**: placeholder daily job configured via timezone

### Prerequisites
- Node.js 20+
- A Discord Application with a Bot user
  - Scopes: `bot`, `applications.commands`
  - Privileged Intents: enable **Server Members**. Enable **Message Content** if using ingest/backfill.

### Environment variables
Create a `.env` file in the project root:

```env
DISCORD_TOKEN=your-bot-token
GUILD_ID=123456789012345678
CHANNEL_ID=123456789012345678
LEADERBOARD_POST_CHANNEL_ID=123456789012345678
WORDLE_BOT_ID=the-wordle-results-bot-user-id
TZ=UTC
ENABLE_INGEST=false

# Optional: change where the SQLite DB is stored (defaults to ./data.sqlite)
# DB_FILE=/absolute/or/relative/path/to/data.sqlite
```

Notes:
- `ENABLE_INGEST=true` requires Message Content intent enabled in the Developer Portal.
- `TZ` controls cron timezone and process timezone.
- `DB_FILE` overrides the SQLite path (by default `process.cwd()/data.sqlite`).

### Install and run locally
```bash
npm install
npm run dev
```

Once the bot logs in the first time, slash commands are registered automatically for your guild.

#### Package scripts
- `npm run dev`: run with ts-node for local development
- `npm run register`: run index in register-only mode (kept for convenience; normal start also registers)
- `npm run build`: compile TypeScript to `dist/`
- `npm start`: run built code (`node dist/index.js`)
- `npm run db:clean`: remove and reinit the SQLite DB (see `src/scripts/clean-db.ts`)

### Commands
- **/ping**: health check
- **/leaderboard**
  - **format**: `image` (default) | `text` | `csv`
  - **page**: page number (default 1)
  - **page_size**: 5–50 (default 15)
- **/backfill**
  - **limit**: how many messages to scan (50–5000, default 500)
  - Requires `ENABLE_INGEST=true` and Message Content intent.
- **/alias**
  - `set name:@alias user:@DiscordUser`
  - `list`

### How ingest/backfill works
- Live ingest listens for messages from the configured `WORDLE_BOT_ID` in `CHANNEL_ID` and parses Wordle summaries.
- Backfill pages through message history, parses historical summaries, and writes entries in a single transaction.
- Aliases resolve `@name` to a Discord user when historical posts don’t tag users.
- You can seed aliases by committing an `aliases.json` at repo root: `{ "@anika": "123...", "@bob": "456..." }` (auto-loaded on boot).

### Database
- SQLite via `better-sqlite3` with WAL journaling.
- Schema lives in `src/core/db.ts` and is created automatically on startup.
- Default file is `./data.sqlite`; set `DB_FILE` to relocate (e.g., to a mounted volume in Docker/Render).

### Docker
Build and run with a local data volume:

```bash
docker build -t wordle-bot .
docker run --rm -it \
  -e DISCORD_TOKEN=... \
  -e GUILD_ID=... \
  -e CHANNEL_ID=... \
  -e LEADERBOARD_POST_CHANNEL_ID=... \
  -e WORDLE_BOT_ID=... \
  -e TZ=UTC \
  -e ENABLE_INGEST=false \
  -e DB_FILE=/data/data.sqlite \
  -v $(pwd)/.local-data:/data \
  wordle-bot
```

### Deploy on Render (recommended for gateway bots)
This repo includes `Dockerfile` and `render.yaml` to run as a **Worker** with a persistent disk.

1) Create from blueprint in Render, select this repo.
2) Fill env vars in the dashboard. The blueprint sets `DB_FILE=/data/data.sqlite` and mounts a 1GB disk at `/data`.
3) Deploy. The service runs `node dist/index.js` and logs `Logged in as ...` on success.

### Cloudflare Workers (HTTP interactions model)
Cloudflare Workers can’t run the gateway websocket or native Node modules used here (e.g., `canvas`, `better-sqlite3`). To deploy on Workers, migrate to the **HTTP Interactions** model and Cloudflare D1 for storage. See the official tutorial: [Hosting on Cloudflare Workers](https://discord.com/developers/docs/tutorials/hosting-on-cloudflare-workers).

High-level changes needed for Workers:
- Replace the gateway client with an Interactions HTTP endpoint (verify Ed25519 signatures).
- Store data in Cloudflare D1 instead of local SQLite.
- Render text/CSV leaderboard; for images, call a hosted chart service instead of `canvas`.

### Troubleshooting
- **Slash commands don’t appear**: ensure the bot was invited with `applications.commands` and `GUILD_ID` matches your server. Allow a minute after first start.
- **“Missing env” errors**: check your `.env` matches the required variables above.
- **Image rendering issues**: the Docker image installs system fonts; verify `TZ` and try `text` or `csv` format as a fallback.
- **Ingest not working**: set `ENABLE_INGEST=true`, enable Message Content intent, and verify `WORDLE_BOT_ID` and `CHANNEL_ID`.

### License
MIT (or your preferred license). Update this section if you choose a different license.
