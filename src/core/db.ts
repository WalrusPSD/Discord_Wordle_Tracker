import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export type ResultRow = {
  discordUserId: string;
  puzzleNumber: number | null;
  dateISO: string; // YYYY-MM-DD
  guesses: number | null; // 1-6 when success
  failed: 0 | 1;
  raw: string;
};

export function openDb(dbFile = path.join(process.cwd(), 'data.sqlite')): any {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      discord_user_id TEXT PRIMARY KEY,
      display_name TEXT,
      first_seen_at TEXT
    );
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      puzzle_number INTEGER,
      date_iso TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS aliases (
      alias TEXT PRIMARY KEY,
      discord_user_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_user_id TEXT NOT NULL,
      game_id INTEGER NOT NULL,
      guesses INTEGER,
      failed INTEGER NOT NULL DEFAULT 0,
      raw TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(discord_user_id, game_id),
      FOREIGN KEY (discord_user_id) REFERENCES players(discord_user_id),
      FOREIGN KEY (game_id) REFERENCES games(id)
    );
  `);

	// Seed aliases from aliases.json if present
	try {
		const aliasPath = path.join(process.cwd(), 'aliases.json');
		if (fs.existsSync(aliasPath)) {
			const data = JSON.parse(fs.readFileSync(aliasPath, 'utf8')) as Record<string, string>;
			const stmt = db.prepare(`INSERT INTO aliases(alias, discord_user_id) VALUES(?, ?) ON CONFLICT(alias) DO UPDATE SET discord_user_id=excluded.discord_user_id`);
			for (const [alias, id] of Object.entries(data)) {
				stmt.run(alias.replace(/^@/, '').toLowerCase(), id);
			}
		}
	} catch (e) {
		// ignore seed errors
	}

  return db;
}

export function upsertResult(db: Database.Database, row: ResultRow) {
  const dateISO = row.dateISO;
  db.prepare(`INSERT OR IGNORE INTO players (discord_user_id, first_seen_at)
              VALUES (?, datetime('now'))`).run(row.discordUserId);
  db.prepare(`INSERT OR IGNORE INTO games (puzzle_number, date_iso)
              VALUES (?, ?)`)
    .run(row.puzzleNumber, dateISO);
  const game = db.prepare(`SELECT id FROM games WHERE date_iso = ?`).get(dateISO) as { id: number };
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO results (discord_user_id, game_id, guesses, failed, raw, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(discord_user_id, game_id) DO UPDATE SET
                guesses=excluded.guesses,
                failed=excluded.failed,
                raw=excluded.raw,
                updated_at=excluded.updated_at
            `).run(row.discordUserId, game.id, row.guesses, row.failed, row.raw, now, now);
}

export function setAlias(db: any, alias: string, discordUserId: string) {
  const key = alias.trim().toLowerCase().replace(/^@/, '');
  db.prepare(`INSERT INTO aliases(alias, discord_user_id) VALUES(?, ?)
              ON CONFLICT(alias) DO UPDATE SET discord_user_id=excluded.discord_user_id`).run(key, discordUserId);
}

export function getAlias(db: any, alias: string): string | null {
  const key = alias.trim().toLowerCase().replace(/^@/, '');
  const row = db.prepare(`SELECT discord_user_id FROM aliases WHERE alias = ?`).get(key) as { discord_user_id: string } | undefined;
  return row?.discord_user_id ?? null;
}

export function listAliases(db: any): { alias: string; discordUserId: string }[] {
  const rows = db.prepare(`SELECT alias, discord_user_id FROM aliases ORDER BY alias`).all() as any[];
  return rows.map(r => ({ alias: r.alias, discordUserId: r.discord_user_id }));
}

export type LeaderboardRow = {
  discordUserId: string;
  gamesPlayed: number;
  wins: number;
  failures: number;
  g1: number; g2: number; g3: number; g4: number; g5: number; g6: number;
  avgGuesses: number | null; // mean of guesses with failures counted as 7
  stdDev: number | null;
  total: number; // sum of (7 - guesses) for wins
  weightedAvg: number; // total / gamesPlayed
};

export function getLeaderboard(db: Database.Database): LeaderboardRow[] {
  const rows = db.prepare(`
    WITH wins_only AS (
      SELECT discord_user_id, guesses
      FROM results
      WHERE failed = 0
    ),
    agg AS (
      SELECT r.discord_user_id AS uid,
             COUNT(*) AS gamesPlayed,
             SUM(CASE WHEN r.failed = 1 THEN 1 ELSE 0 END) AS failures,
             SUM(CASE WHEN r.failed = 0 THEN 1 ELSE 0 END) AS wins,
             SUM(CASE WHEN r.guesses = 1 THEN 1 ELSE 0 END) AS g1,
             SUM(CASE WHEN r.guesses = 2 THEN 1 ELSE 0 END) AS g2,
             SUM(CASE WHEN r.guesses = 3 THEN 1 ELSE 0 END) AS g3,
             SUM(CASE WHEN r.guesses = 4 THEN 1 ELSE 0 END) AS g4,
             SUM(CASE WHEN r.guesses = 5 THEN 1 ELSE 0 END) AS g5,
             SUM(CASE WHEN r.guesses = 6 THEN 1 ELSE 0 END) AS g6,
             0 AS avgGuesses -- placeholder; compute in JS so failures count as 7
      FROM results r
      GROUP BY r.discord_user_id
    )
    SELECT a.uid AS discordUserId, a.gamesPlayed, a.wins, a.failures,
           a.g1, a.g2, a.g3, a.g4, a.g5, a.g6,
           a.avgGuesses
    FROM agg a
  `).all() as any[];

  const withDerived: LeaderboardRow[] = rows.map((r) => {
    const total = (r.g1*6) + (r.g2*5) + (r.g3*4) + (r.g4*3) + (r.g5*2) + (r.g6*1);
    const weightedAvg = r.gamesPlayed ? total / r.gamesPlayed : 0;
    // stddev over wins only using a second query per user for clarity
    return { ...r, total, weightedAvg, stdDev: null, avgGuesses: null } as LeaderboardRow;
  });

  // Compute avg and stddev counting failures as 7
  const stmt = db.prepare(`SELECT guesses, failed FROM results WHERE discord_user_id = ?`);
  for (const row of withDerived) {
    const vals = (stmt.all(row.discordUserId) as { guesses: number | null, failed: number }[])
      .map(v => v.failed ? 7 : (v.guesses ?? 7));
    if (vals.length === 0) { row.avgGuesses = null; row.stdDev = null; continue; }
    row.avgGuesses = vals.reduce((a,b)=>a+b,0) / vals.length;
    if (vals.length <= 1) { row.stdDev = 0; continue; }
    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
    const variance = vals.reduce((a,b)=>a+Math.pow(b-mean,2),0)/(vals.length-1);
    row.stdDev = Math.sqrt(variance);
  }

  // sort: weightedAvg desc, gamesPlayed desc, avgGuesses asc
  withDerived.sort((a,b)=>{
    if (b.weightedAvg !== a.weightedAvg) return b.weightedAvg - a.weightedAvg;
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
    const aAvg = a.avgGuesses ?? Infinity; const bAvg = b.avgGuesses ?? Infinity;
    return aAvg - bAvg;
  });
  return withDerived;
}


