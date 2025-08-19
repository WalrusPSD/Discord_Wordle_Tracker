import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { LeaderboardRow } from './db';

const width = 1100;
const height = 550;

export async function renderLeaderboardChart(rows: LeaderboardRow[], labels: string[]): Promise<Buffer> {
  const top = Math.min(rows.length, labels.length, 10);
  const r = rows.slice(0, top);
  const l = labels.slice(0, top);

  const dataByGuess = [1,2,3,4,5,6].map((g) => r.map((row) => (row as any)[`g${g}`] as number));

  const colors = ['#2ecc71','#27ae60','#f1c40f','#e67e22','#e74c3c','#8e44ad'];

  const chart = new ChartJSNodeCanvas({ width, height, backgroundColour: '#111827' });
  const configuration = {
    type: 'bar' as const,
    data: {
      labels: l,
      datasets: dataByGuess.map((values, idx) => ({
        label: `${idx+1} guesses`,
        data: values,
        backgroundColor: colors[idx],
        borderWidth: 0,
        borderRadius: 2,
        stack: 'guesses',
      })),
    },
    options: {
      responsive: false,
      plugins: {
        legend: { labels: { color: '#e5e7eb' } },
        title: { display: true, text: 'Wordle Wins by Guess Count (Top 10)', color: '#e5e7eb' },
      },
      scales: {
        x: { stacked: true, ticks: { color: '#cbd5e1' }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#cbd5e1' } },
      },
    },
  };
  return await chart.renderToBuffer(configuration, 'image/png');
}

export async function renderAvgGuessChart(rows: LeaderboardRow[], names: string[]): Promise<Buffer> {
  const top = Math.min(rows.length, names.length, 10);
  const subset = rows
    .map((r, idx) => ({ ...r, name: names[idx] }))
    .sort((a, b) => {
      const aAvg = a.avgGuesses ?? Infinity;
      const bAvg = b.avgGuesses ?? Infinity;
      if (aAvg !== bAvg) return aAvg - bAvg; // lower is better
      return b.gamesPlayed - a.gamesPlayed;
    })
    .slice(0, top);

  const chart = new ChartJSNodeCanvas({ width, height, backgroundColour: '#111827' });
  const configuration = {
    type: 'bar' as const,
    data: {
      labels: subset.map(s => s.name),
      datasets: [{
        label: 'Average guesses (lower is better)',
        data: subset.map(s => Number((s.avgGuesses ?? 0).toFixed(2))),
        backgroundColor: '#60a5fa',
        borderWidth: 0,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y' as const,
      responsive: false,
      plugins: {
        legend: { labels: { color: '#e5e7eb' } },
        title: { display: true, text: 'Wordle Average Guesses (Top 10)', color: '#e5e7eb' },
      },
      scales: {
        x: { ticks: { color: '#cbd5e1' }, grid: { display: false }, min: 1, max: 6 },
        y: { ticks: { color: '#cbd5e1' } },
      },
    },
  };
  return await chart.renderToBuffer(configuration, 'image/png');
}


