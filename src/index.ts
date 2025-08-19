import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events, AttachmentBuilder } from 'discord.js';
import { openDb, upsertResult, getLeaderboard } from './core/db';
import { parseWordleSummary } from './core/parser';
import { loadEnv } from './core/env';
import cron from 'node-cron';
import dayjs from 'dayjs';
import { renderAvgGuessChart } from './core/chart';

const env = loadEnv();

const intents = [GatewayIntentBits.Guilds];
if (env.ENABLE_INGEST) {
	intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
}
const client = new Client({ intents });

const commands = [
	new SlashCommandBuilder().setName('ping').setDescription('Ping -> Pong'),
	new SlashCommandBuilder().setName('leaderboard').setDescription('Show the Wordle leaderboard'),
	new SlashCommandBuilder().setName('backfill').setDescription('Backfill past Wordle messages')
		.addIntegerOption(o => o.setName('limit').setDescription('How many messages to scan (default 500)').setMinValue(50).setMaxValue(5000)),
	new SlashCommandBuilder().setName('alias').setDescription('Manage aliases')
		.addSubcommand(s => s.setName('set').setDescription('Set alias mapping')
			.addStringOption(o => o.setName('name').setDescription('Plain @name, e.g. @anika').setRequired(true))
			.addUserOption(o => o.setName('user').setDescription('Discord user').setRequired(true)))
		.addSubcommand(s => s.setName('list').setDescription('List aliases')),
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
		const db = openDb();
		const rows = getLeaderboard(db);
		if (rows.length === 0) {
			await interaction.reply('No results yet.');
			return;
		}
		const header = ['Rank','User','Weighted Avg','Avg','SD','Games','Total','1','2','3','4','5','6','Fail'].join(' | ');
		const lines = rows.slice(0, 15).map((r, i) => [
			String(i+1),
			`<@${r.discordUserId}>`,
			r.weightedAvg.toFixed(2),
			r.avgGuesses == null ? '-' : r.avgGuesses.toFixed(2),
			r.stdDev == null ? '-' : r.stdDev.toFixed(2),
			String(r.gamesPlayed),
			String(r.total),
			String(r.g1),String(r.g2),String(r.g3),String(r.g4),String(r.g5),String(r.g6),String(r.failures)
		].join(' | '));
		const mentions = rows.slice(0, 10).map(r => `<@${r.discordUserId}>`);
		const png = await renderAvgGuessChart(rows, mentions);
		const file = new AttachmentBuilder(png, { name: 'leaderboard.png' });
		const table = '```\n' + header + '\n' + lines.join('\n') + '\n```';
		await interaction.reply({ content: table, files: [file] });
	}
	if (interaction.commandName === 'backfill') {
		const limit = interaction.options.getInteger('limit') ?? 500;
		if (!env.ENABLE_INGEST) {
			await interaction.reply('Ingest is disabled. Set ENABLE_INGEST=true in .env and restart.');
			return;
		}
		await interaction.deferReply();
		const channel = await client.channels.fetch(env.CHANNEL_ID);
		if (!channel || !channel.isTextBased()) {
			await interaction.editReply('Configured channel not found or not text-based.');
			return;
		}
		const db = openDb();
		let fetched = 0;
		let ingested = 0;
		let lastId: string | undefined;
		while (fetched < limit) {
			const batch = await (channel as any).messages.fetch({ limit: Math.min(100, limit - fetched), before: lastId });
			if (batch.size === 0) break;
			for (const [, msg] of batch) {
				// Don't require a specific author; rely on parser match instead
				const parsed = parseWordleSummary(msg.content || '');
				if (!parsed) continue;
				const dateISO = new Date(msg.createdTimestamp || Date.now()).toISOString().slice(0,10);
				for (const e of parsed.entries) {
					let uid = e.userId;
					if (uid.startsWith('@')) {
						const { getAlias } = await import('./core/db');
						const mapped = getAlias(openDb(), uid);
						if (!mapped) continue;
						uid = mapped;
					}
					upsertResult(db, {
						discordUserId: uid,
						puzzleNumber: parsed.puzzleNumber,
						dateISO,
						guesses: e.failed ? null : e.guesses,
						failed: e.failed ? 1 : 0,
						raw: msg.content || '',
					});
					ingested++;
				}
			}
			fetched += batch.size;
			lastId = batch.last()?.id;
		}
		await interaction.editReply(`Backfill complete. Scanned ${fetched} messages, ingested ${ingested} rows.`);
	}
	if (interaction.commandName === 'alias') {
		const sub = interaction.options.getSubcommand();
		const db = openDb();
		if (sub === 'set') {
			const name = interaction.options.getString('name', true);
			const user = interaction.options.getUser('user', true);
			const { setAlias } = await import('./core/db');
			setAlias(db, name, user.id);
			await interaction.reply(`Mapped ${name} → <@${user.id}>`);
			return;
		}
		if (sub === 'list') {
			const { listAliases } = await import('./core/db');
			const all = listAliases(db);
			if (all.length === 0) { await interaction.reply('No aliases set.'); return; }
			const list = all.map(a => `${a.alias} → <@${a.discordUserId}>`).join('\n');
			await interaction.reply('```\n' + list + '\n```');
			return;
		}
	}
});

// Optional ingest (requires Message Content intent enabled in Developer Portal)
if (env.ENABLE_INGEST) {
	const db = openDb();
	client.on(Events.MessageCreate, async (message) => {
		if (!message.guild || message.channelId !== env.CHANNEL_ID) return;
		// Keep author filter for live ingest to reduce false positives
		if (message.author.id !== env.WORDLE_BOT_ID) return;
		const parsed = parseWordleSummary(message.content || '');
		if (!parsed) return;
		const dateISO = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
		for (const e of parsed.entries) {
			let uid = e.userId;
			if (uid.startsWith('@')) {
				const { getAlias } = await import('./core/db');
				const mapped = getAlias(openDb(), uid);
				if (!mapped) return;
				uid = mapped;
			}
			upsertResult(db, {
				discordUserId: uid,
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
