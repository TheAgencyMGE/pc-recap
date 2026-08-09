import type { PCRecapAPI } from '../../shared/ipc';
import type { PeriodSummary } from '../../shared/types';

export type ShareCardFormat = 'portrait' | 'story';

export const getShareCardDimensions = (format: ShareCardFormat) => (
  format === 'story' ? { width: 1080, height: 1920 } : { width: 1080, height: 1350 }
);

export const getShareCardModel = (summary: PeriodSummary) => ({
  year: summary.label,
  hours: Math.round(summary.totalSeconds / 3600).toLocaleString(),
  favorite: summary.topApps[0]?.name ?? '',
  favoriteHours: Math.round((summary.topApps[0]?.seconds ?? 0) / 3600).toLocaleString(),
  apps: summary.topApps.slice(0, 3).map((app) => app.name),
  observation: summary.observations[0]?.text ?? '',
});

export const getShareCardFileName = (summaryLabel: string, format: ShareCardFormat) => (
  `PC-Recap-${summaryLabel}-${format}.png`
);

function writeRecapText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((text, index) => context.fillText(text, x, y + index * lineHeight));
}

function renderCard(summary: PeriodSummary, format: ShareCardFormat) {
  const model = getShareCardModel(summary);
  const { width, height } = getShareCardDimensions(format);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Share card rendering is unavailable.');

  const long = format === 'story';
  const margin = 72;
  const titleY = long ? 400 : 285;
  context.fillStyle = '#F6F6F1';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#AA9DFF';
  context.fillRect(0, 0, width, long ? 250 : 180);
  context.fillStyle = '#C9F227';
  context.fillRect(width - 168, 0, 168, height);
  context.fillStyle = '#FF6038';
  context.fillRect(0, height - (long ? 310 : 230), width, long ? 310 : 230);

  context.strokeStyle = '#151515';
  context.lineWidth = 4;
  context.strokeRect(30, 30, width - 60, height - 60);
  context.beginPath();
  context.moveTo(0, long ? 250 : 180);
  context.lineTo(width, long ? 250 : 180);
  context.moveTo(width - 168, 0);
  context.lineTo(width - 168, height);
  context.stroke();

  context.fillStyle = '#151515';
  context.font = '800 38px "Archivo Variable", Archivo, sans-serif';
  context.fillText('PC RECAP', margin, long ? 130 : 105);
  context.textAlign = 'right';
  context.fillText(model.year, width - 205, long ? 130 : 105);
  context.textAlign = 'left';

  context.font = `850 ${long ? 230 : 180}px "Archivo Variable", Archivo, sans-serif`;
  context.fillText(model.hours, margin, titleY + (long ? 190 : 145));
  context.font = `800 ${long ? 55 : 44}px "Archivo Variable", Archivo, sans-serif`;
  context.fillText('HOURS', margin, titleY + (long ? 260 : 205));

  const listY = titleY + (long ? 440 : 350);
  context.font = `650 ${long ? 42 : 34}px "Instrument Sans Variable", sans-serif`;
  model.apps.forEach((app, index) => {
    const y = listY + index * (long ? 100 : 76);
    context.fillText(`0${index + 1}`, margin, y);
    context.fillText(app, margin + 100, y);
    context.fillRect(margin + 100, y + 22, Math.max(80, 600 - index * 110), 6);
  });

  if (model.observation) {
    context.font = `750 ${long ? 52 : 39}px "Archivo Variable", Archivo, sans-serif`;
    writeRecapText(context, model.observation, margin, long ? 1320 : 955, width - 330, long ? 64 : 49, 3);
  }

  context.font = `800 ${long ? 42 : 34}px "Archivo Variable", Archivo, sans-serif`;
  if (model.favorite) context.fillText(`${model.favorite} WAS #1`, margin, height - (long ? 178 : 128));
  context.save();
  context.translate(width - 80, height - 70);
  context.rotate(-Math.PI / 2);
  context.font = '800 26px "Archivo Variable", Archivo, sans-serif';
  context.fillText(`PC RECAP / ${model.year}`, 0, 0);
  context.restore();
  return canvas;
}

export async function saveShareCard(summary: PeriodSummary, api: PCRecapAPI, format: ShareCardFormat = 'portrait') {
  const canvas = renderCard(summary, format);
  return api.saveShareCard(canvas.toDataURL('image/png'), getShareCardFileName(summary.label, format));
}
