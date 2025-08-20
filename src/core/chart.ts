import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { LeaderboardRow } from './db';
import { createCanvas } from 'canvas';

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

export async function renderTableImage(headers: string[], rows: string[][]): Promise<Buffer> {
  const maxRows = 15;
  const rowHeight = 36;
  const paddingX = 24;
  const paddingY = 22;
  const gutter = 12;
  const minColWidth = 70;
  const headerHeight = 44;
  const titleHeight = 32;

  // Compute dynamic widths per column based on content
  const canvasTmp = createCanvas(10, 10);
  const ctxTmp = canvasTmp.getContext('2d');
  ctxTmp.font = '14px "Inter", "SF Pro Text", system-ui, -apple-system, sans-serif';
  const colWidths = headers.map((h, idx) => {
    const headerWidth = ctxTmp.measureText(h).width + 14;
    const cellWidths = rows.slice(0, maxRows).map(r => (r[idx] ? ctxTmp.measureText(r[idx]).width + 14 : 0));
    const maxCell = cellWidths.length ? Math.max(...cellWidths) : 0;
    return Math.max(minColWidth, headerWidth, maxCell);
  });
  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + paddingX * 2 + gutter * (headers.length - 1);
  const totalHeight = paddingY * 2 + titleHeight + headerHeight + (Math.min(rows.length, maxRows)) * rowHeight;
  
  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, totalWidth, totalHeight);
  
  // Title
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '600 22px "Inter", "SF Pro Display", system-ui, -apple-system, sans-serif';
  ctx.fillText('Wordle Leaderboard', paddingX, paddingY + 18);
  
  // Headers
  const headerY = paddingY + titleHeight + 6;
  ctx.font = '600 14px "Inter", "SF Pro Text", system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#9fb6ff';
  let x = paddingX;
  for (let j = 0; j < headers.length; j++) {
    // Header background pill
    ctx.fillStyle = '#111a33';
    ctx.fillRect(x - 4, headerY - 18, colWidths[j]! + 8, 26);
    // Header text
    ctx.fillStyle = '#c9d6ff';
    ctx.fillText(headers[j] || '', x, headerY);
    x += colWidths[j]! + gutter;
  }
  
  // Data rows
  ctx.font = '14px "Inter", "SF Pro Text", system-ui, -apple-system, sans-serif';
  for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
    const row = rows[i];
    if (!row) continue;
    const y = paddingY + titleHeight + headerHeight + i * rowHeight + 6;
    // Zebra striping
    ctx.fillStyle = i % 2 === 0 ? '#0e1730' : '#0b1226';
    ctx.fillRect(paddingX - 6, y - 18, totalWidth - paddingX * 2 + 12, rowHeight - 4);
    // Text
    let colX = paddingX;
    for (let j = 0; j < row.length; j++) {
      const cell = row[j] || '';
      // Right-align numbers except Name
      const isNumeric = j !== 1;
      ctx.fillStyle = j === 1 ? '#e6e9f5' : '#cad5f6';
      if (isNumeric) {
        const m = ctx.measureText(cell);
        ctx.fillText(cell, colX + colWidths[j]! - m.width, y);
      } else {
        ctx.fillText(cell, colX, y);
      }
      colX += colWidths[j]! + gutter;
    }
  }
  
  return canvas.toBuffer('image/png');
}


