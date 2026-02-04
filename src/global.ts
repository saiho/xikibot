import type { XikibotExtension } from './xikibot';

export const ON_CHANGE_NORMAL_DEBOUNCE_TIME = 2000;
export const ON_CHANGE_QUICK_DEBOUNCE_TIME = 750;
export const CLOSE_DB_DEBOUNCE_TIME = 5000;

export const QUIET_SINCE = { hour: 22, minute: 30 } as const;
export const QUIET_UNTIL = { hour: 6, minute: 30 } as const;

export const LATITUDE = 51.058825;
export const LONGITUDE = 3.688805;

export const API_PORT = 9294;

export const DB_FILENAME = '/app/data/xikibot.sqlite';
export const DB_VACUUM_WRITE_FREQUENCY = 500; // Compact DB every 100 writes

export const LOG_NAMESPACE = 'z2m:xikibot';

export const CH1 = 'state_l1';
export const CH2 = 'state_l2';
export const FAN_TOILET_DOWNSTAIRS_LOW_SPEED = CH1;
export const FAN_TOILET_DOWNSTAIRS_FULL_SPEED = CH2;

// Used to perform conversion of channel to number when storing values in the DB.
// In case of multiple active channels, the higher level is the one stored in the DB.
export const FAN_TOILET_CHANNEL_LEVEL = {
  [FAN_TOILET_DOWNSTAIRS_LOW_SPEED]: 1,
  [FAN_TOILET_DOWNSTAIRS_FULL_SPEED]: 2,
} as const;

/**
 * Put this outside of xikibot.ts to avoid circular dependencies between xikibot.ts and other modules because bundlers
 * and Vitest can have issues with circular dependencies.
 */
export let xikibotInstance: XikibotExtension | undefined;

export function setXikibotInstance(_xikibotInstance: XikibotExtension) {
  xikibotInstance = _xikibotInstance;
};
