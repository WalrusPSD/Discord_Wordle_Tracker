export type ParsedEntry = {
  userId: string;
  guesses: number | null; // null when failure
  failed: boolean;
};

export type ParsedMessage = {
  puzzleNumber: number | null;
  entries: ParsedEntry[];
};

// Allow optional prefix like emoji or text before the score, and support multiple mentions per line.
const LINE_WIN_PREFIX = /(^|\s)([1-6])\/6\s*:\s*/i;
const LINE_FAIL_PREFIX = /(^|\s)X\/6\s*:\s*/i;
const MENTION_GLOBAL = /<@!?([0-9]+)>/g;
// Plain @name tokens – capture everything until next @ or line break (handles spaces like "@Zahir Hassan")
const PLAIN_AT_GLOBAL = /@([^@\n]+)/g;
const TITLE_PUZZLE = /Wordle\s+No\.\s*(\d+)/i;

export function parseWordleSummary(content: string): ParsedMessage | null {
  if (!content) return null;
  const lines = content.split(/\r?\n/);
  const entries: ParsedEntry[] = [];
  let puzzleNumber: number | null = null;

  for (const line of lines) {
    const t = line.trim();
    // Reset global regex state for each new line to avoid stale lastIndex across lines
    MENTION_GLOBAL.lastIndex = 0;
    PLAIN_AT_GLOBAL.lastIndex = 0;
    const mTitle = TITLE_PUZZLE.exec(t);
    if (mTitle) {
      puzzleNumber = Number(mTitle[1]);
    }
    const win = LINE_WIN_PREFIX.exec(t);
    if (win) {
      const score = Number(win[2]);
      const ids: string[] = [];
      let m: RegExpExecArray | null;
      while (true) {
        m = MENTION_GLOBAL.exec(t) as RegExpExecArray | null;
        if (!m) break;
        ids.push(m[1] ?? '');
      }
      if (ids.length === 0) {
        while (true) {
          m = PLAIN_AT_GLOBAL.exec(t) as RegExpExecArray | null;
          if (!m) break;
          const token = `@${(m[1] ?? '').trim().toLowerCase()}`;
          if (token !== '@') ids.push(token);
        }
      }
      for (const id of ids) {
        entries.push({ userId: id, guesses: score, failed: false });
      }
      continue;
    }
    if (LINE_FAIL_PREFIX.test(t)) {
      const ids: string[] = [];
      let m: RegExpExecArray | null;
      while (true) {
        m = MENTION_GLOBAL.exec(t) as RegExpExecArray | null;
        if (!m) break;
        ids.push(m[1] ?? '');
      }
      if (ids.length === 0) {
        while (true) {
          m = PLAIN_AT_GLOBAL.exec(t) as RegExpExecArray | null;
          if (!m) break;
          const token = `@${(m[1] ?? '').trim().toLowerCase()}`;
          if (token !== '@') ids.push(token);
        }
      }
      for (const id of ids) {
        entries.push({ userId: id, guesses: null, failed: true });
      }
      continue;
    }
  }

  if (entries.length === 0) return null;
  return { puzzleNumber, entries };
}


