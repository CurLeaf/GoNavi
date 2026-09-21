import { AuditOutlined, BugOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { TabData } from '../../types';
import { buildDMLSnapshotWorkbenchTab } from '../../utils/dmlSnapshotTab';
import { buildRequestDiagnosticsWorkbenchTab } from '../../utils/requestDiagnosticsTab';
import { buildSqlAuditWorkbenchTab } from '../../utils/sqlAuditTab';

export type WorkspaceWorkbenchToolItem = {
  key: string;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
};

type Translate = (key: string) => string;

// 工具中心「工作区」里打开全局工作台 Tab 的入口。
// 抽到这里是为了不让 App.tsx 再堆卡片；快照中心跟审计、请求诊断一样是全局只读视图。
export const buildWorkspaceWorkbenchToolItems = (input: {
  t: Translate;
  openTab: (tab: TabData) => void;
}): WorkspaceWorkbenchToolItem[] => [
  {
    key: 'sql-audit',
    icon: <AuditOutlined />,
    title: input.t('app.tools.entry.sql_audit.title'),
    description: input.t('app.tools.entry.sql_audit.description'),
    onClick: () => input.openTab(buildSqlAuditWorkbenchTab()),
  },
  {
    key: 'request-diagnostics',
    icon: <BugOutlined />,
    title: input.t('app.tools.entry.request_diagnostics.title'),
    description: input.t('app.tools.entry.request_diagnostics.description'),
    onClick: () => input.openTab(buildRequestDiagnosticsWorkbenchTab()),
  },
  {
    key: 'dml-snapshot',
    icon: <SafetyCertificateOutlined />,
    title: input.t('dml_snapshot.workbench.title'),
    description: input.t('dml_snapshot.workbench.description'),
    onClick: () => input.openTab(buildDMLSnapshotWorkbenchTab()),
  },
];
