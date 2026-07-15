import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(
  fileURLToPath(new globalThis.URL('./App.tsx', import.meta.url)),
  'utf8',
);
const brandIconsSource = readFileSync(
  fileURLToPath(new globalThis.URL('./brand/brandIcons.ts', import.meta.url)),
  'utf8',
);
const brandIconsDirectory = fileURLToPath(
  new globalThis.URL('../public/brand-icons/', import.meta.url),
);

describe('about brand lockup', () => {
  it('uses a transparent lockup without a tile background on the about page', () => {
    expect(appSource).toContain('resolveBrandAboutSrc');
    expect(appSource).toContain('src={resolveBrandAboutSrc(brandIconId)}');

    const aboutLogoStart = appSource.indexOf('src={resolveBrandAboutSrc(brandIconId)}');
    const aboutLogoSnippet = appSource.slice(aboutLogoStart, aboutLogoStart + 640);
    expect(aboutLogoSnippet).toContain("background: 'transparent'");
    expect(aboutLogoSnippet).toContain("boxShadow: 'none'");
  });

  it('defines a transparent about asset for every selectable mascot', () => {
    const aboutAssetPaths = brandIconsSource.match(/aboutPath: '\/brand-icons\/\d{2}-.+-about\.png'/g) || [];
    expect(aboutAssetPaths).toHaveLength(10);
    for (const declaration of aboutAssetPaths) {
      const assetPath = declaration.match(/'([^']+)'/)?.[1];
      expect(assetPath).toBeTruthy();
      expect(readFileSync(`${brandIconsDirectory}${assetPath?.replace('/brand-icons/', '')}`, 'utf8')).not.toBe('');
    }
  });
});
