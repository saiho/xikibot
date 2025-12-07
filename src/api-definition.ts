import {
  BaseIssue,
  BaseSchema,
  maxValue,
  minValue,
  pipe,
  strictObject,
  string as stringInput,
  values,
} from 'valibot';
import { constant, optional, stringToDate, stringToInteger } from './util';

export interface ApiEndpoint {
  readonly endpoint: string;
}

export interface ApiEndpointWithParams<T> extends ApiEndpoint {
  readonly urlParamsSchema: BaseSchema<unknown, T, BaseIssue<unknown>>;
}

export interface Pagination {
  order: string;
  pageLimit: number;
  pageOffset?: number;
}

export interface MeasureDateRange {
  measureDateSince?: Date;
  measureDateUntil?: Date;
  persistentId?: number;
}

export interface TemperatureHumidityParams extends Pagination, MeasureDateRange {
}

export interface FanStateParams extends Pagination, MeasureDateRange {
}

export const API = {
  GET_BUILD_INFO: {
    endpoint: '/api/buildInfo',
  },
  GET_TRIGGERS: {
    endpoint: '/api/triggers',
  },
  CHECK_COMPONENTS: {
    endpoint: '/api/components/check',
  },
  GET_TEMPERATURE_HUMIDITY: {
    endpoint: '/api/temperatureHumidity',
    urlParamsSchema: strictObject({
      order: constant('measureDate ASC'),
      pageLimit: optional(pipe(stringToInteger(), minValue(1), maxValue(10000)), 40),
      pageOffset: optional(pipe(stringToInteger(), minValue(0))),
      measureDateSince: optional(stringToDate()),
      measureDateUntil: optional(stringToDate()),
      persistentId: optional(stringToInteger()),
    }),
  } satisfies ApiEndpointWithParams<TemperatureHumidityParams>,
  GET_FAN_STATE: {
    endpoint: '/api/fanState',
    urlParamsSchema: strictObject({
      order: optional(pipe(stringInput(), values(['measureDate ASC', 'measureDate DESC'])), 'measureDate ASC'),
      pageLimit: optional(pipe(stringToInteger(), minValue(1), maxValue(10000)), 40),
      pageOffset: optional(pipe(stringToInteger(), minValue(0))),
      measureDateSince: optional(stringToDate()),
      measureDateUntil: optional(stringToDate()),
      persistentId: optional(stringToInteger()),
    }),
  } satisfies ApiEndpointWithParams<FanStateParams>,
  GET_CURRENT_FAN_STATE: {
    endpoint: '/api/fanState/current',
  },
  GET_COMPONENT_HISTORY: {
    endpoint: '/api/component/history',
  },
  GET_CURRENT_COMPONENT: {
    endpoint: '/api/component/current',
  },
  CHECK_DB_INTEGRITY: {
    endpoint: '/api/db/checkIntegrity',
  },
} as const satisfies Record<string, ApiEndpoint | ApiEndpointWithParams<unknown>>;
