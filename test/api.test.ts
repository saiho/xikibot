import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import { API_PORT } from '../src/global';
import { API } from '../src/api-definition';
import { startAPIServer, stopAPIServer } from '../src/api-server';
import * as trigger from '../src/trigger';
import { addScheduledTrigger, clearTriggers, Schedule } from '../src/trigger';
import { ComponentPresence, SwitchComponent, TemperatureHumiditySensorComponent } from '../src/component.common';
import { equalTime, expectErrorLogged, expectInternalServerErrorJsonResponse, expectNoErrorLogged, expectNotFoundJsonResponse, expectOkJsonResponse, isIsoDateTime, isTodayDate } from './common/test-util';
import { DB_ASSET, prepareTestDb } from './common/global.mock';
import { XikibotExtensionMock } from './common/xikibot.mock';
import packageJson from '../package.json' with { type: 'json' };

const apiServer = supertest(`http://localhost:${API_PORT}`);

describe('API Server', () => {
  beforeAll(() => {
    (global as any).__BUILD_VERSION__ = packageJson.version;
    (global as any).__BUILD_TIMESTAMP__ = new Date().toISOString();

    startAPIServer();
  });

  afterAll(async () => {
    await stopAPIServer();
  });

  it('Get Build Info', async () => {
    const response = await apiServer.get(API.GET_BUILD_INFO.endpoint);
    expectOkJsonResponse(response);
    expect(response.body).toEqual({
      version: packageJson.version,
      timestamp: expect.toSatisfy((value: string) => isIsoDateTime(value) && isTodayDate(value)),
    });

    expectNoErrorLogged();
  });

  it('Get Triggers', async () => {
    const schedule: Schedule = { scheduled: 'atFixedTime', hour: 13, minute: 22 };
    addScheduledTrigger('test', () => { /* empty */ }, schedule);

    const response = await apiServer.get(API.GET_TRIGGERS.endpoint);
    expectOkJsonResponse(response);
    expect(response.body).toEqual([{
      id: 'test',
      schedule: schedule,
      when: expect.toSatisfy((value: string) => isIsoDateTime(value) && equalTime(value, [13, 22, 0])),
    }]);

    expectNoErrorLogged();

    clearTriggers();
  });

  it('Check Components', async () => {
    XikibotExtensionMock.setDevicesCreateAuto(false);

    XikibotExtensionMock.addDevice('Temperature Sensor 1', { ieeeAddr: '0x0000a71c' });
    XikibotExtensionMock.addDevice('Temperature Sensor 2', { ieeeAddr: '0x0000a72c', disabled: true });

    new TemperatureHumiditySensorComponent({ name: 'Temperature Sensor 1', persistentId: 501 });
    new TemperatureHumiditySensorComponent({ name: 'Temperature Sensor 2', persistentId: 502 });
    new SwitchComponent({ name: 'Fan 1', persistentId: 503 }); // No device

    const response = await apiServer.get(API.CHECK_COMPONENTS.endpoint);
    expectOkJsonResponse(response);
    expect(response.body).toEqual({
      'Temperature Sensor 1': {
        presence: ComponentPresence.active,
      },
      'Temperature Sensor 2': {
        presence: ComponentPresence.disabled,
      },
      'Fan 1': {
        presence: ComponentPresence.notFound,
      },
    });

    expectNoErrorLogged();
  });

  it('Check DB Integrity', async () => {
    prepareTestDb(DB_ASSET);

    const response = await apiServer.get(API.CHECK_DB_INTEGRITY.endpoint);
    expectOkJsonResponse(response);
    expect(response.body).toEqual([{ integrity_check: 'ok' }]);

    expectNoErrorLogged();
  });

  it('Not found', async () => {
    const response = await apiServer.get('/wrong');
    expectNotFoundJsonResponse(response);
  });

  it('Stop / start', async () => {
    await stopAPIServer();

    await expect(async () => {
      await apiServer.get(API.GET_BUILD_INFO.endpoint);
    }).rejects.toThrowError(); // Expect error, connection refused

    startAPIServer();
  });

  it('Internal error', async () => {
    vi.spyOn(trigger, 'getTriggers').mockImplementationOnce(() => {
      throw new Error('A mocked error');
    });

    const response = await apiServer.get(API.GET_TRIGGERS.endpoint);
    expectInternalServerErrorJsonResponse(response);
    expect(response.body.description).toBe('A mocked error');
    expectErrorLogged(1);
  });
});
