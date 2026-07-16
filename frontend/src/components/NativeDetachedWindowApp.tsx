import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ConfigProvider, Spin, Tooltip, theme as antdTheme } from 'antd';
import { CloseOutlined, CompressOutlined } from '@ant-design/icons';

import { t as defaultTranslate } from '../i18n';
import { getAntdLocale } from '../i18n/frameworkLocale';
import { useOptionalI18n } from '../i18n/provider';
import { type SqlLog, useStore } from '../store';
import type { TabData } from '../types';
import type { DetachedQueryResultWindow } from '../utils/detachedWindow';
import {
  attachNativeDetachedWindow,
  buildNativeDetachedSyncStoreSnapshot,
  closeCurrentNativeDetachedWindow,
  closeNativeDetachedWindow,
  fetchNativeDetachedWindowBootstrap,
  hydrateNativeDetachedStore,
  readyNativeDetachedWindow,
  syncNativeDetachedWindow,
  type NativeDetachedWindowActionPayload,
  type NativeDetachedWindowBootstrap,
} from '../utils/nativeDetachedWindowClient';
import {
  peekQueryEditorResultSession,
  saveQueryEditorResultSession,
  subscribeQueryEditorResultSession,
  type QueryEditorResultSessionSnapshot,
} from '../utils/queryEditorResultSessionCache';
import DataGrid from './DataGrid';
import WorkbenchTabContent from './WorkbenchTabContent';
import NativeDetachedWindowController from './NativeDetachedWindowController';

export const NATIVE_DETACHED_SYNC_DEBOUNCE_MS = 180;

type NativeDetachedWindowClient = {
  load: () => Promise<NativeDetachedWindowBootstrap>;
  ready: (payload: NativeDetachedWindowActionPayload) => Promise<void>;
  sync: (payload: NativeDetachedWindowActionPayload) => Promise<void>;
  attach: (payload: NativeDetachedWindowActionPayload) => Promise<void>;
  close: (payload: NativeDetachedWindowActionPayload) => Promise<void>;
  closeCurrentWindow: () => Promise<void>;
};

const defaultClient: NativeDetachedWindowClient = {
  load: fetchNativeDetachedWindowBootstrap,
  ready: readyNativeDetachedWindow,
  sync: syncNativeDetachedWindow,
  attach: attachNativeDetachedWindow,
  close: closeNativeDetachedWindow,
  closeCurrentWindow: closeCurrentNativeDetachedWindow,
};

export interface NativeDetachedWindowAppProps {
  client?: NativeDetachedWindowClient;
}

const isAffectedRowsResult = (columns: string[]): boolean =>
  columns.length === 1 && columns[0] === 'affectedRows';

const buildActionPayload = (
  bootstrap: NativeDetachedWindowBootstrap,
  tab?: TabData,
  resultSession?: QueryEditorResultSessionSnapshot | null,
  includeResultSession = false,
  newSqlLogs: SqlLog[] = [],
): NativeDetachedWindowActionPayload => {
  const storeState = buildNativeDetachedSyncStoreSnapshot(
    useStore.getState(),
    bootstrap.kind === 'workbench' ? bootstrap.payload.tab?.id || '' : '',
    newSqlLogs,
  );
  return {
    id: bootstrap.id,
    kind: bootstrap.kind,
    ...(bootstrap.kind === 'workbench' || Object.keys(storeState).length > 0
      ? { storeState }
      : {}),
    ...(tab ? { tab } : {}),
    ...(bootstrap.kind === 'workbench' && includeResultSession
      ? { resultSession: resultSession ?? null }
      : {}),
  };
};

const NativeDetachedQueryResult: React.FC<{
  windowState: DetachedQueryResultWindow;
}> = ({ windowState }) => {
  const result = windowState.result;
  const isMessage = result.resultType === 'message' || isAffectedRowsResult(result.columns || []);
  const messageText = (result.messages || []).join('\n')
    || (isAffectedRowsResult(result.columns || [])
      ? String(result.rows?.[0]?.affectedRows ?? '')
      : '');

  if (isMessage) {
    return (
      <textarea
        className="gn-native-detached-message"
        readOnly
        value={messageText}
      />
    );
  }

  return (
    <DataGrid
      data={result.rows || []}
      columnNames={result.columns || []}
      loading={false}
      tableName={result.metadataTableName || result.tableName}
      pkColumns={result.pkColumns || []}
      editLocator={result.editLocator as any}
      readOnly={result.readOnly !== false}
      connectionId={windowState.connectionId}
      dbName={result.metadataDbName || windowState.dbName || ''}
      resultSql={result.exportSql || result.sql}
      exportScope="queryResult"
      showRowNumberColumn={result.showRowNumberColumn}
      isActive
    />
  );
};

const NativeDetachedWindowContent: React.FC<{
  bootstrap: NativeDetachedWindowBootstrap;
}> = ({ bootstrap }) => {
  const tabFromStore = useStore((state) => bootstrap.payload.tab
    ? state.tabs.find((item) => item.id === bootstrap.payload.tab?.id)
    : undefined);
  const tab = tabFromStore || bootstrap.payload.tab;

  if (bootstrap.kind === 'workbench') {
    return tab ? <WorkbenchTabContent tab={tab} isActive /> : null;
  }
  return bootstrap.payload.resultWindow
    ? <NativeDetachedQueryResult windowState={bootstrap.payload.resultWindow} />
    : null;
};

const NativeDetachedWindowApp: React.FC<NativeDetachedWindowAppProps> = ({
  client = defaultClient,
}) => {
  const i18n = useOptionalI18n();
  const translate = i18n?.t ?? defaultTranslate;
  const [bootstrap, setBootstrap] = useState<NativeDetachedWindowBootstrap | null>(null);
  const [loadError, setLoadError] = useState('');
  const [contentMounted, setContentMounted] = useState(true);
  const [terminalAction, setTerminalAction] = useState<'attach' | 'close' | null>(null);
  const terminalActionStartedRef = useRef(false);
  const resultSessionRef = useRef<QueryEditorResultSessionSnapshot | null>(null);
  const syncedSqlLogIdsRef = useRef<Set<string>>(new Set());
  const syncTimerRef = useRef<number | null>(null);
  const syncIncludesResultSessionRef = useRef(false);

  const themeMode = useStore((state) => state.theme);
  const uiVersion = useStore((state) => state.appearance.uiVersion);
  const fontSize = useStore((state) => state.fontSize);
  const uiScale = useStore((state) => state.uiScale);

  useEffect(() => {
    const persist = (useStore as any).persist;
    if (typeof persist?.setOptions !== 'function') return;
    persist.setOptions({
      storage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    });
  }, []);

  useEffect(() => {
    let active = true;
    void client.load()
      .then((nextBootstrap) => {
        if (!active) return;
        hydrateNativeDetachedStore(useStore, nextBootstrap.payload.storeState);
        syncedSqlLogIdsRef.current = new Set(
          (useStore.getState().sqlLogs || [])
            .map((log) => String(log.id || '').trim())
            .filter(Boolean),
        );
        if (nextBootstrap.kind === 'workbench' && nextBootstrap.payload.tab) {
          resultSessionRef.current = nextBootstrap.payload.resultSession ?? null;
          if (nextBootstrap.payload.resultSession) {
            saveQueryEditorResultSession(
              nextBootstrap.payload.tab.id,
              nextBootstrap.payload.resultSession,
            );
          }
        }
        setBootstrap(nextBootstrap);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (!bootstrap || !contentMounted) return;
    void client.ready({ id: bootstrap.id, kind: bootstrap.kind }).catch((error) => {
      setLoadError(error instanceof Error ? error.message : String(error));
    });
  }, [bootstrap, client, contentMounted]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.setAttribute('data-theme', themeMode === 'dark' ? 'dark' : 'light');
    document.body.setAttribute('data-ui-version', uiVersion);
    document.body.style.color = themeMode === 'dark' ? '#ffffff' : '#111827';
    document.body.style.fontSize = `${Math.max(10, Number(fontSize) || 14)}px`;
    document.documentElement.style.colorScheme = themeMode === 'dark' ? 'dark' : 'light';
  }, [fontSize, themeMode, uiVersion]);

  const readCurrentTab = useCallback((): TabData | undefined => {
    const bootstrapTab = bootstrap?.payload.tab;
    if (!bootstrapTab) return undefined;
    return useStore.getState().tabs.find((item) => item.id === bootstrapTab.id)
      || bootstrapTab;
  }, [bootstrap]);

  const readUnsyncedSqlLogs = useCallback((): SqlLog[] => {
    const syncedIds = syncedSqlLogIdsRef.current;
    return (useStore.getState().sqlLogs || []).filter((log) => {
      const id = String(log.id || '').trim();
      return id !== '' && !syncedIds.has(id);
    });
  }, []);

  const markSqlLogsSynced = useCallback((logs: SqlLog[]): void => {
    for (const log of logs) {
      const id = String(log.id || '').trim();
      if (id) syncedSqlLogIdsRef.current.add(id);
    }
  }, []);

  const scheduleSync = useCallback((includeResultSession = false) => {
    if (!bootstrap || terminalAction) return;
    syncIncludesResultSessionRef.current = syncIncludesResultSessionRef.current || includeResultSession;
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      const shouldIncludeResultSession = syncIncludesResultSessionRef.current;
      syncIncludesResultSessionRef.current = false;
      const newSqlLogs = readUnsyncedSqlLogs();
      if (bootstrap.kind === 'query-result' && newSqlLogs.length === 0) return;
      void client.sync(buildActionPayload(
        bootstrap,
        readCurrentTab(),
        resultSessionRef.current,
        shouldIncludeResultSession,
        newSqlLogs,
      )).then(() => {
        markSqlLogsSynced(newSqlLogs);
      }).catch((error) => {
        console.warn('[Native Detached Window] Failed to sync tab state', error);
      });
    }, NATIVE_DETACHED_SYNC_DEBOUNCE_MS);
  }, [bootstrap, client, markSqlLogsSynced, readCurrentTab, readUnsyncedSqlLogs, terminalAction]);

  useEffect(() => {
    if (!bootstrap) {
      return undefined;
    }
    const unsubscribeStore = useStore.subscribe(() => scheduleSync(false));
    const unsubscribeResultSession = bootstrap.kind === 'workbench' && bootstrap.payload.tab
      ? subscribeQueryEditorResultSession(
          bootstrap.payload.tab.id,
          (snapshot) => {
            // QueryEditor consumes the initial cache entry during mount. Keep
            // the last non-null snapshot for the final attach action.
            if (snapshot) {
              resultSessionRef.current = snapshot;
              scheduleSync(false);
            }
          },
        )
      : () => undefined;
    return () => {
      unsubscribeStore();
      unsubscribeResultSession();
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [bootstrap, scheduleSync]);

  const requestTerminalAction = useCallback((action: 'attach' | 'close') => {
    if (!bootstrap || terminalAction) return;
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    setContentMounted(false);
    setTerminalAction(action);
  }, [bootstrap, terminalAction]);

  useEffect(() => {
    if (!bootstrap || !terminalAction || contentMounted || terminalActionStartedRef.current) {
      return;
    }
    terminalActionStartedRef.current = true;

    // Workbench content has unmounted before this effect runs, so QueryEditor
    // has published its final result session to the cache.
    const currentSession = bootstrap.payload.tab
      ? peekQueryEditorResultSession(bootstrap.payload.tab.id) || resultSessionRef.current
      : null;
    const payload = buildActionPayload(
      bootstrap,
      readCurrentTab(),
      currentSession,
      terminalAction === 'attach',
      readUnsyncedSqlLogs(),
    );
    void (async () => {
      try {
        if (terminalAction === 'attach' && bootstrap.kind === 'workbench') {
          try {
            await client.sync(payload);
          } catch (error) {
            // The attach request carries the same final tab/session payload, so
            // a failed best-effort sync must not prevent the user from restoring.
            console.warn('[Native Detached Window] Final sync before attach failed', error);
          }
        }
        if (terminalAction === 'attach') {
          await client.attach(payload);
        } else {
          await client.close(payload);
        }
      } catch (error) {
        console.error(`[Native Detached Window] Failed to ${terminalAction}`, error);
        terminalActionStartedRef.current = false;
        setTerminalAction(null);
        setContentMounted(true);
        return;
      }
      try {
        await client.closeCurrentWindow();
      } catch (error) {
        console.error('[Native Detached Window] Failed to close native window', error);
      }
    })();
  }, [bootstrap, client, contentMounted, readCurrentTab, readUnsyncedSqlLogs, terminalAction]);

  const chromeLabels = useMemo(() => ({
    attach: bootstrap?.kind === 'workbench'
      ? translate('tab_manager.detached.restore')
      : translate('query_editor.results_panel.detached.restore'),
    close: bootstrap?.kind === 'workbench'
      ? translate('tab_manager.detached.close')
      : translate('query_editor.results_panel.detached.close'),
  }), [bootstrap?.kind, translate]);

  const isDark = themeMode === 'dark';
  const componentSize = uiScale <= 0.92 ? 'small' : (uiScale >= 1.12 ? 'large' : 'middle');
  return (
    <ConfigProvider
      locale={getAntdLocale(i18n?.language ?? 'en-US')}
      componentSize={componentSize}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          fontSize: Math.max(10, Number(fontSize) || 14),
          colorPrimary: uiVersion === 'v2'
            ? (isDark ? '#22c55e' : '#16a34a')
            : (isDark ? '#f6c453' : '#1677ff'),
        },
      }}
    >
      {bootstrap ? (
        <NativeDetachedWindowController currentWindowId={bootstrap.id} />
      ) : null}
      <div
        className="gn-native-detached-window"
        data-kind={bootstrap?.kind || 'loading'}
      >
        <style>{`
        .gn-native-detached-window {
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          color: ${isDark ? '#f3f4f6' : '#111827'};
          background: ${isDark ? 'var(--gn-bg-app, #0c0e12)' : 'var(--gn-bg-app, #f6f6f4)'};
        }
        .gn-native-detached-chrome {
          flex: 0 0 36px;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 6px 0 12px;
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)'};
          background: ${isDark ? 'var(--gn-bg-chrome, #14171c)' : 'var(--gn-bg-chrome, #ececea)'};
          user-select: none;
          --wails-draggable: drag;
        }
        .gn-native-detached-title {
          min-width: 0;
          flex: 1 1 auto;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 600;
        }
        .gn-native-detached-actions {
          flex: 0 0 auto;
          display: inline-flex;
          gap: 2px;
          --wails-draggable: no-drag;
        }
        .gn-native-detached-body {
          flex: 1 1 auto;
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: ${isDark ? 'var(--gn-bg-panel, #161a21)' : 'var(--gn-bg-panel, #ffffff)'};
        }
        .gn-native-detached-loading,
        .gn-native-detached-error {
          flex: 1 1 auto;
          display: grid;
          place-items: center;
          min-width: 0;
          min-height: 0;
          padding: 24px;
        }
        .gn-native-detached-error {
          color: ${isDark ? '#fca5a5' : '#b91c1c'};
          overflow: auto;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .gn-native-detached-message {
          flex: 1 1 auto;
          width: 100%;
          min-width: 0;
          min-height: 0;
          box-sizing: border-box;
          margin: 0;
          padding: 12px;
          border: 0;
          resize: none;
          outline: none;
          color: inherit;
          background: transparent;
          font-family: var(--gn-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
          font-size: 12px;
          line-height: 1.5;
        }
        `}</style>
        <div className="gn-native-detached-chrome">
          <div className="gn-native-detached-title" title={bootstrap?.title || ''}>
            {bootstrap?.title || ''}
          </div>
          <div className="gn-native-detached-actions">
            <Tooltip title={chromeLabels.attach}>
              <Button
                type="text"
                size="small"
                icon={<CompressOutlined />}
                aria-label={chromeLabels.attach}
                disabled={!bootstrap || Boolean(terminalAction)}
                onClick={() => requestTerminalAction('attach')}
              />
            </Tooltip>
            <Tooltip title={chromeLabels.close}>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                aria-label={chromeLabels.close}
                disabled={!bootstrap || Boolean(terminalAction)}
                onClick={() => requestTerminalAction('close')}
              />
            </Tooltip>
          </div>
        </div>
        <div className="gn-native-detached-body">
          {loadError ? (
            <div className="gn-native-detached-error" role="alert">{loadError}</div>
          ) : !bootstrap ? (
            <div className="gn-native-detached-loading"><Spin /></div>
          ) : contentMounted ? (
            <NativeDetachedWindowContent bootstrap={bootstrap} />
          ) : null}
        </div>
      </div>
    </ConfigProvider>
  );
};

export default NativeDetachedWindowApp;
