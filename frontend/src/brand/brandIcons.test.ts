import { describe, expect, it } from 'vitest';
import {
  BRAND_ICONS,
  resolveBrandAboutSrc,
  resolveBrandDockSrc,
  resolveBrandFullSrc,
  resolveBrandIconSrc,
} from './brandIcons';

describe('brand icon asset resolution', () => {
  it('uses one selected lossless asset for the favicon, picker, about page, and Dock', () => {
    for (const icon of BRAND_ICONS) {
      const selectedAsset = resolveBrandIconSrc(icon.id);
      expect(selectedAsset).toMatch(/^\/brand-icons\/\d{2}-.+\.webp$/);
      expect(resolveBrandFullSrc(icon.id)).toBe(selectedAsset);
      expect(resolveBrandAboutSrc(icon.id)).toBe(selectedAsset);
      expect(resolveBrandDockSrc(icon.id)).toBe(selectedAsset);
    }
  });
});
