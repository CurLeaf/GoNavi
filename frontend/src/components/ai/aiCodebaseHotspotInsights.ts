export interface CodebaseHotspotEntry {
  path: string;
  lines: number;
  area: string;
  riskLevel: 'medium' | 'high' | 'critical';
  readiness: 'readyToExtract' | 'needsCharacterizationTests';
  why: string;
  preferredNextSlice: string;
  safeSeam: string;
  suggestedSlices: string[];
  testTargets: string[];
  verificationPlan: string[];
}

export interface CodebaseHotspotSnapshotOptions {
  keyword?: string;
  minLines?: number;
  limit?: number;
  includeRecommendations?: boolean;
}

const CODEBASE_HOTSPOT_SNAPSHOT: CodebaseHotspotEntry[] = [
  {
    path: 'frontend/src/components/Sidebar.tsx',
    lines: 8901,
    area: 'workspace-navigation',
    riskLevel: 'critical',
    readiness: 'needsCharacterizationTests',
    why: '左侧树、命令面板、上下文菜单和连接动作集中在单文件，修改入口多且回归面大。',
    preferredNextSlice: '外部 SQL 目录弹窗',
    safeSeam: '优先抽出无状态弹窗/菜单配置，再处理依赖连接树状态的动作分发。',
    suggestedSlices: ['V2 命令面板', '外部 SQL 目录弹窗', '连接树动作', '批量操作弹窗'],
    testTargets: ['Sidebar.locate-toolbar.test.tsx', 'sidebarV2Utils.test.ts'],
    verificationPlan: [
      'npm --prefix frontend test -- Sidebar.locate-toolbar.test.tsx sidebarV2Utils.test.ts',
      'npm --prefix frontend run build',
      '浏览器打开侧边栏，验证连接树、右键菜单和外部 SQL 目录入口可用。',
    ],
  },
  {
    path: 'frontend/src/components/DataGrid.tsx',
    lines: 8080,
    area: 'result-grid',
    riskLevel: 'critical',
    readiness: 'needsCharacterizationTests',
    why: '结果展示、编辑、DDL、导出和列操作耦合，容易让单点修复影响查询结果区。',
    preferredNextSlice: '结果导出工具栏',
    safeSeam: '优先抽出纯展示工具栏和菜单项生成，不先移动数据编辑事务状态。',
    suggestedSlices: ['结果导出工具栏', '列头菜单', 'DDL 视图', '单元格编辑事务提示'],
    testTargets: ['DataGrid.layout.test.tsx', 'DataGrid.ddl.test.tsx'],
    verificationPlan: [
      'npm --prefix frontend test -- DataGrid.layout.test.tsx DataGrid.ddl.test.tsx',
      'npm --prefix frontend run build',
      '浏览器执行查询并验证结果表、导出、列菜单和表格编辑入口。',
    ],
  },
  {
    path: 'frontend/src/components/ConnectionModal.tsx',
    lines: 6811,
    area: 'connection-form',
    riskLevel: 'critical',
    readiness: 'readyToExtract',
    why: '多数据源连接表单仍集中在一个组件，新增数据源或密钥规则时容易互相影响。',
    preferredNextSlice: 'TLS 配置区',
    safeSeam: '连接表单已有 presentation utils，可先抽出按数据源显示的配置分区组件。',
    suggestedSlices: ['SSH/代理配置区', 'TLS 配置区', 'MongoDB 配置区', 'JVM 配置区'],
    testTargets: ['ConnectionModal.edit-password.test.tsx', 'connectionModalPresentation.test.ts'],
    verificationPlan: [
      'npm --prefix frontend test -- ConnectionModal.edit-password.test.tsx connectionModalPresentation.test.ts',
      'npm --prefix frontend run build',
      '浏览器打开新增/编辑连接弹窗，切换 MySQL、Oracle、MongoDB、Redis 表单。',
    ],
  },
  {
    path: 'frontend/src/components/QueryEditor.tsx',
    lines: 5275,
    area: 'sql-editor',
    riskLevel: 'critical',
    readiness: 'readyToExtract',
    why: 'SQL 编辑、执行、事务、结果区布局和快捷键状态集中，事务和结果区回归风险高。',
    preferredNextSlice: '编辑器工具栏',
    safeSeam: '工具栏 JSX 可通过 props 透传状态和回调，避免触碰 SQL 执行、事务和结果分页逻辑。',
    suggestedSlices: ['结果区工具栏', '事务状态条', '执行日志提示', '编辑器快捷键绑定'],
    testTargets: ['QueryEditor.result-panel.test.tsx', 'useSqlEditorTransactionController.test.ts'],
    verificationPlan: [
      'npm --prefix frontend test -- QueryEditor.external-sql-save.test.tsx useSqlEditorTransactionController.test.tsx',
      'npm --prefix frontend run build',
      '浏览器打开 SQL 编辑器，验证连接/库选择、运行、保存、美化、结果区显隐和 AI 菜单。',
    ],
  },
  {
    path: 'frontend/src/components/TableDesigner.tsx',
    lines: 3549,
    area: 'table-designer',
    riskLevel: 'high',
    readiness: 'needsCharacterizationTests',
    why: '字段编辑、索引、外键、分区和 DDL 生成集中，数据库方言差异容易扩散。',
    preferredNextSlice: '字段编辑表格',
    safeSeam: '先补字段类型/长度/NULL/默认值快照测试，再抽字段编辑表格。',
    suggestedSlices: ['字段编辑表格', '索引配置面板', '外键配置面板', '方言 DDL 预览'],
    testTargets: ['TableDesigner.*.test.tsx', 'tableDesignerSchemaSql.test.ts'],
    verificationPlan: [
      'npm --prefix frontend test -- tableDesignerSchemaSql.test.ts',
      'npm --prefix frontend run build',
      '浏览器打开对象设计，验证字段、索引、外键和 DDL 预览。',
    ],
  },
  {
    path: 'frontend/src/components/RedisViewer.tsx',
    lines: 2120,
    area: 'redis-browser',
    riskLevel: 'high',
    readiness: 'readyToExtract',
    why: 'Key 浏览、不同数据结构编辑、TTL、编码显示和新增弹窗集中，Redis Cluster/Sentinel 后续验证面较宽。',
    preferredNextSlice: 'Key 搜索栏',
    safeSeam: '先抽出搜索栏和拓扑提示，避免提前改动各数据结构编辑器。',
    suggestedSlices: ['Key 搜索栏', 'String/List/Set/ZSet/Hash/Stream 编辑器', '新增 Key 弹窗'],
    testTargets: ['redisViewerTree.test.ts', 'RedisViewer.*.test.tsx'],
    verificationPlan: [
      'npm --prefix frontend test -- redisViewerTree.test.ts',
      'npm --prefix frontend run build',
      '浏览器打开 Redis 连接，验证 key 搜索、刷新、TTL 和新增入口。',
    ],
  },
  {
    path: 'frontend/src/components/DriverManagerModal.tsx',
    lines: 1729,
    area: 'driver-manager',
    riskLevel: 'high',
    readiness: 'readyToExtract',
    why: '驱动安装、状态展示、下载和可选代理逻辑较多，适合继续拆出状态卡片和操作区。',
    preferredNextSlice: '驱动状态列表',
    safeSeam: '状态列表是展示型组件，可先抽出再保留安装/下载动作在父组件。',
    suggestedSlices: ['驱动状态列表', '安装操作区', '下载日志区'],
    testTargets: ['DriverManagerModal.*.test.tsx'],
    verificationPlan: [
      'npm --prefix frontend test -- DriverManagerModal.*.test.tsx',
      'npm --prefix frontend run build',
      '浏览器打开驱动管理，验证状态展示、安装按钮和日志区域。',
    ],
  },
  {
    path: 'frontend/src/components/DataSyncModal.tsx',
    lines: 1526,
    area: 'data-sync',
    riskLevel: 'high',
    readiness: 'needsCharacterizationTests',
    why: '数据同步连接、表映射、预检查和执行结果集中，数据库方言问题容易隐藏。',
    preferredNextSlice: '同步预检查结果',
    safeSeam: '先把预检查结果做成纯展示组件，保留连接选择和执行动作在父组件。',
    suggestedSlices: ['连接选择区', '表映射区', '同步预检查结果', '执行日志区'],
    testTargets: ['DataSyncModal.*.test.tsx'],
    verificationPlan: [
      'npm --prefix frontend test -- DataSyncModal.*.test.tsx',
      'npm --prefix frontend run build',
      '浏览器打开数据同步，验证连接选择、表映射、预检查和执行日志。',
    ],
  },
  {
    path: 'frontend/src/components/JVMDiagnosticConsole.tsx',
    lines: 1146,
    area: 'jvm-diagnostics',
    riskLevel: 'medium',
    readiness: 'readyToExtract',
    why: '诊断命令、输出块、权限提示和会话状态可继续拆分，降低 JVM 诊断回归面。',
    preferredNextSlice: '诊断输出区',
    safeSeam: '输出区主要依赖命令结果数组，可先抽成展示组件。',
    suggestedSlices: ['命令输入区', '诊断输出区', '权限提示区'],
    testTargets: ['JVMDiagnosticConsole.*.test.tsx'],
    verificationPlan: [
      'npm --prefix frontend test -- JVMDiagnosticConsole.*.test.tsx',
      'npm --prefix frontend run build',
      '浏览器打开 JVM 诊断面板，验证命令输入、输出和权限提示。',
    ],
  },
];

const normalizeKeyword = (value: unknown): string => String(value || '').trim().toLowerCase();

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const matchesKeyword = (entry: CodebaseHotspotEntry, keyword: string): boolean => {
  if (!keyword) {
    return true;
  }
  return [
    entry.path,
    entry.area,
    entry.riskLevel,
    entry.why,
    ...entry.suggestedSlices,
    ...entry.testTargets,
  ].some((item) => item.toLowerCase().includes(keyword));
};

export const buildCodebaseHotspotSnapshot = ({
  keyword,
  minLines,
  limit,
  includeRecommendations = true,
}: CodebaseHotspotSnapshotOptions = {}) => {
  const normalizedKeyword = normalizeKeyword(keyword);
  const normalizedMinLines = clampNumber(minLines, 1000, 1, 20000);
  const normalizedLimit = clampNumber(limit, 8, 1, 30);
  const matched = CODEBASE_HOTSPOT_SNAPSHOT
    .filter((entry) => entry.lines >= normalizedMinLines)
    .filter((entry) => matchesKeyword(entry, normalizedKeyword))
    .slice(0, normalizedLimit);
  const criticalCount = matched.filter((entry) => entry.riskLevel === 'critical').length;
  const highCount = matched.filter((entry) => entry.riskLevel === 'high').length;

  return {
    kind: 'codebase_hotspots',
    source: 'static_maintainability_snapshot',
    evidence: {
      measuredAt: '2026-06-12',
      note: '基于当前仓库前端文件行数热点快照；拆分前应优先选择 readyToExtract 且已有测试覆盖的 slice。',
    },
    filters: {
      keyword: normalizedKeyword || undefined,
      minLines: normalizedMinLines,
      limit: normalizedLimit,
      includeRecommendations,
    },
    summary: {
      totalKnownHotspots: CODEBASE_HOTSPOT_SNAPSHOT.length,
      totalMatched: matched.length,
      maxLines: matched[0]?.lines || 0,
      criticalCount,
      highCount,
    },
    hotspots: matched.map((entry, index) => ({
      rank: index + 1,
      path: entry.path,
      lines: entry.lines,
      area: entry.area,
      riskLevel: entry.riskLevel,
      readiness: entry.readiness,
      why: entry.why,
      preferredNextSlice: includeRecommendations ? entry.preferredNextSlice : undefined,
      safeSeam: includeRecommendations ? entry.safeSeam : undefined,
      suggestedSlices: includeRecommendations ? entry.suggestedSlices : [],
      testTargets: includeRecommendations ? entry.testTargets : [],
      verificationPlan: includeRecommendations ? entry.verificationPlan : [],
    })),
    nextActions: includeRecommendations
      ? [
        '优先选择 readiness=readyToExtract 且已有测试覆盖的 slice 做小步拆分，避免直接重写整个大组件。',
        '每次拆分都要先确认 safeSeam，不跨越 SQL 执行、事务、连接密钥或数据库方言边界。',
        '拆分后至少运行对应组件测试、相关 utils 测试和 npm --prefix frontend run build。',
        '涉及可见 UI 的拆分需要用浏览器打开真实页面做一次冒烟验证。',
      ]
      : [],
  };
};
