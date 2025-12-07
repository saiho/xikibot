import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoErrorLogged } from './common/test-util';
import { DB_VACUUM_WRITE_FREQUENCY, FAN_TOILET_CHANNEL_LEVEL, LOG_NAMESPACE, xikibotInstance } from '../src/global';
import * as storage from '../src/storage';
import { getFanState, getTemperatureHumidity, storeFanState, storeTemperatureHumidity } from '../src/storage';
import { SwitchComponent, SwitchExclusive2ChannelComponent, TemperatureHumiditySensorComponent } from '../src/component.common';
import { XikibotExtensionMock } from './common/xikibot.mock';
import { FanStateParams, TemperatureHumidityParams } from '../src/api-definition';
import { prepareTestDb } from './common/global.mock';

const temperatureHumidityParams: TemperatureHumidityParams = { order: 'measureDate ASC', pageLimit: 40 };
const fanStateParams: FanStateParams = { order: 'measureDate ASC', pageLimit: 40 };

describe('Storage of measures', () => {
  beforeEach(() => {
    prepareTestDb();
  });

  it('Store temperature and humidity', async () => {
    const sensor1 = new TemperatureHumiditySensorComponent({ name: 'Sensor 1', persistentId: 501 });
    const sensor2 = new TemperatureHumiditySensorComponent({ name: 'Sensor 2', persistentId: 502 });

    XikibotExtensionMock.setDeviceState(sensor1.name, { temperature: 23.23, humidity: 75.4 });
    XikibotExtensionMock.setDeviceState(sensor2.name, { temperature: 20.11, humidity: null });

    vi.useFakeTimers();
    const time1 = Date.now();
    await storeTemperatureHumidity(sensor1, sensor2);

    const expectedRecords = [
      {
        persistentId: sensor1.persistentId,
        measureDate: time1,
        temperature: 23.23,
        humidity: 75.4,
      }, {
        persistentId: sensor2.persistentId,
        measureDate: time1,
        temperature: 20.11,
        humidity: null,
      },
    ];
    expect(getTemperatureHumidity(temperatureHumidityParams)).toEqual(expectedRecords);

    XikibotExtensionMock.setDeviceState(sensor1.name, { temperature: 23.38, humidity: 75 });
    XikibotExtensionMock.setDeviceState(sensor2.name, { temperature: -11.3, humidity: 72.123 });

    vi.advanceTimersByTime(2100);
    const time2 = Date.now();
    await storeTemperatureHumidity(sensor1, sensor2);

    expectedRecords.push({
      persistentId: sensor1.persistentId,
      measureDate: time2,
      temperature: 23.38,
      humidity: 75,
    }, {
      persistentId: sensor2.persistentId,
      measureDate: time2,
      temperature: -11.3,
      humidity: 72.123,
    });
    expect(getTemperatureHumidity(temperatureHumidityParams)).toEqual(expectedRecords);

    XikibotExtensionMock.setDeviceState(sensor1.name, { temperature: 23.5, humidity: 75.2 });
    XikibotExtensionMock.setDeviceState(sensor2.name, { temperature: 0, humidity: null });

    // Do not advance the time to test whether adding a new measure in the same millisecond as an existing one updates it
    await storeTemperatureHumidity(sensor1, sensor2);

    expectedRecords[2] = {
      persistentId: sensor1.persistentId,
      measureDate: time2,
      temperature: 23.5,
      humidity: 75.2,
    };
    expectedRecords[3] = {
      persistentId: sensor2.persistentId,
      measureDate: time2,
      temperature: 0,
      humidity: null,
    };
    expect(getTemperatureHumidity(temperatureHumidityParams)).toEqual(expectedRecords);

    expectNoErrorLogged();
  });

  it('Store fan state', async () => {
    const switch1 = new SwitchComponent({ name: 'Fan 1', persistentId: 601 });
    const switch2 = new SwitchExclusive2ChannelComponent({ name: 'Fan 2', persistentId: 602, channelLevel: FAN_TOILET_CHANNEL_LEVEL });

    XikibotExtensionMock.setDeviceState(switch1.name, { state: 'ON' });
    XikibotExtensionMock.setDeviceState(switch2.name, { state_l1: 'OFF', state_l2: 'OFF' });

    vi.useFakeTimers();
    const time1 = Date.now();
    await storeFanState(switch1, switch2);
    const expectedRecords = [{
      persistentId: switch1.persistentId,
      measureDate: time1,
      level: 1,
    }, {
      persistentId: switch2.persistentId,
      measureDate: time1,
      level: 0,
    }];
    expect(getFanState(fanStateParams)).toEqual(expectedRecords);

    vi.advanceTimersByTime(2000);
    await storeFanState(switch1, switch2);
    expect(getFanState(fanStateParams)).toEqual(expectedRecords);

    XikibotExtensionMock.setDeviceState(switch1.name, { state: 'OFF' });
    vi.advanceTimersByTime(2000);
    const time3 = Date.now();
    await storeFanState(switch1, switch2);
    expectedRecords.push({
      persistentId: switch1.persistentId,
      measureDate: time3,
      level: 0,
    });
    expect(getFanState(fanStateParams)).toEqual(expectedRecords);

    XikibotExtensionMock.setDeviceState(switch2.name, { state_l1: 'ON', state_l2: 'OFF' });
    vi.advanceTimersByTime(2000);
    const time4 = Date.now();
    await storeFanState(switch1, switch2);
    expectedRecords.push({
      persistentId: switch2.persistentId,
      measureDate: time4,
      level: 1,
    });
    expect(getFanState(fanStateParams)).toEqual(expectedRecords);

    XikibotExtensionMock.setDeviceState(switch1.name, { state: 'ON' });
    XikibotExtensionMock.setDeviceState(switch2.name, { state_l1: 'OFF', state_l2: 'ON' });
    vi.advanceTimersByTime(2000);
    const time5 = Date.now();
    await storeFanState(switch1, switch2);
    expectedRecords.push({
      persistentId: switch1.persistentId,
      measureDate: time5,
      level: 1,
    }, {
      persistentId: switch2.persistentId,
      measureDate: time5,
      level: 2,
    });
    expect(getFanState(fanStateParams)).toEqual(expectedRecords);

    expectNoErrorLogged();
  });

  it('Disabled component', async () => {
    const updateComponentHistorySpy = vi.spyOn(storage, 'updateComponentHistory');

    const sensor1 = new TemperatureHumiditySensorComponent({ name: 'Sensor 1', persistentId: 501 });
    const sensor2 = new TemperatureHumiditySensorComponent({ name: 'Sensor 2', persistentId: 502 });

    XikibotExtensionMock.setDeviceState(sensor1.name, { temperature: 19.07, humidity: 99.9 });
    XikibotExtensionMock.setDeviceState(sensor2.name, { temperature: 18.11, humidity: 44 });

    vi.useFakeTimers();
    const time1 = Date.now();
    await storeTemperatureHumidity(sensor1, sensor2);

    const expectedRecords = [
      {
        persistentId: sensor1.persistentId,
        measureDate: time1,
        temperature: 19.07,
        humidity: 99.9,
      }, {
        persistentId: sensor2.persistentId,
        measureDate: time1,
        temperature: 18.11,
        humidity: 44,
      },
    ];
    expect(getTemperatureHumidity(temperatureHumidityParams)).toEqual(expectedRecords);

    XikibotExtensionMock.setDeviceState(sensor1.name, { temperature: 19.87, humidity: 91.2 });
    XikibotExtensionMock.setDeviceState(sensor2.name, { temperature: 18.11, humidity: 44 });
    XikibotExtensionMock.disableDevice(sensor1.name);

    vi.advanceTimersByTime(2100);
    const time2 = Date.now();
    await storeTemperatureHumidity(sensor1, sensor2);

    expectedRecords.push({
      persistentId: sensor2.persistentId,
      measureDate: time2,
      temperature: 18.11,
      humidity: 44,
    });
    expect(getTemperatureHumidity(temperatureHumidityParams)).toEqual(expectedRecords);

    expect(updateComponentHistorySpy).toHaveBeenCalledOnce();
  });

  it('Vacuum', async () => {
    let vacuumCalledCount = 0;

    const mockedLoggerDebug = vi.mocked(xikibotInstance!.logger.debug);
    const prevLoggerDebug = mockedLoggerDebug.getMockImplementation()!;
    mockedLoggerDebug.mockImplementation((messageOrLambda: string | (() => string), namespace?: string) => {
      if (messageOrLambda === 'Database vacuum' && namespace === LOG_NAMESPACE) {
        vacuumCalledCount++;
      }
      prevLoggerDebug(messageOrLambda, namespace);
    });

    const sensor1 = new TemperatureHumiditySensorComponent({ name: 'Sensor 1', persistentId: 501 });
    XikibotExtensionMock.setDeviceState(sensor1.name, { temperature: 8.12, humidity: 21.67 });

    let writeCount;
    for (writeCount = 0; writeCount <= DB_VACUUM_WRITE_FREQUENCY && vacuumCalledCount === 0; writeCount++) {
      await storeTemperatureHumidity(sensor1);
    }
    expect(vacuumCalledCount).toBe(1);
    expect(writeCount).toBeLessThanOrEqual(DB_VACUUM_WRITE_FREQUENCY);

    for (writeCount = 0; writeCount <= DB_VACUUM_WRITE_FREQUENCY && vacuumCalledCount === 1; writeCount++) {
      await storeTemperatureHumidity(sensor1);
    }
    expect(vacuumCalledCount).toBe(2);
    expect(writeCount).toBe(DB_VACUUM_WRITE_FREQUENCY);

    // Restore previous implementation
    mockedLoggerDebug.mockImplementation(prevLoggerDebug);
  });
});
