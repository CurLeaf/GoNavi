import { useEffect } from 'react';

import { useStore } from '../../store';
import type { TabData } from '../../types';
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig';

interface UseAIChatAutoContextOptions {
  aiPanelVisible: boolean;
  activeTabId: string | null;
  tabs: TabData[];
}

export const useAIChatAutoContext = ({
  aiPanelVisible,
  activeTabId,
  tabs,
}: UseAIChatAutoContextOptions) => {
  useEffect(() => {
    if (!aiPanelVisible) {
      return;
    }

    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (!activeTab || (activeTab.type !== 'table' && activeTab.type !== 'design')) {
      return;
    }

    const { connectionId, dbName, tableName } = activeTab;
    if (!connectionId || !dbName || !tableName) {
      return;
    }

    const connKey = `${connectionId}:${dbName}`;
    const currentContexts = useStore.getState().aiContexts[connKey] || [];
    if (currentContexts.find((context) => context.dbName === dbName && context.tableName === tableName)) {
      return;
    }

    const connection = useStore.getState().connections.find((item) => item.id === connectionId);
    if (!connection) {
      return;
    }

    void import('../../../wailsjs/go/app/App')
      .then(({ DBShowCreateTable }) =>
        DBShowCreateTable(buildRpcConnectionConfig(connection.config) as any, dbName, tableName)
          .then((result) => {
            if (!result.success || !result.data) {
              return;
            }

            let createSql = '';
            if (typeof result.data === 'string') {
              createSql = result.data;
            } else if (Array.isArray(result.data) && result.data.length > 0) {
              const row = result.data[0];
              createSql = (
                Object.values(row).find(
                  (value) =>
                    typeof value === 'string' &&
                    (value.toUpperCase().includes('CREATE TABLE') || value.toUpperCase().includes('CREATE')),
                ) ||
                Object.values(row)[1] ||
                Object.values(row)[0]
              ) as string;
            }

            if (!createSql) {
              return;
            }

            useStore.getState().addAIContext(connKey, { dbName, tableName, ddl: createSql });
          }),
      )
      .catch((error) => console.error('Failed to auto-fetch table context', error));
  }, [activeTabId, aiPanelVisible, tabs]);
};
