import React from 'react';
import { Button, Dropdown, Tabs, Tooltip, type MenuProps } from 'antd';
import { CloseOutlined, EyeInvisibleOutlined, RobotOutlined } from '@ant-design/icons';

import type { EditRowLocator } from '../utils/rowLocator';
import type { QueryResultPaginationState } from '../utils/queryResultPagination';
import DataGrid from './DataGrid';

export type QueryEditorResultSet = {
    key: string;
    sql: string;
    exportSql?: string;
    sourceStatementIndex?: number;
    statementResultIndex?: number;
    rows: any[];
    columns: string[];
    messages?: string[];
    resultType?: 'grid' | 'message';
    tableName?: string;
    pkColumns: string[];
    editLocator?: EditRowLocator;
    readOnly: boolean;
    showRowNumberColumn?: boolean;
    truncated?: boolean;
    pkLoading?: boolean;
    page?: QueryResultPaginationState & { loading?: boolean };
};

interface QueryEditorResultsPanelProps {
    resultSets: QueryEditorResultSet[];
    activeResultKey: string;
    loading: boolean;
    executionError: string;
    darkMode: boolean;
    isV2Ui: boolean;
    currentDb: string;
    currentConnectionId: string;
    toggleShortcutLabel: string;
    onActiveResultKeyChange: (key: string) => void;
    onHide: () => void;
    onCloseResult: (key: string) => void;
    onCloseOtherResultTabs: (key: string) => void;
    onCloseResultTabsToLeft: (key: string) => void;
    onCloseResultTabsToRight: (key: string) => void;
    onCloseAllResultTabs: () => void;
    onReloadResult: (key: string, sql: string) => void;
    onResultPageChange: (key: string, page: number, pageSize: number) => void;
    onDiagnoseExecutionError: () => void;
}

const isAffectedRowsResult = (result: QueryEditorResultSet): boolean =>
    result.columns.length === 1 && result.columns[0] === 'affectedRows';

const QueryEditorResultsPanel: React.FC<QueryEditorResultsPanelProps> = ({
    resultSets,
    activeResultKey,
    loading,
    executionError,
    darkMode,
    isV2Ui,
    currentDb,
    currentConnectionId,
    toggleShortcutLabel,
    onActiveResultKeyChange,
    onHide,
    onCloseResult,
    onCloseOtherResultTabs,
    onCloseResultTabsToLeft,
    onCloseResultTabsToRight,
    onCloseAllResultTabs,
    onReloadResult,
    onResultPageChange,
    onDiagnoseExecutionError,
}) => {
    const resolvedActiveResultKey = activeResultKey || resultSets[0]?.key || '';
    const activeResultSet = resultSets.find((rs) => rs.key === resolvedActiveResultKey) || null;
    const activeResultUsesDataGrid = Boolean(
        activeResultSet &&
        activeResultSet.resultType !== 'message' &&
        !isAffectedRowsResult(activeResultSet),
    );
    const hideTooltipTitle = toggleShortcutLabel
        ? `隐藏结果区（${toggleShortcutLabel}）`
        : '隐藏结果区';

    const buildResultTabMenuItems = (key: string, index: number): MenuProps['items'] => [
        {
            key: 'close-other',
            label: '关闭其他页',
            disabled: resultSets.length <= 1,
            onClick: () => onCloseOtherResultTabs(key),
        },
        {
            key: 'close-left',
            label: '关闭左侧',
            disabled: index <= 0,
            onClick: () => onCloseResultTabsToLeft(key),
        },
        {
            key: 'close-right',
            label: '关闭右侧',
            disabled: index >= resultSets.length - 1,
            onClick: () => onCloseResultTabsToRight(key),
        },
        { type: 'divider' },
        {
            key: 'close-all',
            label: '关闭所有',
            disabled: resultSets.length === 0,
            onClick: onCloseAllResultTabs,
        },
    ];

    const hideButton = (
        <Tooltip title={hideTooltipTitle}>
            <Button
                className="query-result-panel-hide"
                type="text"
                size="small"
                icon={<EyeInvisibleOutlined />}
                onClick={onHide}
            >
                隐藏
            </Button>
        </Tooltip>
    );

    const tabsHideButton = (
        <Tooltip title={hideTooltipTitle}>
            <Button
                aria-label="隐藏结果区"
                className="query-result-panel-hide query-result-panel-hide-compact"
                type="text"
                size="small"
                icon={<EyeInvisibleOutlined />}
                onClick={onHide}
            />
        </Tooltip>
    );
    const tabsExtraContent = !activeResultUsesDataGrid
        ? {
            right: (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {tabsHideButton}
                </div>
            ),
        }
        : undefined;

    const toolbarHideButton = (
        <Tooltip title={hideTooltipTitle}>
            <Button
                className={isV2Ui ? 'gn-v2-query-result-toolbar-hide' : undefined}
                icon={<EyeInvisibleOutlined />}
                onClick={onHide}
            >
                <span>隐藏</span>
                {isV2Ui && toggleShortcutLabel && (
                    <span className="gn-v2-toolbar-kbd">{toggleShortcutLabel}</span>
                )}
            </Button>
        </Tooltip>
    );

    return (
        <>
            <style>{`
              .query-result-tabs {
                flex: 1 1 auto;
                min-height: 0;
                display: flex;
                flex-direction: column;
                overflow: hidden;
              }
              .query-result-tabs .ant-tabs-nav {
                flex: 0 0 auto;
                margin: 0;
                min-height: 38px;
                padding-right: 8px;
              }
              .query-result-tabs .ant-tabs-nav-wrap {
                flex: 0 1 auto;
                min-width: 0;
              }
              .query-result-tabs .ant-tabs-extra-content {
                display: inline-flex;
                align-items: center;
                padding-left: 8px;
              }
              .query-result-tabs .ant-tabs-nav-list {
                align-items: center;
                width: auto;
              }
              .query-result-tabs .ant-tabs-tab {
                width: auto !important;
                min-width: 0 !important;
                max-width: 148px !important;
                height: 30px !important;
                min-height: 30px;
                margin: 4px 6px 4px 0 !important;
                padding: 0 9px !important;
                border-radius: 999px !important;
                border: 0.5px solid transparent !important;
                border-right: 0.5px solid transparent !important;
                align-items: center !important;
                justify-content: center !important;
              }
              .query-result-tabs .ant-tabs-tab-btn {
                width: auto !important;
                height: 100%;
                max-width: 100%;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 14px !important;
                line-height: 1 !important;
              }
              .query-result-tabs .ant-tabs-tab.ant-tabs-tab-active::after {
                display: none;
              }
              .query-result-tabs .ant-tabs-content-holder {
                flex: 1 1 auto;
                overflow: hidden;
                min-height: 0;
                display: flex;
                flex-direction: column;
              }
              .query-result-tabs .ant-tabs-content {
                flex: 1 1 auto;
                min-height: 0;
                display: flex;
                flex-direction: column;
              }
              .query-result-tabs .ant-tabs-tabpane {
                flex: 1 1 auto;
                min-height: 0;
                display: flex;
                flex-direction: column;
                overflow: hidden;
              }
              .query-result-tabs .ant-tabs-tabpane > div {
                flex: 1 1 auto;
                min-height: 0;
              }
              .query-result-tabs .ant-tabs-tabpane-hidden {
                display: none !important;
              }
              .query-result-tabs .ant-tabs-ink-bar {
                transition: none !important;
              }
              .query-result-tab-label {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                min-width: 0;
                max-width: 126px;
                height: 100%;
                line-height: 1;
                user-select: none;
                -webkit-user-select: none;
              }
              .query-result-tab-text {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 14px;
                font-weight: 700;
              }
              .query-result-tab-count {
                flex: 0 0 auto;
                min-width: 17px;
                height: 17px;
                padding: 0 5px;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: rgba(148, 163, 184, 0.16);
                color: inherit;
                font-size: 11px;
                font-weight: 700;
                line-height: 17px;
              }
              .query-result-tab-close {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
                border-radius: 999px;
                color: #999;
                cursor: pointer;
                flex: 0 0 auto;
              }
              .query-result-tab-close:hover {
                background: rgba(0, 0, 0, 0.06);
                color: #666;
              }
              .query-result-panel-header {
                flex: 0 0 auto;
                min-height: 38px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 0 12px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.06);
                background: rgba(255, 255, 255, 0.9);
              }
              .query-result-panel-header-title {
                font-size: 13px;
                font-weight: 600;
                color: #666;
              }
              .query-result-panel-hide {
                display: inline-flex;
                align-items: center;
                gap: 4px;
              }
              .query-result-panel-hide-compact {
                min-width: 28px;
                padding: 0 6px;
                justify-content: center;
              }
            `}</style>
            <div
                className={isV2Ui ? 'gn-v2-query-results' : undefined}
                style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}
            >
                {resultSets.length > 0 ? (
                    <Tabs
                        className="query-result-tabs"
                        activeKey={resolvedActiveResultKey}
                        onChange={onActiveResultKeyChange}
                        animated={false}
                        style={{ flex: 1, minHeight: 0 }}
                        tabBarExtraContent={tabsExtraContent}
                        items={resultSets.map((rs, idx) => ({
                            key: rs.key,
                            label: (
                                <Dropdown
                                    menu={{ items: buildResultTabMenuItems(rs.key, idx) }}
                                    trigger={['contextMenu']}
                                    rootClassName={isV2Ui ? 'gn-v2-tab-context-menu-popup' : undefined}
                                >
                                    <div
                                        className="query-result-tab-label"
                                        onContextMenu={(event) => {
                                            event.preventDefault();
                                        }}
                                    >
                                        <Tooltip title={rs.sql}>
                                            <span className="query-result-tab-text">{rs.resultType === 'message' ? `消息 ${idx + 1}` : `结果 ${idx + 1}`}</span>
                                        </Tooltip>
                                        {(() => {
                                            if (rs.resultType === 'message') {
                                                return <span className="query-result-tab-count">i</span>;
                                            }
                                            if (isAffectedRowsResult(rs)) {
                                                return <span className="query-result-tab-count">✓</span>;
                                            }
                                            if (!Array.isArray(rs.rows)) {
                                                return null;
                                            }
                                            return <span className="query-result-tab-count">{rs.rows.length}</span>;
                                        })()}
                                        <Tooltip title="关闭结果">
                                            <span
                                                className="query-result-tab-close"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    onCloseResult(rs.key);
                                                }}
                                            >
                                                <CloseOutlined style={{ fontSize: 12 }} />
                                            </span>
                                        </Tooltip>
                                    </div>
                                </Dropdown>
                            ),
                            children: (() => {
                                if (rs.resultType === 'message') {
                                    return (
                                        <div className={isV2Ui ? 'gn-v2-query-success' : undefined} style={{
                                            flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center',
                                            flexDirection: 'column', gap: 12, padding: 24, color: '#666', userSelect: 'text',
                                            overflow: 'auto',
                                        }}>
                                            <span style={{ fontSize: 14, fontWeight: 600 }}>执行消息</span>
                                            <div style={{
                                                padding: 16,
                                                borderRadius: 8,
                                                border: darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
                                                background: darkMode ? 'rgba(255,255,255,0.03)' : '#fff',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                fontFamily: 'var(--gn-font-mono)',
                                                fontSize: 'var(--gn-font-size-mono, 13px)',
                                            }}>
                                                {(rs.messages || []).join('\n')}
                                            </div>
                                        </div>
                                    );
                                }
                                if (isAffectedRowsResult(rs)) {
                                    const affected = Number(rs.rows[0]?.affectedRows ?? 0);
                                    return (
                                        <div className={isV2Ui ? 'gn-v2-query-success' : undefined} style={{
                                            flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexDirection: 'column', gap: 8, color: '#666', userSelect: 'text',
                                        }}>
                                            <span style={{ fontSize: 36, color: '#52c41a' }}>✓</span>
                                            <span style={{ fontSize: 14, fontWeight: 500 }}>执行成功</span>
                                            <span style={{ fontSize: 13, color: '#999' }}>影响行数：{affected}</span>
                                            {Array.isArray(rs.messages) && rs.messages.length > 0 && (
                                                <div style={{
                                                    marginTop: 8,
                                                    maxWidth: 720,
                                                    padding: 12,
                                                    borderRadius: 8,
                                                    border: darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
                                                    background: darkMode ? 'rgba(255,255,255,0.03)' : '#fff',
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    fontFamily: 'var(--gn-font-mono)',
                                                    fontSize: 'var(--gn-font-size-mono, 12px)',
                                                }}>
                                                    {rs.messages.join('\n')}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }
                                return (
                                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                        {Array.isArray(rs.messages) && rs.messages.length > 0 && (
                                            <div style={{
                                                flex: '0 0 auto',
                                                margin: '8px 8px 0',
                                                padding: '10px 12px',
                                                borderRadius: 8,
                                                border: darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
                                                background: darkMode ? 'rgba(255,255,255,0.03)' : '#fff',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                fontFamily: 'var(--gn-font-mono)',
                                                fontSize: 'var(--gn-font-size-mono, 12px)',
                                                color: darkMode ? '#d4d4d4' : '#666',
                                            }}>
                                                {rs.messages.join('\n')}
                                            </div>
                                        )}
                                        <DataGrid
                                            data={rs.rows}
                                            columnNames={rs.columns}
                                            loading={loading || rs.page?.loading === true}
                                            tableName={rs.tableName}
                                            exportScope="queryResult"
                                            resultSql={rs.exportSql || rs.sql}
                                            resultExportAllSql={rs.page?.exportAllSql}
                                            dbName={currentDb}
                                            connectionId={currentConnectionId}
                                            pkColumns={rs.pkColumns}
                                            editLocator={rs.editLocator}
                                            showRowNumberColumn={rs.showRowNumberColumn}
                                            onReload={() => {
                                                if (rs.page) {
                                                    onResultPageChange(rs.key, rs.page.current, rs.page.pageSize);
                                                    return;
                                                }
                                                onReloadResult(rs.key, rs.sql);
                                            }}
                                            pagination={rs.page ? {
                                                current: rs.page.current,
                                                pageSize: rs.page.pageSize,
                                                total: rs.page.total,
                                                totalKnown: rs.page.totalKnown,
                                            } : undefined}
                                            onPageChange={rs.page ? ((page, size) => onResultPageChange(rs.key, page, size)) : undefined}
                                            readOnly={rs.readOnly}
                                            toolbarExtraActions={resolvedActiveResultKey === rs.key ? toolbarHideButton : null}
                                        />
                                    </div>
                                );
                            })(),
                        }))}
                    />
                ) : executionError ? (
                    <>
                        <div className={isV2Ui ? 'query-result-panel-header gn-v2-query-result-panel-header' : 'query-result-panel-header'}>
                            <span className="query-result-panel-header-title">结果区</span>
                            {hideButton}
                        </div>
                        <div className={isV2Ui ? 'gn-v2-query-error' : undefined} style={{ flex: 1, minHeight: 0, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, background: darkMode ? '#1e1e1e' : '#fafafa', overflow: 'auto' }}>
                            <div style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CloseOutlined />
                                <span>执行失败</span>
                            </div>
                            <div className="custom-scrollbar" style={{ padding: 16, background: darkMode ? '#2d1a1a' : '#fff2f0', border: `1px solid ${darkMode ? '#5c2020' : '#ffccc7'}`, borderRadius: 6, color: darkMode ? '#ffa39e' : '#cf1322', fontFamily: 'var(--gn-font-mono)', fontSize: 'var(--gn-font-size-mono, 13px)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '40vh', overflow: 'auto' }}>
                                {executionError}
                            </div>
                            <div style={{ marginTop: 8 }}>
                                <Button
                                    type="primary"
                                    icon={<RobotOutlined />}
                                    style={{ background: '#818cf8', borderColor: '#818cf8', boxShadow: '0 2px 0 rgba(129, 140, 248, 0.2)' }}
                                    onClick={onDiagnoseExecutionError}
                                >
                                    一键 AI 诊断
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className={isV2Ui ? 'query-result-panel-header gn-v2-query-result-panel-header' : 'query-result-panel-header'}>
                            <span className="query-result-panel-header-title">结果区</span>
                            {hideButton}
                        </div>
                        <div className={isV2Ui ? 'gn-v2-query-empty' : undefined} style={{ flex: 1, minHeight: 0 }}>
                            {isV2Ui && (
                                <div>
                                    <strong>等待执行 SQL</strong>
                                    <span>运行查询后，结果会在下方以新版数据网格展示。</span>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </>
    );
};

export default QueryEditorResultsPanel;
