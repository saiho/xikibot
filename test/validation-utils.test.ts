import { describe, expect, it } from 'vitest';
import {
  pipe,
  strictObject,
  number as numberInput,
  minValue,
  safeParse,
  transform,
} from 'valibot';
import { constant, optional } from '../src/util';

describe('Validation utils', () => {
  it('Custom optional without default', () => {
    const schema = strictObject({
      v1: optional(pipe(numberInput(), minValue(7), transform(value => value.toString() + ' TRANSFORMED'))),
    });

    let result = safeParse(schema, { v1: 10 });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ v1: '10 TRANSFORMED' });

    result = safeParse(schema, { v1: null });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ v1: undefined });

    result = safeParse(schema, { v1: undefined });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ v1: undefined });

    result = safeParse(schema, { });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ });

    result = safeParse(schema, { v1: 'WRONG' });
    expect(result.success).toBe(false);
    expect(result.issues![0].message).toBe('Invalid type: Expected number but received "WRONG"');

    result = safeParse(schema, { v1: 4 });
    expect(result.success).toBe(false);
    expect(result.issues![0].message).toBe('Invalid value: Expected >=7 but received 4');
  });

  it('Custom optional with default', () => {
    const schema = strictObject({
      v1: optional(pipe(numberInput(), minValue(7), transform(value => value.toString() + ' TRANSFORMED')), 'THE DEFAULT'),
    });

    let result = safeParse(schema, { v1: 10 });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ v1: '10 TRANSFORMED' });

    result = safeParse(schema, { v1: null });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ v1: 'THE DEFAULT' });

    result = safeParse(schema, { v1: undefined });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ v1: 'THE DEFAULT' });

    result = safeParse(schema, { });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ v1: 'THE DEFAULT' });

    result = safeParse(schema, { v1: 'WRONG' });
    expect(result.success).toBe(false);
    expect(result.issues![0].message).toBe('Invalid type: Expected number but received "WRONG"');

    result = safeParse(schema, { v1: 4 });
    expect(result.success).toBe(false);
    expect(result.issues![0].message).toBe('Invalid value: Expected >=7 but received 4');
  });

  it('Constant', () => {
    const schema = strictObject({
      v1: constant('SOME CONSTANT'),
    });

    let result = safeParse(schema, { });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ v1: 'SOME CONSTANT' });

    // This case is not desired, but acceptable
    result = safeParse(schema, { v1: null });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ v1: 'SOME CONSTANT' });

    // This case is not desired, but acceptable
    result = safeParse(schema, { v1: undefined });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ v1: 'SOME CONSTANT' });

    // This case is not desired, but acceptable
    result = safeParse(schema, { v1: 'SOME CONSTANT' });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ v1: 'SOME CONSTANT' });

    result = safeParse(schema, { v1: 'DON\'T ACCEPT THIS' });
    expect(result.success).toBe(false);
    expect(result.issues![0].message).toBe('Invalid type: Expected never but received "DON\'T ACCEPT THIS"');
  });
});
