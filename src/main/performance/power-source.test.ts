// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseLinuxPowerStatus, parseMacPowerStatus, parseWindowsPowerStatus } from './power-source';

describe('platform power parsing', () => {
  it('parses Windows power status without treating an absent battery as zero', () => {
    expect(parseWindowsPowerStatus('{"acLineStatus":1,"batteryFlag":8,"batteryPercent":83}')).toEqual({
      batteryPercent: 83,
      powerState: 'charging',
    });
    expect(parseWindowsPowerStatus('{"acLineStatus":1,"batteryFlag":128,"batteryPercent":255}')).toEqual({
      powerState: 'ac',
    });
  });

  it('parses macOS and Linux battery states from their native status formats', () => {
    expect(parseMacPowerStatus("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t76%; discharging; 4:10 remaining present: true")).toEqual({
      batteryPercent: 76,
      powerState: 'battery',
    });
    expect(parseLinuxPowerStatus({ capacity: '51', status: 'Charging' })).toEqual({
      batteryPercent: 51,
      powerState: 'charging',
    });
    expect(parseLinuxPowerStatus({})).toEqual({});
  });
});
