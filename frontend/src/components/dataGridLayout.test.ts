import { calculateTableBodyBottomPadding, calculateVirtualTableScrollX } from './dataGridLayout';

const assertEqual = (actual: unknown, expected: unknown, message: string) => {
  if (actual !== expected) {
    throw new Error(`${message}\nactual: ${String(actual)}\nexpected: ${String(expected)}`);
  }
};

assertEqual(
  calculateTableBodyBottomPadding({
    hasHorizontalOverflow: false,
    floatingScrollbarHeight: 10,
    floatingScrollbarGap: 6,
  }),
  0,
  '无横向滚动条时不应增加底部间距'
);

assertEqual(
  calculateTableBodyBottomPadding({
    hasHorizontalOverflow: true,
    floatingScrollbarHeight: 10,
    floatingScrollbarGap: 6,
  }),
  28,
  '默认悬浮滚动条应预留滚动条高度、间距和额外安全区'
);

assertEqual(
  calculateTableBodyBottomPadding({
    hasHorizontalOverflow: true,
    floatingScrollbarHeight: 14,
    floatingScrollbarGap: 4,
  }),
  30,
  '较粗滚动条场景下应同步放大底部安全区'
);

assertEqual(
  calculateVirtualTableScrollX({
    totalWidth: 646,
    tableViewportWidth: 1200,
    isMacLike: false,
  }),
  1200,
  '列总宽小于视口时应按视口宽度返回 scroll.x，避免 header/body 走两套宽度'
);

assertEqual(
  calculateVirtualTableScrollX({
    totalWidth: 646,
    tableViewportWidth: 0,
    isMacLike: false,
  }),
  646,
  '未拿到视口宽度时应退回列宽总和'
);

assertEqual(
  calculateVirtualTableScrollX({
    totalWidth: 1200,
    tableViewportWidth: 800,
    isMacLike: true,
  }),
  1202,
  'macOS 横向溢出时仍需额外预留 2px 以稳定滚动轨道'
);

console.log('dataGridLayout tests passed');
