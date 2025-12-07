import Database from 'better-sqlite3';
import debounce from 'debounce';
import { CLOSE_DB_DEBOUNCE_TIME, DB_FILENAME, DB_VACUUM_WRITE_FREQUENCY } from './global';
import { FanStateParams, Pagination, TemperatureHumidityParams } from './api-definition';
import { logDebug, logError, logInfo, promiseWithResolvers, runCommandAsync } from './util';
import { Component, ComponentPresence, SwitchComponent, SwitchExclusive2ChannelComponent, TemperatureHumiditySensorComponent } from './component.common';

export interface TemperatureHumidityRecord {
  persistentId: number;
  measureDate: number; // milliseconds since epoch
  temperature: number | null;
  humidity: number | null;
}

export interface FanStateRecord {
  persistentId: number;
  measureDate: number; // milliseconds since epoch
  level: number | null;
}

export interface ComponentHistoryRecord {
  persistentId: number;
  z2mDeviceId: string;
  name: string | null;
  sinceDate: number; // milliseconds since epoch
  presence: ComponentPresence;
}

type ParameterType = string | number | null;

const debouncedCloseDb = debounce(closeDbAuxAsync, CLOSE_DB_DEBOUNCE_TIME);

let db: Database.Database | null = null;
let openingOrClosing: Promise<void> | null = null;
let fsReadonly = true;
let vacuumWriteCount = 0;
let updatingComponentHistory = false;

export async function initDb(): Promise<void> {
  try {
    await openDbWriteAsync();
    vacuum();
    logInfo('Database is ready');
  }
  finally {
    debouncedCloseDb();
  }
}

export async function closeDb(): Promise<void> {
  debouncedCloseDb.clear();
  return closeDbAuxAsync();
}

export function checkDbIntegrity(): unknown {
  try {
    openDbReadSync();
    return db!.pragma('integrity_check');
  }
  finally {
    debouncedCloseDb();
  }
}

export async function updateComponentHistory(): Promise<void> {
  // updatingComponentHistory prevents recursive calls to updateComponentHistory that can happen when calling
  // component.getPresence, because this method can in turn call updateComponentHistory when it detects presence
  // changes.
  if (updatingComponentHistory) {
    return;
  }

  updatingComponentHistory = true;

  try {
    const componentHistoryRecords = readAllSync<ComponentHistoryRecord>('SELECT persistentId, z2mDeviceId, name, sinceDate, presence FROM CurrentComponent');
    const changes: ComponentHistoryRecord[] = [];
    const nowEpoch = Date.now();

    for (const componentHistoryRecord of componentHistoryRecords) {
      const component = Component.ALL_COMPONENTS.find(component => component.persistentId === componentHistoryRecord.persistentId);
      const presence = component ? component.getPresence() : ComponentPresence.removed;
      const update = {
        persistentId: componentHistoryRecord.persistentId,
        z2mDeviceId: (presence === ComponentPresence.removed || presence === ComponentPresence.notFound) ? componentHistoryRecord.z2mDeviceId : component!.deviceId!,
        name: presence === ComponentPresence.removed ? componentHistoryRecord.name : component!.name,
        sinceDate: nowEpoch,
        presence: presence,
      };

      if (componentHistoryRecord.z2mDeviceId !== update.z2mDeviceId
        || componentHistoryRecord.name !== update.name
        || componentHistoryRecord.presence !== update.presence) {
        changes.push(update);
      }
    }

    for (const component of Component.ALL_COMPONENTS) {
      if (!componentHistoryRecords.find(componentHistoryRecord => component.persistentId === componentHistoryRecord.persistentId)) {
        changes.push({
          persistentId: component.persistentId!,
          z2mDeviceId: component.deviceId!,
          name: component.name,
          sinceDate: nowEpoch,
          presence: ComponentPresence.active,
        });
      }
    }

    if (changes.length > 0) {
      await writeAsync(
        `INSERT INTO ComponentHistory (persistentId, z2mDeviceId, name, sinceDate, presence)
            VALUES (:persistentId, :z2mDeviceId, :name, :sinceDate, :presence)
            ON CONFLICT (persistentId, sinceDate) DO
            UPDATE SET z2mDeviceId = EXCLUDED.z2mDeviceId, name = EXCLUDED.name, presence = EXCLUDED.presence`,
        ...changes);
    }
  }
  finally {
    updatingComponentHistory = false;
  }
}

export async function storeTemperatureHumidity(...sensors: TemperatureHumiditySensorComponent[]): Promise<void> {
  const nowEpoch = Date.now();

  const measures: [number, number, number | null, number | null][] = sensors
    .filter(sensor => sensor.active)
    .map((sensor) => {
      const state = sensor.getTemperatureHumidity();
      return [
        sensor.persistentId!,
        nowEpoch,
        state.temperature,
        state.humidity,
      ];
    });

  if (measures.length === 0) {
    return;
  }

  try {
    await writeAsync(
      `INSERT INTO TemperatureHumidity (persistentId, measureDate, temperature, humidity)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (persistentId, measureDate) DO
            UPDATE SET temperature = EXCLUDED.temperature, humidity = EXCLUDED.humidity`,
      ...measures);
  }
  catch (error) {
    logError(error, true);
  }
}

export async function storeFanState(...components: (SwitchComponent | SwitchExclusive2ChannelComponent)[]): Promise<void> {
  const nowEpoch = Date.now();

  let measures: [number, number, number | null][] = components
    .filter(sensor => sensor.active)
    .map((component) => {
      let level: number;
      if (component instanceof SwitchComponent) {
        level = component.isSwitchedOn() ? 1 : 0;
      }
      else if (component instanceof SwitchExclusive2ChannelComponent) {
        level = component.switchedOnChannelLevel();
      }
      else {
        throw new Error(`Invalid Fan component: ${(component as Component).name}`);
      }
      return [
        component.persistentId!,
        nowEpoch,
        level,
      ];
    });

  if (measures.length === 0) {
    return;
  }

  const persistentIds = measures.map(([persistentId]) => persistentId);

  try {
    const currentFanStateMap = new Map(
      readAllSync<[number, number | null]>(`SELECT persistentId, level FROM CurrentFanState WHERE persistentId IN (${placeholders(persistentIds)})`, persistentIds, true));
    measures = measures.filter(([persistentId, , level]) => (currentFanStateMap.get(persistentId) ?? -1) !== (level ?? -1));

    if (measures.length === 0) {
      return;
    }

    await writeAsync(
      `INSERT INTO FanState (persistentId, measureDate, level)
            VALUES (?, ?, ?)
            ON CONFLICT (persistentId, measureDate) DO
            UPDATE SET level = EXCLUDED.level`,
      ...measures);
  }
  catch (error) {
    logError(error, true);
  }
}

export function getTemperatureHumidity(params: TemperatureHumidityParams): TemperatureHumidityRecord[] {
  return queryAll(
    'SELECT persistentId, measureDate, temperature, humidity FROM TemperatureHumidity',
    and(
      condition('persistentId = ?', params.persistentId),
      condition('measureDate >= ?', params.measureDateSince?.getTime()),
      condition('measureDate <= ?', params.measureDateUntil?.getTime()),
    ),
    params);
}

export function getFanState(params: FanStateParams): FanStateRecord[] {
  return queryAll(
    'SELECT persistentId, measureDate, level FROM FanState',
    and(
      condition('persistentId = ?', params.persistentId),
      condition('measureDate >= ?', params.measureDateSince?.getTime()),
      condition('measureDate <= ?', params.measureDateUntil?.getTime()),
    ),
    params);
}

export function getCurrentFanState(): FanStateRecord[] {
  return queryAll('SELECT persistentId, measureDate, level FROM CurrentFanState ORDER BY persistentId');
}

export function getComponentHistory(): ComponentHistoryRecord[] {
  return queryAll('SELECT persistentId, z2mDeviceId, name, sinceDate, presence FROM ComponentHistory ORDER BY sinceDate, persistentId');
}

export function getCurrentComponent(): ComponentHistoryRecord[] {
  return queryAll('SELECT persistentId, z2mDeviceId, name, sinceDate, presence FROM CurrentComponent ORDER BY persistentId');
}

function openDbReadSync(): void {
  debouncedCloseDb.clear();
  if (!db) {
    db = new Database(DB_FILENAME, {
      readonly: true,
      fileMustExist: true,
    });
    logDebug('Database opened readonly');
  }
}

async function openDbWriteAsync(): Promise<void> {
  debouncedCloseDb.clear();
  while (openingOrClosing) {
    await openingOrClosing;
  }

  let resolveOpeningOrClosing: (() => void) | undefined;
  try {
    if (fsReadonly) {
      ({ promise: openingOrClosing, resolve: resolveOpeningOrClosing } = promiseWithResolvers<void>());
      await runCommandAsync('sudo mount -o remount,rw /app');
      fsReadonly = false;
    }
    if (!db || db.readonly) {
      db?.close();
      db = new Database(DB_FILENAME, {
        readonly: false,
        fileMustExist: true,
      });
      logDebug('Database opened read-write');
    }
  }
  finally {
    openingOrClosing = null;
    resolveOpeningOrClosing?.();
  }
}

async function closeDbAuxAsync(): Promise<void> {
  while (openingOrClosing) {
    await openingOrClosing;
  }

  let resolveOpeningOrClosing: (() => void) | undefined;
  try {
    if (db) {
      db.close();
      db = null;
      logDebug('Database closed');
    }
    if (!fsReadonly) {
      ({ promise: openingOrClosing, resolve: resolveOpeningOrClosing } = promiseWithResolvers<void>());
      await runCommandAsync('sudo mount -o remount,ro /app');
      fsReadonly = true;
    }
  }
  finally {
    openingOrClosing = null;
    resolveOpeningOrClosing?.();
  }
}

function readOneSync<R>(statementSource: string, parameters: ParameterType[] = [], arrayResult = false): R | undefined {
  try {
    openDbReadSync();
    logDebugStatementExecution(statementSource, parameters);
    return db!.prepare<ParameterType[], R>(statementSource).raw(arrayResult).get(...parameters);
  }
  finally {
    debouncedCloseDb();
  }
}

function readAllSync<R>(statementSource: string, parameters: ParameterType[] = [], arrayResult = false): R[] {
  try {
    openDbReadSync();
    logDebugStatementExecution(statementSource, parameters);
    const results = db!.prepare<ParameterType[], R>(statementSource).raw(arrayResult).all(...parameters);
    logDebug(() => `SQL statement returned ${results.length} records`);
    return results;
  }
  finally {
    debouncedCloseDb();
  }
}

async function writeAsync<P extends Record<keyof P, ParameterType> | ParameterType[]>(statementSource: string, ...parameters: P[]): Promise<void> {
  try {
    await openDbWriteAsync();
    logDebugStatementExecution(statementSource, parameters);
    const statement = db!.prepare(statementSource);
    parameters.forEach(parametersRun => statement.run(parametersRun));
    if (++vacuumWriteCount >= DB_VACUUM_WRITE_FREQUENCY) {
      vacuum();
    }
  }
  finally {
    debouncedCloseDb();
  }
}

function vacuum(): void {
  logDebug('Database vacuum');
  db!.exec('VACUUM');
  vacuumWriteCount = 0;
}

function logDebugStatementExecution(statementSource: string, parameters?: unknown[]): void {
  logDebug(() => {
    let message = `Execute SQL statement: ${statementSource.trim()}`;
    if (parameters && parameters.length > 0) {
      message += `\n\twith parameters: ${JSON.stringify(parameters)}`;
    }
    return message;
  });
}

// reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function queryOne<R>(select: string, where?: Condition): R | undefined {
  return readOneSync<R>(
    where?.defined
      ? `${select} WHERE ${where.expression}`
      : select,
    where?.parameters);
}

function queryAll<R>(select: string, where?: Condition, pagination?: Pagination): R[] {
  let query = select;
  const parameters: ParameterType[] = [];
  if (where?.defined) {
    query += ' WHERE ' + where.expression;
    if (where.parameters) {
      parameters.push(...where.parameters);
    }
  }
  if (pagination) {
    query += ` ORDER BY ${pagination.order} LIMIT ?`;
    parameters.push(pagination.pageLimit);
    if (pagination.pageOffset) {
      query += ' OFFSET ?';
      parameters.push(pagination.pageOffset);
    }
  }
  return readAllSync<R>(query, parameters);
}

abstract class Condition {
  public abstract get expression(): string;

  public abstract get parameters(): ParameterType[];

  public get defined(): boolean {
    return this.expression != '';
  }
}

class AndCondition extends Condition {
  private readonly _expression: string;
  private readonly _parameters: ParameterType[];

  constructor(conditions: Condition[]) {
    super();
    const nonEmptyConditions = conditions.filter(condition => condition.defined);
    if (nonEmptyConditions.length > 0) {
      this._expression = '(' + nonEmptyConditions
        .map(condition => condition.expression).join(' AND ') + ')';
      this._parameters = nonEmptyConditions
        .flatMap(condition => condition.parameters);
    }
    else {
      this._expression = '';
      this._parameters = [];
    }
  }

  public get expression(): string {
    return this._expression;
  }

  public get parameters(): ParameterType[] {
    return this._parameters;
  }
}

class SimpleCondition extends Condition {
  constructor(
    private readonly _expression: string,
    private readonly _parameters: ParameterType[]) {
    super();
  }

  public get expression(): string {
    return this._expression;
  }

  public get parameters(): ParameterType[] {
    return this._parameters;
  }
}

class EmptyCondition extends Condition {
  public readonly expression = '';

  public get parameters(): ParameterType[] {
    return [];
  }
}

const EMPTY_CONDITION = new EmptyCondition();

function and(...conditions: Condition[]): Condition {
  return new AndCondition(conditions);
}

function condition(expression: string, ...parameters: (ParameterType | undefined)[]): Condition {
  // Attention, check != null, instead of implicit conversion to boolean, because parameters like 0 should be treated as defined
  if (parameters.every(parameter => parameter != null)) {
    return new SimpleCondition(expression, parameters);
  }
  else {
    return EMPTY_CONDITION;
  }
}

function placeholders(list: ParameterType[]) {
  return '?, '.repeat(list.length - 1) + '?';
}
