import { describe, expect, it } from 'vitest';

import {
  PROVIDER_PRESET_CARD_BASE_STYLE,
  PROVIDER_PRESET_CARD_CONTENT_STYLE,
  PROVIDER_PRESET_CARD_DESCRIPTION_STYLE,
  PROVIDER_PRESET_GRID_STYLE,
  PROVIDER_PRESET_CARD_TITLE_STYLE,
} from './aiSettingsPresetLayout';

describe('ai settings preset layout', () => {
  it('uses a fixed grid auto row height so provider bubbles stay visually consistent across rows', () => {
    expect(PROVIDER_PRESET_GRID_STYLE).toMatchObject({
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 6,
      gridAutoRows: '96px',
      alignItems: 'stretch',
    });
  });

  it('stretches each provider card to fill the row height', () => {
    expect(PROVIDER_PRESET_CARD_BASE_STYLE).toMatchObject({
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      height: '100%',
      minHeight: '96px',
      overflow: 'hidden',
    });
  });

  it('keeps the text column compact instead of pinning the description to the bottom', () => {
    expect(PROVIDER_PRESET_CARD_CONTENT_STYLE).toMatchObject({
      minWidth: 0,
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
    });

    expect(PROVIDER_PRESET_CARD_DESCRIPTION_STYLE).toMatchObject({
      marginTop: 4,
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    });

    expect(PROVIDER_PRESET_CARD_TITLE_STYLE).toMatchObject({
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    });
  });
});
