import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, TextChannel, Events } from 'discord.js';
import { loadEnv } from './core/env';
import cron from 'node-cron';
import dayjs from 'dayjs';

const env = loadEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

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

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot && message.author.id !== env.WORDLE_BOT_ID) return;
  if (message.channelId !== env.CHANNEL_ID) return;
  // Placeholder: log the incoming message for now
  console.log(`[msg] from ${message.author.tag}: ${message.content?.slice(0, 120)}`);
});

client.login(env.DISCORD_TOKEN);
