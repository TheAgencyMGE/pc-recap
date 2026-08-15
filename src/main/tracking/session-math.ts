export function idleEndTime(now: Date, idleSeconds: number, startedAt: Date): Date {
  const calculated = now.getTime() - Math.max(0, idleSeconds) * 1_000;
  return new Date(Math.max(startedAt.getTime(), calculated));
}

export function transitionMidpoint(lastSampleAt: Date, sampledAt: Date): Date {
  const start = lastSampleAt.getTime();
  const end = Math.max(start, sampledAt.getTime());
  return new Date(start + Math.round((end - start) / 2));
}
