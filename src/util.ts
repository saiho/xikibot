import { spawn } from 'node:child_process';
import {
  _getStandardProps,
  BaseIssue,
  BaseSchema,
  check,
  InferInput,
  InferIssue,
  InferOutput,
  integer,
  isValiError,
  never as neverInput,
  pipe,
  string as stringInput,
  summarize,
  toDate,
  toNumber,
  transform,
} from 'valibot';
import { LOG_NAMESPACE, xikibotInstance } from './global';

export function runCommandAsync(command: string): Promise<void> {
  return new Promise((resolve: () => void, reject: (reason: Error) => void) => {
    let procOutput = '';
    const proc = spawn(command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.on('error', (error) => {
      reject(error);
    });
    proc.stdout?.on('data', (data) => {
      procOutput += data.toString();
    });
    proc.stderr?.on('data', (data) => {
      procOutput += data.toString();
    });
    proc.on('close', (code) => {
      const logMessageBuilder = () => {
        let message = `Command "${command}" terminated with exit code ${code}.`;
        if (procOutput.trim() !== '') {
          message += `\nCommand output >>>>\n${procOutput}<<<<`;
        }
        return message;
      };
      if (code !== 0) {
        reject(new Error(logMessageBuilder()));
      }
      else {
        logDebug(logMessageBuilder); // pass a reference to the function, not the returned message
        resolve();
      }
    });
  });
}

export function logDebug(messageOrLambda: string | (() => string)): void {
  xikibotInstance?.logger.debug(messageOrLambda, LOG_NAMESPACE);
}

export function logInfo(messageOrLambda: string | (() => string)): void {
  xikibotInstance?.logger.info(messageOrLambda, LOG_NAMESPACE);
}

export function logWarning(messageOrErrorOrLambda: string | Error | unknown | (() => string | Error | unknown), includeStack = true): void {
  xikibotInstance?.logger.warning(extractError(messageOrErrorOrLambda, includeStack), LOG_NAMESPACE);
}

export function logError(messageOrErrorOrLambda: string | Error | unknown | (() => string | Error | unknown), includeStack = true): void {
  xikibotInstance?.logger.error(extractError(messageOrErrorOrLambda, includeStack), LOG_NAMESPACE);
}

function extractError(messageOrErrorOrLambda: string | Error | unknown | (() => string | Error | unknown), includeStack = true): () => string {
  return () => {
    const messageOrError = typeof messageOrErrorOrLambda === 'function' ? messageOrErrorOrLambda() : messageOrErrorOrLambda;
    if (isValiError(messageOrError)) {
      return summarize(messageOrError.issues);
    }
    else if (includeStack && (messageOrError as Error).stack) {
      return (messageOrError as Error).stack!;
    }
    return (messageOrError as Error).message ?? messageOrError.toString();
  };
}

// ------- VALIDATION UTILS ------- //

type Default<TWrapped extends BaseSchema<unknown, unknown, BaseIssue<unknown>>> = InferOutput<TWrapped> | Readonly<InferOutput<TWrapped>>;

export interface CustomOptionalSchema<
  TWrapped extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
  TDefault extends Default<TWrapped> | undefined,
> extends BaseSchema<
    InferInput<TWrapped> | null | undefined,
    undefined extends TDefault
      ? InferOutput<TWrapped> | undefined
      : InferOutput<TWrapped>,
    InferIssue<TWrapped>
  > {
  readonly type: 'optional';
  readonly reference: typeof optional;
  readonly expects: `(${TWrapped['expects']} | null | undefined)`;
  readonly wrapped: TWrapped;
  readonly default: TDefault;
}

/**
 * Alternative to valibot `optional`, with two differences:
 * - The default value is defined with the output type and does not pass the validations/transformations of the schema.
 * - The input can be null or undefined, but a null input is converted to an undefined output.
 */
export function optional<
  const TWrapped extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(wrapped: TWrapped): CustomOptionalSchema<TWrapped, undefined>;
export function optional<
  const TWrapped extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
  const TDefault extends Default<TWrapped>,
>(wrapped: TWrapped, default_: TDefault): CustomOptionalSchema<TWrapped, TDefault>;
// @__NO_SIDE_EFFECTS__
export function optional(
  wrapped: BaseSchema<unknown, unknown, BaseIssue<unknown>>,
  default_?: unknown,
): CustomOptionalSchema<BaseSchema<unknown, unknown, BaseIssue<unknown>>, unknown> {
  return {
    'kind': 'schema',
    'type': 'optional',
    'reference': optional,
    'expects': `(${wrapped.expects} | null | undefined)`,
    'async': false,
    wrapped,
    'default': default_,
    get '~standard'() {
      return _getStandardProps(this);
    },
    '~run'(dataset, config) {
      if (dataset.value === null || dataset.value === undefined || dataset.value === default_) {
        return ({ typed: true, value: default_ });
      }
      return this.wrapped['~run'](dataset, config);
    },
  };
}

// nonBlank is necessary because toNumber converts '' or ' ' to 0
const _stringToInteger = pipe(stringInput(), nonBlank(), toNumber(), integer());
export function stringToInteger() {
  return _stringToInteger;
}

// Use toDate to restrict the min/max values of an epoch integer
// nonBlank is not necessary because toDate does not accept ''
const _stringToDate = pipe(stringInput(), toDate());
export function stringToDate() {
  return _stringToDate;
}

export function constant<T>(value: T) {
  return optional(pipe(neverInput(), transform(() => value)), value);
}

export function nonBlankString() {
  return pipe(stringInput(), nonBlank());
}

function nonBlank() {
  return check((value: string) => value.trim().length > 0, 'String should not be blank');
}
