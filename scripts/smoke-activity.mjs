import { createPlatformActivitySource } from '../dist/main/activity-source.js';

const selection = createPlatformActivitySource();

try {
  try {
    const activeWindow = await selection.source.getActiveWindow();
    console.log(JSON.stringify({ collector: selection.id, available: selection.available, reason: selection.reason, sampleAvailable: Boolean(activeWindow) }));
  } catch (error) {
    console.log(JSON.stringify({
      collector: selection.id,
      available: selection.available,
      reason: selection.reason,
      sampleAvailable: false,
      sampleError: error instanceof Error ? error.message : 'Collector sample unavailable in this environment.',
    }));
  }
} finally {
  selection.source.dispose?.();
}
