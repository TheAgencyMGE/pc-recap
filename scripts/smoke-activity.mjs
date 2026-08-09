import { WindowsActivitySource } from '../dist/main/activity-source.js';

const source = new WindowsActivitySource();

try {
  const activeWindow = await source.getActiveWindow();
  console.log(JSON.stringify(activeWindow));
} finally {
  source.dispose();
}
