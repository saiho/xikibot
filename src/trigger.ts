import { getSunrise, getSunset } from 'sunrise-sunset-js';
import { LATITUDE, LONGITUDE } from './global';

export interface Delay {
  hours?: number;
  minutes?: number;
  seconds?: number;
}

export type Schedule
  = { scheduled: 'atFixedTime'; hour: number; /* from 0 to 23 */ minute?: number; /* from 0 to 59 */ second?: number /* from 0 to 59 */ }
    | { scheduled: 'atSunrise' | 'atSunset' }
    | ({ scheduled: 'beforeSunrise' | 'afterSunrise' | 'beforeSunset' | 'afterSunset' | 'every' } & Delay);

export interface Trigger {
  id: string;
  when: Date;
  schedule?: Schedule;
  callback: () => void;
}

let triggers: Trigger[] = [];

export function addDelayedTrigger(
  id: string,
  callback: () => void,
  delay: Delay,
  options?: { allowMultiple?: boolean; keepLatest?: boolean },
): void {
  const when = new Date();
  when.setSeconds(when.getSeconds() + totalSeconds(delay));

  if (!options?.allowMultiple) {
    if (options?.keepLatest && triggers.find(trigger => trigger.id === id && trigger.when > when)) {
      return;
    }
    clearTriggers(id);
  }

  triggers.push({ id: id, when: when, callback: callback });
}

export function addScheduledTrigger(
  id: string,
  callback: () => void,
  schedule: Schedule,
  allowMultiple?: boolean,
): void {
  if (!allowMultiple) {
    clearTriggers(id);
  }

  const when = calculateNextExecution(schedule);
  triggers.push({ id: id, when: when, schedule: schedule, callback: callback });
}

export function clearTriggers(id?: string): void {
  if (id) {
    triggers = triggers.filter(trigger => trigger.id !== id);
  }
  else {
    triggers = [];
  }
}

export function runTriggers(): void {
  const runningTriggers = triggers;
  triggers = [];
  const now = new Date();

  // Do not use, triggers = triggers.filter(…) to remove expired triggers, because triggers added in callbacks would be lost
  for (const trigger of runningTriggers) {
    if (trigger.when < now) {
      trigger.callback();
      if (trigger.schedule) {
        trigger.when = calculateNextExecution(trigger.schedule);
        triggers.push(trigger);
      }
    }
    else {
      triggers.push(trigger);
    }
  }
}

export function getTriggers(): Trigger[] {
  return triggers;
}

function calculateNextExecution(schedule: Schedule): Date {
  const now = new Date();
  const since = new Date(now);
  let when: Date;
  for (let i = 0; i < 3; i++) {
    switch (schedule.scheduled) {
      case 'atFixedTime':
        when = new Date(since);
        when.setHours(schedule.hour, schedule.minute ?? 0, schedule.second ?? 0, 0);
        break;
      case 'atSunrise':
        when = getSunrise(LATITUDE, LONGITUDE, since)!;
        break;
      case 'beforeSunrise':
        when = getSunrise(LATITUDE, LONGITUDE, since)!;
        when.setSeconds(when.getSeconds() - totalSeconds(schedule));
        break;
      case 'afterSunrise':
        when = getSunrise(LATITUDE, LONGITUDE, since)!;
        when.setSeconds(when.getSeconds() + totalSeconds(schedule));
        break;
      case 'atSunset':
        when = getSunset(LATITUDE, LONGITUDE, since)!;
        break;
      case 'beforeSunset':
        when = getSunset(LATITUDE, LONGITUDE, since)!;
        when.setSeconds(when.getSeconds() - totalSeconds(schedule));
        break;
      case 'afterSunset':
        when = getSunset(LATITUDE, LONGITUDE, since)!;
        when.setSeconds(when.getSeconds() + totalSeconds(schedule));
        break;
      case 'every':
        when = new Date(since);
        when.setSeconds(when.getSeconds() + totalSeconds(schedule));
    }
    if (when >= now) {
      return when;
    }
    since.setDate(since.getDate() + 1);
  }
  throw new Error('Something went wrong calculating the next execution date of schedule: ' + schedule);
}

function totalSeconds(delay: Delay): number {
  return ((delay.hours ?? 0) * 60 + (delay.minutes ?? 0)) * 60 + (delay.seconds ?? 0);
}
