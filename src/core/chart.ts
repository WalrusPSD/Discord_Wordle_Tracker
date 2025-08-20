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
  const rowHeight = 54;
  const paddingX = 48;
  const paddingY = 44;
  const gutter = 20;
  const minColWidth = 96;
  const headerHeight = 64;
  const titleHeight = 0; // no title
  const dpiScale = 3; // high DPI for sharp, large text

  // Compute dynamic widths per column based on content
  const canvasTmp = createCanvas(10, 10);
  const ctxTmp = canvasTmp.getContext('2d');
  ctxTmp.font = '22px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  const colWidths = headers.map((h, idx) => {
    const headerWidth = ctxTmp.measureText(h).width + 22;
    const cellWidths = rows.slice(0, maxRows).map(r => (r[idx] ? ctxTmp.measureText(r[idx]).width + 22 : 0));
    const maxCell = cellWidths.length ? Math.max(...cellWidths) : 0;
    const base = Math.max(idx === 1 ? 280 : minColWidth, headerWidth, maxCell);
    return base;
  });
  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + paddingX * 2 + gutter * (headers.length - 1);
  const rowCount = Math.min(rows.length, maxRows);
  const bottomPadding = 24;
  const totalHeight = paddingY + titleHeight + headerHeight + rowCount * rowHeight + bottomPadding;
  
  const canvas = createCanvas(totalWidth * dpiScale, totalHeight * dpiScale);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpiScale, dpiScale);
  
  // Background (solid red)
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(0, 0, totalWidth, totalHeight);
  
  // No title
  
  // Headers
  const headerY = paddingY + titleHeight + 12;
  ctx.font = '800 22px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  ctx.fillStyle = '#ffd1d9'; // light pink headers for contrast
  let x = paddingX;
  for (let j = 0; j < headers.length; j++) {
    const text = headers[j] || '';
    const m = ctx.measureText(text);
    const cx = x + (colWidths[j]! / 2);
    ctx.fillText(text, cx - m.width / 2, headerY);
    x += colWidths[j]! + gutter;
  }
  // Divider under headers
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(paddingX - 6, headerY + 10);
  ctx.lineTo(totalWidth - paddingX + 6, headerY + 10);
  ctx.stroke();
  
  // Data rows
  ctx.font = '20px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  for (let i = 0; i < rowCount; i++) {
    const row = rows[i];
    if (!row) continue;
    const y = paddingY + titleHeight + headerHeight + i * rowHeight + 14;
    // No zebra striping for maximal clarity
    // Text (centered for every column)
    let colX = paddingX;
    for (let j = 0; j < row.length; j++) {
      const cell = row[j] || '';
      ctx.fillStyle = '#ffffff';
      const m = ctx.measureText(cell);
      const cx = colX + (colWidths[j]! / 2);
      ctx.fillText(cell, cx - m.width / 2, y);
      colX += colWidths[j]! + gutter;
    }
  }
  
  return canvas.toBuffer('image/png');
}


