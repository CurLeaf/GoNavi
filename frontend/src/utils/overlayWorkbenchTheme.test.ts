import { buildOverlayWorkbenchTheme } from './overlayWorkbenchTheme';

const assertEqual = (actual: unknown, expected: unknown, message: string) => {
  if (actual !== expected) {
    throw new Error(`${message}\nactual: ${String(actual)}\nexpected: ${String(expected)}`);
  }
};

const assertMatch = (value: string, pattern: RegExp, message: string) => {
  if (!pattern.test(value)) {
    throw new Error(`${message}\nactual: ${value}\npattern: ${String(pattern)}`);
  }
};

const darkTheme = buildOverlayWorkbenchTheme(true);
assertEqual(darkTheme.isDark, true, 'dark 主题标记应为 true');
assertMatch(darkTheme.shellBg, /rgba\(15, 15, 17,/, 'dark 弹层背景应保持中性黑');
assertMatch(darkTheme.sectionBg, /rgba\(255,?\s*255,?\s*255,?\s*0\.03\)/, 'dark section 背景透明度应匹配');
assertEqual(darkTheme.iconColor, '#ffd666', 'dark 图标色应为金色强调');

const lightTheme = buildOverlayWorkbenchTheme(false);
assertEqual(lightTheme.isDark, false, 'light 主题标记应为 false');
assertMatch(lightTheme.shellBg, /rgba\(255,255,255,0\.98\)/, 'light 弹层背景透明度应匹配');
assertMatch(lightTheme.sectionBg, /rgba\(255,?\s*255,?\s*255,?\s*0\.84\)/, 'light section 背景透明度应匹配');
assertEqual(lightTheme.iconColor, '#1677ff', 'light 图标色应为蓝色强调');

console.log('overlayWorkbenchTheme tests passed');
