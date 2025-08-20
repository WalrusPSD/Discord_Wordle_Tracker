import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events, AttachmentBuilder } from 'discord.js';
import { openDb, upsertResult, getLeaderboard, getAlias, listAliases, setAlias } from './core/db';
import { parseWordleSummary } from './core/parser';
import { loadEnv } from './core/env';
import cron from 'node-cron';
import dayjs from 'dayjs';
import { renderTableImage } from './core/chart';

const env = loadEnv();

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers];
if (env.ENABLE_INGEST) {
	intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
}
const client = new Client({ intents });

// Member cache for automatic alias resolution
type MemberLite = { id: string; displayName: string; username: string; normDisplay: string; normUsername: string };
const memberCache: Map<string, MemberLite> = new Map();
function normalizeName(input: string): string {
  return input.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9]/g, '');
}
async function buildMemberCache() {
  try {
    const guild = await client.guilds.fetch(env.GUILD_ID);
    if (!guild) return;
    const members = await guild.members.fetch();
    memberCache.clear();
    members.forEach((m) => {
      const normDisplay = normalizeName(m.displayName ?? '');
      const normUsername = normalizeName(m.user?.username ?? '');
      memberCache.set(m.id, { id: m.id, displayName: m.displayName, username: m.user?.username ?? '', normDisplay, normUsername });
    });
    console.log(`[alias] Cached ${memberCache.size} guild members`);
  } catch (e) {
    console.warn('[alias] Failed to build member cache. Automatic alias resolution may be limited.', e);
  }
}
function tryResolveAliasFromMembers(rawAlias: string): string | null {
  const key = normalizeName(rawAlias);
  if (!key) return null;
  // Exact match on displayName or username
  for (const m of memberCache.values()) {
    if (m.normDisplay === key || m.normUsername === key) return m.id;
  }
  // Starts with match
  const starts = Array.from(memberCache.values()).filter(m => m.normDisplay?.startsWith(key) || m.normUsername?.startsWith(key));
  if (starts.length === 1) return starts[0]!.id;
  // Includes match (last resort)
  const includes = Array.from(memberCache.values()).filter(m => m.normDisplay?.includes(key) || m.normUsername?.includes(key));
  if (includes.length === 1) return includes[0]!.id;
  return null;
}

const commands = [
	new SlashCommandBuilder().setName('ping').setDescription('Ping -> Pong'),
	new SlashCommandBuilder().setName('leaderboard').setDescription('Show the Wordle leaderboard')
		.addStringOption(o => o.setName('format').setDescription('Output format')
			.addChoices(
				{ name: 'image', value: 'image' },
				{ name: 'text', value: 'text' },
				{ name: 'csv', value: 'csv' },
			))
		.addIntegerOption(o => o.setName('page').setDescription('Page number (default 1)').setMinValue(1))
		.addIntegerOption(o => o.setName('page_size').setDescription('Rows per page (default 15)').setMinValue(5).setMaxValue(50)),
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
	const appId = client.user?.id as string | undefined;
	if (!appId) throw new Error('Client user is not ready');
	await rest.put(Routes.applicationGuildCommands(appId, env.GUILD_ID), { body: commands });
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

	// Warm up member cache for alias auto-resolution
	await buildMemberCache();
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
		// Options
		const format = interaction.options.getString('format') ?? 'image';
		const page = (interaction.options.getInteger('page') ?? 1) as number;
		const pageSize = Math.max(5, Math.min((interaction.options.getInteger('page_size') ?? 15) as number, 50));

		const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
		const currentPage = Math.max(1, Math.min(page, totalPages));
		const start = (currentPage - 1) * pageSize;
		const end = Math.min(start + pageSize, rows.length);
		const pageRows = rows.slice(start, end);

		// Resolve display names for current page only
		const guild = await client.guilds.fetch(env.GUILD_ID);
		const nameMap: Record<string, string> = {};
		for (const r of pageRows) {
			try {
				const m = await guild.members.fetch(r.discordUserId);
				nameMap[r.discordUserId] = m.displayName;
			} catch {
				try {
					const u = await client.users.fetch(r.discordUserId);
					nameMap[r.discordUserId] = u.username;
				} catch {
					nameMap[r.discordUserId] = r.discordUserId;
				}
			}
		}

		const headers = ['Rank','Name','Weighted Avg','Avg','SD','Games','Total','1','2','3','4','5','6','Fail'];
		const tableRows: string[][] = pageRows.map((r, i) => [
			String(start + i + 1),
			nameMap[r.discordUserId] || r.discordUserId,
			r.weightedAvg.toFixed(2),
			r.avgGuesses == null ? '-' : r.avgGuesses.toFixed(2),
			r.stdDev == null ? '-' : r.stdDev.toFixed(2),
			String(r.gamesPlayed),
			String(r.total),
			String(r.g1),String(r.g2),String(r.g3),String(r.g4),String(r.g5),String(r.g6),String(r.failures)
		]);

		const footer = `Page ${currentPage}/${totalPages} • Rows ${start + 1}-${end} of ${rows.length}`;

		if (format === 'text') {
			const widths = headers.map((_, j) =>
				Math.max(
					String(headers[j] ?? '').length,
					...tableRows.map(r => String(r[j] ?? '').length),
				)
			);
			const rightAlign = (j: number) => j !== 1;
			const pad = (v: string, w: number, ra: boolean) => ra ? v.toString().padStart(w) : v.toString().padEnd(w);
			const lines = [
				headers.map((h, j) => pad(h, (widths[j] ?? 0), rightAlign(j))).join('  '),
				widths.map((w) => '-'.repeat(w)).join('  '),
				...tableRows.map(row => row.map((c, j) => pad(String(c), (widths[j] ?? 0), rightAlign(j))).join('  ')),
			];
			await interaction.reply(`${footer}\n\`\`\`\n${lines.join('\n')}\n\`\`\``);
			return;
		}

		if (format === 'csv') {
			const csvSafe = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
			const csv = [
				headers.map(csvSafe).join(','),
				...tableRows.map(r => r.map(csvSafe).join(',')),
			].join('\n');
			const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: `leaderboard-page-${currentPage}.csv` });
			await interaction.reply({ content: footer, files: [file] });
			return;
		}

		// default image
		const png = await renderTableImage(headers, tableRows.slice(0, 15));
		await interaction.reply({ content: footer, files: [new AttachmentBuilder(png, { name: 'leaderboard.png' })] });
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
		const aliasMap = new Map<string, string>();
		for (const a of listAliases(db)) aliasMap.set(`@${a.alias}`, a.discordUserId);

		let fetched = 0;
		let scanned = 0;
		let parsedCount = 0;
		let ingested = 0;
		let skippedNoMatch = 0;
		let skippedAlias = 0;
		let lastId: string | undefined;

		const allLogs: string[] = [];
		const recent: string[] = [];
		const appendLog = (line: string) => {
			const stamp = new Date().toISOString();
			const text = `[${stamp}] ${line}`;
			allLogs.push(text);
			recent.push(text);
			if (recent.length > 12) recent.shift();
		};
		const renderStatus = () => {
			return [
				`Scanned: ${scanned} | Fetched: ${fetched} | Parsed msgs: ${parsedCount} | Entries saved: ${ingested} | Skipped (no match): ${skippedNoMatch} | Skipped (no alias): ${skippedAlias}`,
				'```',
				...recent.slice(-12),
				'```',
			].join('\n');
		};

		await interaction.editReply('Starting backfill...');

		let hadError = false;
		db.exec('BEGIN');
		try {
			while (fetched < limit) {
				const batch = await (channel as any).messages.fetch({ limit: Math.min(100, limit - fetched), before: lastId });
				if (batch.size === 0) break;
				fetched += batch.size;
				appendLog(`Fetched batch of ${batch.size} messages (total fetched=${fetched})`);
				for (const [, msg] of batch) {
					scanned++;
					const content = msg.content || '';
					if (!(/👑/.test(content) || /[1-6]\/6\s*:/.test(content) || /X\/6\s*:/.test(content))) {
						skippedNoMatch++;
						continue;
					}
					const parsed = parseWordleSummary(content);
					if (!parsed) {
						skippedNoMatch++;
						continue;
					}
					parsedCount++;
					appendLog(`📝 Parsed ${parsed.entries.length} entr${parsed.entries.length === 1 ? 'y' : 'ies'} | msgId=${msg.id} | ts=${new Date(msg.createdTimestamp || Date.now()).toISOString()} | snippet="${content.slice(0, 80).replace(/\n/g, ' ')}"`);
					const dateISO = dayjs(msg.createdTimestamp || Date.now()).subtract(1, 'day').format('YYYY-MM-DD');
					for (const e of parsed.entries) {
						let uid = e.userId;
						if (uid.startsWith('@')) {
							let mapped = aliasMap.get(uid) || getAlias(db, uid);
							if (!mapped) {
								const resolved = tryResolveAliasFromMembers(uid);
								if (resolved) {
									setAlias(db, uid, resolved);
									aliasMap.set(uid, resolved);
									appendLog(`🔁 Auto-added alias ${uid} → ${resolved} from guild members`);
									mapped = resolved;
								}
							}
							if (!mapped) {
								skippedAlias++;
								appendLog(`❌ Missing alias for ${uid} (date=${dateISO})`);
								continue;
							}
							if (mapped !== uid) {
								appendLog(`✅ Alias ${uid} → ${mapped}`);
							}
							uid = mapped;
						}
						upsertResult(db, {
							discordUserId: uid,
							puzzleNumber: parsed.puzzleNumber,
							dateISO,
							guesses: e.failed ? null : e.guesses,
							failed: e.failed ? 1 : 0,
							raw: content,
						});
						ingested++;
					}
				}
				lastId = batch.last()?.id;
				await interaction.editReply(renderStatus());
			}
			db.exec('COMMIT');
		} catch (err: any) {
			hadError = true;
			try { db.exec('ROLLBACK'); } catch {}
			appendLog(`❗ Error during backfill: ${err?.message || String(err)}`);
		} 

		const summary = `Backfill complete. Scanned ${scanned} messages (fetched=${fetched}). Parsed ${parsedCount} messages, saved ${ingested} entries. Skipped: no match=${skippedNoMatch}, no alias=${skippedAlias}.`;
		appendLog(summary);
		await interaction.editReply(renderStatus());
		const logText = allLogs.join('\n');
		const attachment = new AttachmentBuilder(Buffer.from(logText, 'utf8'), { name: 'backfill-log.txt' });
		await interaction.followUp({ content: summary, files: [attachment] });
	}
	if (interaction.commandName === 'alias') {
		const sub = interaction.options.getSubcommand();
		const db = openDb();
		if (sub === 'set') {
			const name = interaction.options.getString('name', true);
			const user = interaction.options.getUser('user', true);
			setAlias(db, name, user.id);
			await interaction.reply(`Mapped ${name} → <@${user.id}>`);
			return;
		}
		if (sub === 'list') {
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
				const mapped = getAlias(db, uid);
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
