import { describe, expect, it } from 'vitest';

import { normalizeAiMarkdown } from './aiMarkdown';

describe('normalizeAiMarkdown', () => {
  it('inserts a missing newline after the fenced code language marker', () => {
    expect(normalizeAiMarkdown('```sqlSELECT COUNT(*) AS order_count\nFROM customer_order;\n```')).toBe(
      '```sql\nSELECT COUNT(*) AS order_count\nFROM customer_order;\n```',
    );
  });
});
