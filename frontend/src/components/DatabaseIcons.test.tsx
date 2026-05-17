import { describe, expect, it } from 'vitest';

import { DB_ICON_TYPES, getDbIconLabel } from './DatabaseIcons';

describe('DatabaseIcons', () => {
  it('includes InterSystems IRIS in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('iris');
    expect(getDbIconLabel('iris')).toBe('InterSystems IRIS');
  });
});
