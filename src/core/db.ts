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

export function openDb(dbFile = path.join(process.cwd(), 'data.sqlite')) {
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


