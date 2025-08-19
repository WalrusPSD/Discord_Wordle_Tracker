export type ParsedEntry = {
  userId: string;
  guesses: number | null; // null when failure
  failed: boolean;
};

export type ParsedMessage = {
  puzzleNumber: number | null;
  entries: ParsedEntry[];
};

const LINE_WIN = /^([1-6])\/6:\s+<@!?([0-9]+)>/;
const LINE_FAIL = /^[Xx]\/6:\s+<@!?([0-9]+)>/;
const TITLE_PUZZLE = /Wordle\s+No\.\s*(\d+)/i;

export function parseWordleSummary(content: string): ParsedMessage | null {
  if (!content) return null;
  const lines = content.split(/\r?\n/);
  const entries: ParsedEntry[] = [];
  let puzzleNumber: number | null = null;

  for (const line of lines) {
    const t = line.trim();
    const mTitle = TITLE_PUZZLE.exec(t);
    if (mTitle) {
      puzzleNumber = Number(mTitle[1]);
    }
    const mWin = LINE_WIN.exec(t);
    if (mWin) {
      const uid = mWin[2] ?? '';
      entries.push({ userId: uid, guesses: Number(mWin[1]), failed: false });
      continue;
    }
    const mFail = LINE_FAIL.exec(t);
    if (mFail) {
      const uid = (mFail[1] ?? mFail[2] ?? '') as string;
      entries.push({ userId: uid, guesses: null, failed: true });
      continue;
    }
  }

  if (entries.length === 0) return null;
  return { puzzleNumber, entries };
}


