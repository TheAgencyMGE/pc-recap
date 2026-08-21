const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const rounded = (value, precision = 3) => Number(value.toFixed(precision));

export function scrollProgress({ top, height, viewportHeight }) {
  const travel = Math.max(1, height - viewportHeight);
  return clamp(-top / travel);
}

export function storyFrame(progress, cardCount) {
  const count = Math.max(0, Math.floor(Number.isFinite(cardCount) ? cardCount : 0));
  if (count === 0) return { chapter: 0, cards: [] };

  const normalized = clamp(Number.isFinite(progress) ? progress : 0);
  const position = normalized * Math.max(0, count - 1);
  const chapter = clamp(Math.round(position), 0, count - 1);
  const cards = Array.from({ length: count }, (_, index) => {
    const distance = rounded(index - position);
    const magnitude = Math.abs(distance);
    return {
      distance,
      opacity: rounded(clamp(1 - magnitude * 0.64, 0.12, 1)),
      rotate: rounded(distance * 7, 2),
      scale: rounded(1 - Math.min(magnitude, 1) * 0.08),
      x: rounded(distance * 24, 2),
      y: rounded(distance * 112, 2),
      z: Math.max(0, count - Math.round(magnitude)),
    };
  });

  return { chapter, cards };
}
