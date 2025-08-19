import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events } from 'discord.js';
import { openDb, upsertResult } from './core/db';
import { parseWordleSummary } from './core/parser';
import { loadEnv } from './core/env';
import cron from 'node-cron';
import dayjs from 'dayjs';

const env = loadEnv();

const intents = [GatewayIntentBits.Guilds];
if (env.ENABLE_INGEST) {
  intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
}
const client = new Client({ intents });

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Ping -> Pong'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Show the Wordle leaderboard (placeholder)'),
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands((client.user as any).id, env.GUILD_ID), { body: commands });
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  await registerCommands();
  console.log('Slash commands registered');

  // Daily reminder (placeholder for now)
  cron.schedule('30 0 * * *', () => {
    const now = dayjs();
    console.log(`[cron] ${now.format('YYYY-MM-DD HH:mm:ss')} running daily job`);
  }, { timezone: env.TZ });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
  }
  if (interaction.commandName === 'leaderboard') {
    await interaction.reply('Leaderboard coming soon.');
  }
});

// Optional ingest (requires Message Content intent enabled in Developer Portal)
if (env.ENABLE_INGEST) {
  const db = openDb();
  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.channelId !== env.CHANNEL_ID) return;
    if (message.author.id !== env.WORDLE_BOT_ID) return;
    const parsed = parseWordleSummary(message.content || '');
    if (!parsed) return;
    const dateISO = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    for (const e of parsed.entries) {
      upsertResult(db, {
        discordUserId: e.userId,
        puzzleNumber: parsed.puzzleNumber,
        dateISO,
        guesses: e.failed ? null : e.guesses,
        failed: e.failed ? 1 : 0,
        raw: message.content || '',
      });
    }
    console.log(`ingested ${parsed.entries.length} result(s)`);
  });
}

client.login(env.DISCORD_TOKEN);
