export interface CodebaseHotspotEntry {
  path: string;
  lines: number;
  area: string;
  riskLevel: 'medium' | 'high' | 'critical';
  why: string;
  suggestedSlices: string[];
  testTargets: string[];
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
    lines: 8910,
    area: 'workspace-navigation',
    riskLevel: 'critical',
    why: '左侧树、命令面板、上下文菜单和连接动作集中在单文件，修改入口多且回归面大。',
    suggestedSlices: ['V2 命令面板', '外部 SQL 目录弹窗', '连接树动作', '批量操作弹窗'],
    testTargets: ['Sidebar.locate-toolbar.test.tsx', 'sidebarV2Utils.test.ts'],
  },
  {
    path: 'frontend/src/components/DataGrid.tsx',
    lines: 8080,
    area: 'result-grid',
    riskLevel: 'critical',
    why: '结果展示、编辑、DDL、导出和列操作耦合，容易让单点修复影响查询结果区。',
    suggestedSlices: ['结果导出工具栏', '列头菜单', 'DDL 视图', '单元格编辑事务提示'],
    testTargets: ['DataGrid.layout.test.tsx', 'DataGrid.ddl.test.tsx'],
  },
  {
    path: 'frontend/src/components/ConnectionModal.tsx',
    lines: 7462,
    area: 'connection-form',
    riskLevel: 'critical',
    why: '多数据源连接表单仍集中在一个组件，新增数据源或密钥规则时容易互相影响。',
    suggestedSlices: ['SSH/代理配置区', 'TLS 配置区', 'MongoDB 配置区', 'JVM 配置区'],
    testTargets: ['ConnectionModal.edit-password.test.tsx', 'connectionModalPresentation.test.ts'],
  },
  {
    path: 'frontend/src/components/QueryEditor.tsx',
    lines: 5367,
    area: 'sql-editor',
    riskLevel: 'critical',
    why: 'SQL 编辑、执行、事务、结果区布局和快捷键状态集中，事务和结果区回归风险高。',
    suggestedSlices: ['结果区工具栏', '事务状态条', '执行日志提示', '编辑器快捷键绑定'],
    testTargets: ['QueryEditor.result-panel.test.tsx', 'useSqlEditorTransactionController.test.ts'],
  },
  {
    path: 'frontend/src/components/TableDesigner.tsx',
    lines: 3549,
    area: 'table-designer',
    riskLevel: 'high',
    why: '字段编辑、索引、外键、分区和 DDL 生成集中，数据库方言差异容易扩散。',
    suggestedSlices: ['字段编辑表格', '索引配置面板', '外键配置面板', '方言 DDL 预览'],
    testTargets: ['TableDesigner.*.test.tsx', 'tableDesignerSchemaSql.test.ts'],
  },
  {
    path: 'frontend/src/components/RedisViewer.tsx',
    lines: 2120,
    area: 'redis-browser',
    riskLevel: 'high',
    why: 'Key 浏览、不同数据结构编辑、TTL、编码显示和新增弹窗集中，Redis Cluster/Sentinel 后续验证面较宽。',
    suggestedSlices: ['Key 搜索栏', 'String/List/Set/ZSet/Hash/Stream 编辑器', '新增 Key 弹窗'],
    testTargets: ['redisViewerTree.test.ts', 'RedisViewer.*.test.tsx'],
  },
  {
    path: 'frontend/src/components/DriverManagerModal.tsx',
    lines: 1729,
    area: 'driver-manager',
    riskLevel: 'high',
    why: '驱动安装、状态展示、下载和可选代理逻辑较多，适合继续拆出状态卡片和操作区。',
    suggestedSlices: ['驱动状态列表', '安装操作区', '下载日志区'],
    testTargets: ['DriverManagerModal.*.test.tsx'],
  },
  {
    path: 'frontend/src/components/DataSyncModal.tsx',
    lines: 1526,
    area: 'data-sync',
    riskLevel: 'high',
    why: '数据同步连接、表映射、预检查和执行结果集中，数据库方言问题容易隐藏。',
    suggestedSlices: ['连接选择区', '表映射区', '同步预检查结果', '执行日志区'],
    testTargets: ['DataSyncModal.*.test.tsx'],
  },
  {
    path: 'frontend/src/components/JVMDiagnosticConsole.tsx',
    lines: 1146,
    area: 'jvm-diagnostics',
    riskLevel: 'medium',
    why: '诊断命令、输出块、权限提示和会话状态可继续拆分，降低 JVM 诊断回归面。',
    suggestedSlices: ['命令输入区', '诊断输出区', '权限提示区'],
    testTargets: ['JVMDiagnosticConsole.*.test.tsx'],
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
      note: '基于当前仓库前端文件行数热点快照；提交前仍应用 git diff 和定向测试核对具体改动。',
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
      why: entry.why,
      suggestedSlices: includeRecommendations ? entry.suggestedSlices : [],
      testTargets: includeRecommendations ? entry.testTargets : [],
    })),
    nextActions: includeRecommendations
      ? [
        '优先选择已有测试覆盖的 slice 做小步拆分，避免直接重写整个大组件。',
        '拆分后至少运行对应组件测试、相关 utils 测试和 npm --prefix frontend run build。',
        '涉及可见 UI 的拆分需要用浏览器打开真实页面做一次冒烟验证。',
      ]
      : [],
  };
};
