import { expect } from 'vitest';
import { isISO8601 } from 'validator';
import supertest from 'supertest';
import { xikibotInstance } from '../../src/global';

/**
 * Dummy function for casting a partial implementation of an interface (the mock) to the full implementations. This
 * allows to check types when compiling, but does nothing at runtime.
 *
 * @param partial The mocked instance.
 * @returns The mock looking like a normal instance.
 */
export function nonPartial<T, P extends Partial<T> = T>(partial: P): T;
export function nonPartial<T, P extends Partial<T> = T>(partial: P | null): T | null;
export function nonPartial<T, P extends Partial<T> = T>(partial: P | undefined): T | undefined;
export function nonPartial<T, P extends Partial<T> = T>(partial: P | null | undefined): T | null | undefined;
export function nonPartial<T, P extends Partial<T> = T>(partial: P[]): T[];
export function nonPartial<T, P extends Partial<T> = T>(partial: P | P[] | null | undefined): T | T[] | null | undefined {
  return partial as any;
}

export function isIsoDateTime(value: string | undefined): boolean {
  return value != null && isISO8601(value, { strict: true, strictSeparator: true });
}

export function equalDate(date1: Date | string | undefined, date2: Date | string | undefined): boolean {
  if (!date1 && !date2) {
    return true;
  }
  if (!date1 || !date2) {
    return false;
  }
  if (typeof date1 === 'string') {
    date1 = new Date(date1);
  }
  if (typeof date2 === 'string') {
    date2 = new Date(date2);
  }
  return date1.toDateString() === date2.toDateString();
}

export function equalTime(time1: Date | string | undefined, time2: Date | string | [number, number, number] | undefined): boolean {
  if (!time1 && !time2) {
    return true;
  }
  if (!time1 || !time2) {
    return false;
  }
  if (typeof time1 === 'string') {
    time1 = new Date(time1);
  }
  if (time2 instanceof Array) {
    const [hours, minutes, seconds] = time2;
    return time1.getHours() === hours && time1.getMinutes() === minutes && time1.getSeconds() === seconds;
  }
  else if (typeof time2 === 'string') {
    time2 = new Date(time2);
  }
  return time1.toTimeString() === time2.toTimeString();
}

export function isTodayDate(date: Date | string | undefined): boolean {
  return equalDate(date, new Date());
}

export function expectNoErrorLogged(): void {
  expect(xikibotInstance!.logger.error).toBeCalledTimes(0);
}

export function expectWarningLogged(times = 1): void {
  expect(xikibotInstance!.logger.warning).toBeCalledTimes(times);
}

export function expectErrorLogged(times = 1): void {
  expect(xikibotInstance!.logger.error).toBeCalledTimes(times);
}

export function expectOkJsonResponse(response: supertest.Response): void {
  expect(response.ok).toBe(true);
  expect(response.header['content-type']).toBe('application/json');
}

export function expectNotFoundJsonResponse(response: supertest.Response): void {
  expect(response.notFound).toBe(true);
  expect(response.header['content-type']).toBe('application/json');
}

export function expectBadRequestJsonResponse(response: supertest.Response): void {
  expect(response.badRequest).toBe(true);
  expect(response.header['content-type']).toBe('application/json');
}

export function expectInternalServerErrorJsonResponse(response: supertest.Response): void {
  expect(response.serverError).toBe(true);
  expect(response.header['content-type']).toBe('application/json');
}

export function convertDatesToEpoch<R extends Record<string, string | number | null>, K extends keyof R>(data: R[], column: K): (Omit<R, K> & Record<K, number | null>)[] {
  return data.map(record => ({ ...record, [column]: Date.parse(record[column] as string) }));
}
