import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { copyFileSync, readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import * as tmp from 'tmp';
import * as constants from '../../src/global';
import * as util from '../../src/util';
import { Component } from '../../src/component.common';
import { closeDb } from '../../src/storage';
import { clearTriggers } from '../../src/trigger';
import { XikibotExtensionMock } from './xikibot.mock';

export const DB_SCHEMA = './database/schema.sql';
export const DB_ASSET = './test/assets/xikibot.sqlite';

let tmpDir: tmp.DirResult | null = null;
tmp.setGracefulCleanup();

vi.mock(import('../../src/component'), async importOriginal => ({
  ...await importOriginal(),
  initComponents: vi.fn().mockReturnValue([]),
}));

vi.spyOn(util, 'runCommandAsync').mockImplementation((command) => {
  console.log(`Mocked runCommandAsync(${JSON.stringify(command)})`);
  return Promise.resolve();
});

beforeEach(() => {
  vi.useRealTimers();

  // Ensure that there is an instance for tests that use the logger of XikibotExtension
  // and reset the list of devices and components in each run
  new XikibotExtensionMock();
  Component.ALL_COMPONENTS.length = 0;
  clearTriggers();
});

afterEach(async () => {
  if (tmpDir != null) {
    await closeDb();
  }
});

afterAll(() => {
  tmpDir?.removeCallback();
  tmpDir = null;
});

export function prepareTestDb(asset: string): void;
export function prepareTestDb(initialData?: { statementSource: string; records: (Record<string, string | number | null>)[] }[]): void;
export function prepareTestDb(assetOrInitialData?: string | { statementSource: string; records: (Record<string, string | number | null>)[] }[]): void {
  if (tmpDir == null) {
    tmpDir = tmp.dirSync({
      prefix: 'vitest',
      unsafeCleanup: true,
    });
  }

  const dbFilename = tmp.tmpNameSync({ dir: tmpDir.name, postfix: '.sqlite' });
  vi.spyOn(constants, 'DB_FILENAME', 'get').mockReturnValue(dbFilename as any);

  if (typeof assetOrInitialData === 'string') {
    const asset = assetOrInitialData;
    copyFileSync(asset, dbFilename);
  }
  else {
    const initialData = assetOrInitialData;

    const db = new Database(dbFilename);
    db.exec(readFileSync(DB_SCHEMA, { encoding: 'utf-8' }));

    if (initialData) {
      for (const { statementSource, records } of initialData) {
        const statement = db.prepare(statementSource);
        records.forEach(record => statement.run(record));
      }
    }

    db.close();
  }
}
