import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InferInput } from 'valibot';
import supertest from 'supertest';
import { API_PORT } from '../src/global';
import { startAPIServer, stopAPIServer } from '../src/api-server';
import { API } from '../src/api-definition';
import { convertDatesToEpoch, expectBadRequestJsonResponse, expectNoErrorLogged, expectOkJsonResponse, expectWarningLogged } from './common/test-util';
import { prepareTestDb } from './common/global.mock';

type TemperatureHumidityUrlParams = Partial<InferInput<typeof API['GET_TEMPERATURE_HUMIDITY']['urlParamsSchema']>>;

const apiServer = supertest(`http://localhost:${API_PORT}`);

const TEMPERATURE_HUMIDITY_DATA = convertDatesToEpoch([
  { persistentId: 3001, measureDate: '2025-10-03T11:38:30Z', temperature: 21.2, humidity: 68.92 },
  { persistentId: 3002, measureDate: '2025-10-03T11:38:30Z', temperature: 23.0, humidity: 74.125 },
  { persistentId: 3001, measureDate: '2025-10-03T11:48:11Z', temperature: 21.3, humidity: 68 },
  { persistentId: 3002, measureDate: '2025-10-03T11:48:11Z', temperature: 23.6, humidity: 69.4 },
  { persistentId: 3001, measureDate: '2025-10-03T11:58:19Z', temperature: 21.3, humidity: 0 },
  { persistentId: 3002, measureDate: '2025-10-03T11:58:19Z', temperature: null, humidity: 44.24 },
  { persistentId: 3001, measureDate: '2025-10-03T12:08:32Z', temperature: -2.3, humidity: 100 },
  { persistentId: 3002, measureDate: '2025-10-03T12:18:41Z', temperature: 21.7, humidity: 58.17 },
], 'measureDate');

describe('API Server (search)', () => {
  beforeAll(() => {
    prepareTestDb([{
      statementSource: 'INSERT INTO TemperatureHumidity (persistentId, measureDate, temperature, humidity) VALUES (:persistentId, :measureDate, :temperature, :humidity)',
      records: TEMPERATURE_HUMIDITY_DATA,
    }]);
    startAPIServer();
  });

  afterAll(async () => {
    await stopAPIServer();
  });

  it('Search temperature / humidity by date', async () => {
    let response = await requestTemperatureHumidityExpectingOk({});
    expect(response.body).toEqual(TEMPERATURE_HUMIDITY_DATA);

    response = await requestTemperatureHumidityExpectingOk({
      measureDateSince: '2025-10-03T12:00:00Z',
    });
    expect(response.body).toEqual([
      TEMPERATURE_HUMIDITY_DATA[6],
      TEMPERATURE_HUMIDITY_DATA[7],
    ]);

    response = await requestTemperatureHumidityExpectingOk({
      measureDateSince: '2025-10-03T14:00:00Z',
    });
    expect(response.body).toEqual([]);

    response = await requestTemperatureHumidityExpectingOk({
      measureDateSince: '2025-10-03T11:48:00Z',
      measureDateUntil: '2025-10-03T11:58:00Z',
    });
    expect(response.body).toEqual([
      TEMPERATURE_HUMIDITY_DATA[2],
      TEMPERATURE_HUMIDITY_DATA[3],
    ]);

    response = await requestTemperatureHumidityExpectingOk({
      measureDateSince: '2025-10-03T11:48:00Z',
      measureDateUntil: '2025-10-03T11:00:00Z',
    });
    expect(response.body).toEqual([]);

    response = await requestTemperatureHumidityExpectingOk({
      persistentId: '3002',
    });
    expect(response.body).toEqual([
      TEMPERATURE_HUMIDITY_DATA[1],
      TEMPERATURE_HUMIDITY_DATA[3],
      TEMPERATURE_HUMIDITY_DATA[5],
      TEMPERATURE_HUMIDITY_DATA[7],
    ]);

    response = await requestTemperatureHumidityExpectingOk({
      persistentId: '999999',
    });
    expect(response.body).toEqual([]);

    response = await requestTemperatureHumidityExpectingOk({
      measureDateSince: '2025-10-03T11:48:00Z',
      measureDateUntil: '2025-10-03T11:58:00Z',
      persistentId: '3001',
    });
    expect(response.body).toEqual([
      TEMPERATURE_HUMIDITY_DATA[2],
    ]);

    expectNoErrorLogged();
  });

  it('Search temperature / humidity pagination', async () => {
    let response = await requestTemperatureHumidityExpectingOk({
      pageOffset: '1',
    });
    expect(response.body).toEqual([
      TEMPERATURE_HUMIDITY_DATA[1],
      TEMPERATURE_HUMIDITY_DATA[2],
      TEMPERATURE_HUMIDITY_DATA[3],
      TEMPERATURE_HUMIDITY_DATA[4],
      TEMPERATURE_HUMIDITY_DATA[5],
      TEMPERATURE_HUMIDITY_DATA[6],
      TEMPERATURE_HUMIDITY_DATA[7],
    ]);

    response = await requestTemperatureHumidityExpectingOk({
      pageOffset: '10',
    });
    expect(response.body).toEqual([]);

    response = await requestTemperatureHumidityExpectingOk({
      pageLimit: '1',
    });
    expect(response.body).toEqual([
      TEMPERATURE_HUMIDITY_DATA[0],
    ]);

    response = await requestTemperatureHumidityExpectingOk({
      pageLimit: '3',
    });
    expect(response.body).toEqual([
      TEMPERATURE_HUMIDITY_DATA[0],
      TEMPERATURE_HUMIDITY_DATA[1],
      TEMPERATURE_HUMIDITY_DATA[2],
    ]);

    response = await requestTemperatureHumidityExpectingOk({
      pageOffset: '4',
      pageLimit: '2',
    });
    expect(response.body).toEqual([
      TEMPERATURE_HUMIDITY_DATA[4],
      TEMPERATURE_HUMIDITY_DATA[5],
    ]);

    response = await requestTemperatureHumidityExpectingOk({
      pageOffset: '4',
      pageLimit: '8',
    });
    expect(response.body).toEqual([
      TEMPERATURE_HUMIDITY_DATA[4],
      TEMPERATURE_HUMIDITY_DATA[5],
      TEMPERATURE_HUMIDITY_DATA[6],
      TEMPERATURE_HUMIDITY_DATA[7],
    ]);

    expectNoErrorLogged();
  });

  it('Invalid parameters', async () => {
    const invalidUrlParamsList: Partial<TemperatureHumidityUrlParams>[] = [
      { measureDateSince: '19273563.62' },
      { measureDateSince: '12345678901234567' },
      { measureDateSince: '' },
      { measureDateSince: ' ' },
      { measureDateSince: 'NOT VALID' },
      { measureDateSince: '🤐' },
      { measureDateUntil: '19273563.62' },
      { measureDateUntil: '12345678901234567' },
      { measureDateUntil: '' },
      { measureDateUntil: ' ' },
      { measureDateUntil: 'NOT VALID' },
      { measureDateUntil: '🤐' },
      { invalidField: '3636' } as any,
      { pageLimit: '100', invalidField1: '3636', invalidField2: 'DUMMY' } as any,
      { order: 'invalid DESC' } as any,
      { pageLimit: 'ZZZ' },
      { pageLimit: '0' },
      { pageLimit: '-1' },
      { pageLimit: '10.5' },
      { pageLimit: '' },
      { pageLimit: ' ' },
      { pageLimit: '-' },
      { pageLimit: '.' },
      { pageLimit: '987654321' },
      { pageOffset: 'ZZZ' },
      { pageOffset: '-1' },
      { pageOffset: '10.5' },
      { pageOffset: '' },
      { pageOffset: ' ' },
      { pageOffset: '-' },
      { pageOffset: '.' },
      { persistentId: 'text' },
      { persistentId: '145.9999' },
      { persistentId: '' },
      { persistentId: ' ' },
      { persistentId: '-' },
      { persistentId: '.' },
    ];

    for (const invalidUrlParams of invalidUrlParamsList) {
      console.log('Evaluating', invalidUrlParams);
      await requestTemperatureHumidityExpectingBadRequest(invalidUrlParams);
    }
    expectWarningLogged(invalidUrlParamsList.length);
  });

  it('Search temperature / humidity combine parameters', async () => {
    let response = await requestTemperatureHumidityExpectingOk({
      pageOffset: '1',
      pageLimit: '1',
      measureDateSince: '2025-10-03T11:47:32Z',
      measureDateUntil: '2025-10-03T11:59:28Z',
      persistentId: '3002',
    });
    expect(response.body).toEqual([
      TEMPERATURE_HUMIDITY_DATA[5],
    ]);

    response = await requestTemperatureHumidityExpectingOk({
      pageOffset: '1',
      pageLimit: '2',
      measureDateSince: '2025-10-01T00:00:00Z',
      measureDateUntil: '2025-10-05T00:00:00Z',
      persistentId: '3001',
    });
    expect(response.body).toEqual([
      TEMPERATURE_HUMIDITY_DATA[2],
      TEMPERATURE_HUMIDITY_DATA[4],
    ]);
  });
});

async function requestTemperatureHumidityExpectingOk(query: TemperatureHumidityUrlParams): Promise<supertest.Response> {
  const response = await apiServer
    .get(API.GET_TEMPERATURE_HUMIDITY.endpoint)
    .query(query);
  expectOkJsonResponse(response);
  return response;
}

async function requestTemperatureHumidityExpectingBadRequest(query: TemperatureHumidityUrlParams): Promise<supertest.Response> {
  const response = await apiServer
    .get(API.GET_TEMPERATURE_HUMIDITY.endpoint)
    .query(query);
  expectBadRequestJsonResponse(response);
  return response;
}
