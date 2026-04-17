import { describe, expect, it } from 'vitest';

import { decodeRedisUtf8Value, formatRedisStringValue } from './redisValueDisplay';

const toRedisByteString = (text: string): string => (
  Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join('')
);

describe('redisValueDisplay', () => {
  it('keeps already decoded unicode text in utf8 mode', () => {
    expect(decodeRedisUtf8Value('中文内容')).toBe('中文内容');
  });

  it('decodes utf8 byte strings in auto mode', () => {
    expect(formatRedisStringValue(toRedisByteString('中文内容'))).toMatchObject({
      displayValue: '中文内容',
      isBinary: false,
      isJson: false,
      encoding: 'UTF-8',
    });
  });

  it('falls back to hex for obvious binary values', () => {
    expect(formatRedisStringValue('\u0000\u0001\u0002abc')).toMatchObject({
      isBinary: true,
      encoding: 'HEX',
    });
  });
});
