import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoErrorLogged } from './common/test-util';
import { checkDbIntegrity, getTemperatureHumidity, initDb, storeTemperatureHumidity } from '../src/storage';
import { TemperatureHumiditySensorComponent } from '../src/component.common';
import { DB_ASSET, prepareTestDb } from './common/global.mock';
import { XikibotExtensionMock } from './common/xikibot.mock';

describe('Backwards compatibility Sqlite', () => {
  beforeEach(() => {
    prepareTestDb(DB_ASSET);
    initDb();
  });

  it('Read database', async () => {
    const records = getTemperatureHumidity({
      measureDateSince: new Date(1760388431188),
      measureDateUntil: new Date(1764175733630),
      order: 'measureDate ASC',
      pageLimit: 5000 });
    expect(records.length).toBe(2106);

    expect(checkDbIntegrity()).toEqual([{ integrity_check: 'ok' }]);

    expectNoErrorLogged();
  });

  it('Write database', async () => {
    const sensor1 = new TemperatureHumiditySensorComponent({ name: 'Sensor 1', persistentId: 60008 });
    const sensor2 = new TemperatureHumiditySensorComponent({ name: 'Sensor 2', persistentId: 60009 });

    XikibotExtensionMock.setDeviceState(sensor1.name, { temperature: 23.23, humidity: 75.4 });
    XikibotExtensionMock.setDeviceState(sensor2.name, { temperature: 20.11, humidity: null });

    vi.useFakeTimers();
    vi.setSystemTime(1764175733640);
    await storeTemperatureHumidity(sensor1, sensor2);

    const records = getTemperatureHumidity({
      measureDateSince: new Date(1760388431188),
      measureDateUntil: new Date(1764175733640),
      order: 'measureDate ASC',
      pageLimit: 5000 });
    expect(records.length).toBe(2108);

    expect(checkDbIntegrity()).toEqual([{ integrity_check: 'ok' }]);

    expectNoErrorLogged();
  });
});
