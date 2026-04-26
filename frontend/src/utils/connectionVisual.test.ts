import { describe, expect, it } from 'vitest';

import type { SavedConnection } from '../types';
import {
  resolveConnectionAccentColor,
  resolveConnectionIconType,
} from './connectionVisual';

const baseConnection: SavedConnection = {
  id: 'conn-1',
  name: 'Orders',
  config: {
    id: 'conn-1',
    type: 'mysql',
    host: 'db.local',
    port: 3306,
    user: 'root',
  },
};

describe('connectionVisual', () => {
  it('uses custom icon metadata as the connection visual identity', () => {
    const connection: SavedConnection = {
      ...baseConnection,
      iconType: 'postgres',
      iconColor: '#2f855a',
    };

    expect(resolveConnectionIconType(connection)).toBe('postgres');
    expect(resolveConnectionAccentColor(connection)).toBe('#2f855a');
  });

  it('falls back to the data source default color when custom color is blank', () => {
    expect(resolveConnectionIconType(baseConnection)).toBe('mysql');
    expect(resolveConnectionAccentColor(baseConnection)).toBe('#00758F');
  });

  it('ignores invalid custom colors instead of rendering unsafe CSS values', () => {
    const connection: SavedConnection = {
      ...baseConnection,
      iconColor: 'url(javascript:alert(1))',
    };

    expect(resolveConnectionAccentColor(connection)).toBe('#00758F');
  });
});
