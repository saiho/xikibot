import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { BaseIssue, BaseSchema, ErrorMessage, isValiError, ObjectEntries, parse, StrictObjectIssue, StrictObjectSchema } from 'valibot';
import { API_PORT } from './global';
import { API } from './api-definition';
import { logDebug, logError, logWarning, promiseWithResolvers } from './util';
import { getTriggers } from './trigger';
import {
  checkDbIntegrity,
  getComponentHistory,
  getCurrentComponent,
  getCurrentFanState,
  getFanState,
  getTemperatureHumidity,
} from './storage';
import { checkComponents } from './component.common';

/* eslint-disable no-var */

// Set at build-time by esbuild
declare var __BUILD_VERSION__: string;
declare var __BUILD_TIMESTAMP__: string;

const server = createServer(onRequest);
let started = false;

export function startAPIServer(): void {
  if (started) {
    return;
  }
  server.listen(API_PORT);
  logDebug(`Xikibot API server started on port ${API_PORT}`);
  started = true;
}

export function stopAPIServer(): Promise<void> {
  if (!started) {
    return Promise.resolve();
  }
  const { promise, resolve, reject } = promiseWithResolvers<void>();
  server.close((err) => {
    started = false;
    if (err) {
      logError(`Xikibot API server stopped with error: ${err}`);
      reject(err);
    }
    else {
      logDebug('Xikibot API server stopped');
      resolve();
    }
  });
  return promise;
}

function onRequest(request: IncomingMessage, response: ServerResponse): void {
  try {
    if (request.url) {
      const parsedUrl = new URL(request.url, 'http://base');
      if (request.method === 'GET') {
        switch (parsedUrl.pathname) {
          case API.GET_BUILD_INFO.endpoint:
            reply(response, buildInfo());
            return;
          case API.GET_TRIGGERS.endpoint:
            reply(response, getTriggers());
            return;
          case API.CHECK_COMPONENTS.endpoint:
            reply(response, checkComponents());
            return;
          case API.GET_TEMPERATURE_HUMIDITY.endpoint:
            reply(response, getTemperatureHumidity(extractURLSearchParams(parsedUrl.searchParams, API.GET_TEMPERATURE_HUMIDITY.urlParamsSchema)));
            return;
          case API.GET_FAN_STATE.endpoint:
            reply(response, getFanState(extractURLSearchParams(parsedUrl.searchParams, API.GET_FAN_STATE.urlParamsSchema)));
            return;
          case API.GET_CURRENT_FAN_STATE.endpoint:
            reply(response, getCurrentFanState());
            return;
          case API.GET_COMPONENT_HISTORY.endpoint:
            reply(response, getComponentHistory());
            return;
          case API.GET_CURRENT_COMPONENT.endpoint:
            reply(response, getCurrentComponent());
            return;
          case API.CHECK_DB_INTEGRITY.endpoint:
            reply(response, checkDbIntegrity());
            return;
        }
      }
    }

    reply(response, { error: 'Invalid request' }, 404);
  }
  catch (error) {
    if (isValiError(error)) {
      logWarning(error);
      reply(response, { error: 'Bad request', description: error.message }, 400);
    }
    else {
      logError(error);
      reply(response, { error: 'Internal error', description: (error as Error).message }, 500);
    }
  }
}

function extractURLSearchParams<T>(urlParams: URLSearchParams, urlParamsSchema: BaseSchema<unknown, T, BaseIssue<unknown>> & StrictObjectSchema<ObjectEntries, ErrorMessage<StrictObjectIssue> | undefined>): T {
  const urlParamsRecord: Record<string, unknown> = {};
  urlParams.forEach((value, key) => urlParamsRecord[key] = value);
  return parse(urlParamsSchema, urlParamsRecord, { abortEarly: true });
}

function reply(response: ServerResponse, body: unknown | Promise<unknown>, statusCode?: number): void {
  response.writeHead(statusCode ?? 200, { 'Content-Type': 'application/json' });
  if (body) {
    if (body instanceof Promise) {
      body.then(resolvedBody => response.end(JSON.stringify(resolvedBody)));
    }
    else {
      response.end(JSON.stringify(body));
    }
  }
  else {
    response.end();
  }
}

function buildInfo(): { version: string; timestamp: string } {
  return { version: __BUILD_VERSION__, timestamp: __BUILD_TIMESTAMP__ };
}
