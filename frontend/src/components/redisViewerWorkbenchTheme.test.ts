import { buildRedisWorkbenchTheme } from './redisViewerWorkbenchTheme';

const assertEqual = (actual: unknown, expected: unknown, message: string) => {
  if (actual !== expected) {
    throw new Error(`${message}\nactual: ${String(actual)}\nexpected: ${String(expected)}`);
  }
};

const assertNotEqual = (actual: unknown, expected: unknown, message: string) => {
  if (actual === expected) {
    throw new Error(`${message}\nactual: ${String(actual)}\nnotExpected: ${String(expected)}`);
  }
};

const assertMatch = (value: string, pattern: RegExp, message: string) => {
  if (!pattern.test(value)) {
    throw new Error(`${message}\nactual: ${value}\npattern: ${String(pattern)}`);
  }
};

const darkTheme = buildRedisWorkbenchTheme({
  darkMode: true,
  opacity: 0.72,
  blur: 14,
});

assertEqual(darkTheme.isDark, true, 'dark 主题标记应为 true');
assertMatch(darkTheme.panelBg, /^rgba\(/, 'dark 主题面板背景应为 rgba');
assertMatch(darkTheme.toolbarPrimaryBg, /^linear-gradient\(/, '工具栏主按钮应使用渐变背景');
assertNotEqual(darkTheme.actionDangerBg, darkTheme.actionSecondaryBg, '危险态按钮背景不应与普通按钮相同');
assertNotEqual(darkTheme.treeSelectedBg, darkTheme.treeHoverBg, '树节点选中态与悬浮态不应相同');
assertMatch(darkTheme.appBg, /rgba\(15, 15, 17,/, 'dark 背景应保持中性黑基底');
assertMatch(darkTheme.panelBg, /rgba\(24, 24, 28,/, 'dark 面板背景应保持中性黑灰');
assertMatch(darkTheme.panelBgStrong, /rgba\(31, 31, 36,/, 'dark 强面板背景应保持中性黑灰');
assertEqual(darkTheme.backdropFilter, 'blur(14px)', 'blur 参数应映射为 backdropFilter');

const lightTheme = buildRedisWorkbenchTheme({
  darkMode: false,
  opacity: 1,
  blur: 0,
});

assertEqual(lightTheme.isDark, false, 'light 主题标记应为 false');
assertMatch(lightTheme.panelBg, /^rgba\(/, 'light 主题面板背景应为 rgba');
assertMatch(lightTheme.contentEmptyBg, /^linear-gradient\(/, 'light 空状态背景应为渐变');
assertNotEqual(lightTheme.textPrimary, lightTheme.textSecondary, '主次文本颜色应区分');
assertNotEqual(lightTheme.statusTagBg, lightTheme.statusTagMutedBg, '状态 tag 应区分普通与弱化样式');
assertEqual(lightTheme.backdropFilter, 'none', 'blur=0 时 backdropFilter 应为 none');

console.log('redisViewerWorkbenchTheme tests passed');
