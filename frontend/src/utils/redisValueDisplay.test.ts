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

  it('preserves large integer literals when formatting json in auto mode', () => {
    const value = '{"subSessionIds":["java.util.ArrayList",[1494694751571226624]],"currentSubSessionId":1494694751571226624}';
    const formatted = formatRedisStringValue(value);

    expect(formatted).toMatchObject({
      isBinary: false,
      isJson: true,
      encoding: 'UTF-8',
    });
    expect(formatted.displayValue).toContain('1494694751571226624');
    expect(formatted.displayValue).not.toContain('1494694751571226600');
  });

  it('keeps json string escape rendering consistent in auto mode', () => {
    const formatted = formatRedisStringValue('{"name":"\\u4e2d\\u6587","id":1494694751571226624}');

    expect(formatted.displayValue).toContain('"name": "中文"');
    expect(formatted.displayValue).toContain('"id": 1494694751571226624');
  });

  it('falls back to hex for obvious binary values', () => {
    expect(formatRedisStringValue('\u0000\u0001\u0002abc')).toMatchObject({
      isBinary: true,
      encoding: 'HEX',
    });
  });
});
