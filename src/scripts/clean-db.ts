import { openDb } from '../core/db';

function parseFlags(argv: string[]) {
	const flags = new Set(argv);
	return {
		keepPlayers: flags.has('--keep-players'),
		dropAliases: flags.has('--drop-aliases'),
		vacuum: flags.has('--vacuum')
	};
}

async function main() {
	const { keepPlayers, dropAliases, vacuum } = parseFlags(process.argv.slice(2));
	const db = openDb();

	const count = (table: string): number => {
		const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
		return row.c;
	};

	const before = {
		results: count('results'),
		games: count('games'),
		players: count('players'),
		aliases: count('aliases'),
	};

	console.log('[db:clean] Before:', before);

	// Order matters to satisfy FKs when enabled: results -> games -> players
	db.exec('BEGIN');
	db.exec('DELETE FROM results');
	db.exec('DELETE FROM games');
	if (!keepPlayers) {
		db.exec('DELETE FROM players');
	}
	if (dropAliases) {
		// Note: aliases may be reseeded from aliases.json on next openDb()
		db.exec('DELETE FROM aliases');
	}
	db.exec('COMMIT');

	if (vacuum) {
		// Reclaim space after large deletions
		try {
			db.exec('VACUUM');
		} catch {}
	}

	const after = {
		results: count('results'),
		games: count('games'),
		players: count('players'),
		aliases: count('aliases'),
	};

	console.log('[db:clean] After:', after);
	console.log('[db:clean] Done. Default behavior cleared results and games; players cleared =', !keepPlayers, '; aliases cleared =', dropAliases);
}

main().catch((err) => {
	console.error('[db:clean] Error:', err);
	process.exit(1);
});


