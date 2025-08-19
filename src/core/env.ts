import * as dotenv from 'dotenv';

dotenv.config();

const required = [
  'DISCORD_TOKEN',
  'GUILD_ID',
  'CHANNEL_ID',
  'LEADERBOARD_POST_CHANNEL_ID',
  'WORDLE_BOT_ID',
  'TZ',
] as const;

type RequiredKey = typeof required[number];

type Env = Record<RequiredKey, string> & {
  ENABLE_INGEST: boolean;
};

export function loadEnv(): Env {
  const base = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN!,
    GUILD_ID: process.env.GUILD_ID!,
    CHANNEL_ID: process.env.CHANNEL_ID!,
    LEADERBOARD_POST_CHANNEL_ID: process.env.LEADERBOARD_POST_CHANNEL_ID!,
    WORDLE_BOT_ID: process.env.WORDLE_BOT_ID!,
    TZ: process.env.TZ!,
  };

  for (const key of required) {
    const value = base[key];
    if (!value) {
      throw new Error(`Missing env: ${key}`);
    }
  }

  const env: Env = {
    ...base,
    ENABLE_INGEST: (process.env.ENABLE_INGEST || 'false').toLowerCase() === 'true',
  };

  process.env.TZ = env.TZ;
  return env;
}
