import React from 'react';
import type { TabData } from '../types';
import DataViewer from './DataViewer';
import QueryEditor from './QueryEditor';
import TableDesigner from './TableDesigner';
import RedisViewer from './RedisViewer';
import RedisCommandEditor from './RedisCommandEditor';
import RedisMonitor from './RedisMonitor';
import TriggerViewer from './TriggerViewer';
import DefinitionViewer from './DefinitionViewer';
import TableOverview from './TableOverview';
import TableExportWorkbench from './TableExportWorkbench';
import SQLFileExecutionWorkbench from './SQLFileExecutionWorkbench';
import JVMOverview from './JVMOverview';
import JVMResourceBrowser from './JVMResourceBrowser';
import JVMAuditViewer from './JVMAuditViewer';
import JVMDiagnosticConsole from './JVMDiagnosticConsole';
import JVMMonitoringDashboard from './JVMMonitoringDashboard';
import SqlAnalysisWorkbench from './explain/SqlAnalysisWorkbench';

export const WorkbenchTabContent: React.FC<{ tab: TabData; isActive: boolean }> = React.memo(({ tab, isActive }) => {
  if (tab.type === 'query') {
    return <QueryEditor tab={tab} isActive={isActive} />;
  }
  if (tab.type === 'table') {
    return <DataViewer tab={tab} isActive={isActive} />;
  }
  if (tab.type === 'design') {
    return <TableDesigner tab={tab} />;
  }
  if (tab.type === 'redis-keys') {
    return <RedisViewer connectionId={tab.connectionId} redisDB={tab.redisDB ?? 0} />;
  }
  if (tab.type === 'redis-command') {
    return <RedisCommandEditor connectionId={tab.connectionId} redisDB={tab.redisDB ?? 0} />;
  }
  if (tab.type === 'redis-monitor') {
    return <RedisMonitor connectionId={tab.connectionId} redisDB={tab.redisDB ?? 0} />;
  }
  if (tab.type === 'trigger') {
    return <TriggerViewer tab={tab} />;
  }
  if (tab.type === 'view-def' || tab.type === 'event-def' || tab.type === 'routine-def' || tab.type === 'sequence-def' || tab.type === 'package-def') {
    return <DefinitionViewer tab={tab} />;
  }
  if (tab.type === 'table-overview') {
    return <TableOverview tab={tab} />;
  }
  if (tab.type === 'table-export') {
    return <TableExportWorkbench tab={tab} />;
  }
  if (tab.type === 'sql-file-execution') {
    return <SQLFileExecutionWorkbench tab={tab} />;
  }
  if (tab.type === 'sql-analysis') {
    return <SqlAnalysisWorkbench tab={tab} />;
  }
  if (tab.type === 'jvm-overview') {
    return <JVMOverview tab={tab} />;
  }
  if (tab.type === 'jvm-resource') {
    return <JVMResourceBrowser tab={tab} />;
  }
  if (tab.type === 'jvm-audit') {
    return <JVMAuditViewer tab={tab} />;
  }
  if (tab.type === 'jvm-diagnostic') {
    return <JVMDiagnosticConsole tab={tab} />;
  }
  if (tab.type === 'jvm-monitoring') {
    return <JVMMonitoringDashboard tab={tab} />;
  }
  return null;
});

WorkbenchTabContent.displayName = 'WorkbenchTabContent';

export default WorkbenchTabContent;
