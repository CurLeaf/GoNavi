import { useCallback, useRef } from 'react';

import { useStore } from '../../store';
import type { JVMAIPlanContext, JVMDiagnosticPlanContext } from '../../types';

export const useAIChatPlanContexts = () => {
  const pendingJVMPlanContextRef = useRef<JVMAIPlanContext | undefined>(undefined);
  const pendingJVMDiagnosticPlanContextRef = useRef<JVMDiagnosticPlanContext | undefined>(undefined);

  const getCurrentJVMPlanContext = useCallback((): JVMAIPlanContext | undefined => {
    const state = useStore.getState();
    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (!activeTab || activeTab.type !== 'jvm-resource') {
      return undefined;
    }

    const activeConnection = state.connections.find((connection) => connection.id === activeTab.connectionId);
    if (activeConnection?.config?.type !== 'jvm') {
      return undefined;
    }

    const resourcePath = String(activeTab.resourcePath || '').trim();
    if (!resourcePath) {
      return undefined;
    }

    return {
      tabId: activeTab.id,
      connectionId: activeTab.connectionId,
      providerMode: (activeTab.providerMode || activeConnection.config.jvm?.preferredMode || 'jmx') as JVMAIPlanContext['providerMode'],
      resourcePath,
    };
  }, []);

  const getCurrentJVMDiagnosticPlanContext = useCallback((): JVMDiagnosticPlanContext | undefined => {
    const state = useStore.getState();
    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (!activeTab || activeTab.type !== 'jvm-diagnostic') {
      return undefined;
    }

    const activeConnection = state.connections.find((connection) => connection.id === activeTab.connectionId);
    if (activeConnection?.config?.type !== 'jvm') {
      return undefined;
    }

    return {
      tabId: activeTab.id,
      connectionId: activeTab.connectionId,
      transport: activeConnection.config.jvm?.diagnostic?.transport || 'agent-bridge',
    };
  }, []);

  return {
    getCurrentJVMPlanContext,
    getCurrentJVMDiagnosticPlanContext,
    pendingJVMPlanContextRef,
    pendingJVMDiagnosticPlanContextRef,
  };
};
