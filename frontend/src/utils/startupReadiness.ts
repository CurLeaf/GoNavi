export interface ConnectionWorkbenchState {
  ready: boolean;
  message: string;
}

export function getConnectionWorkbenchState(
  isStoreHydrated: boolean,
  hasAppliedInitialGlobalProxy: boolean
): ConnectionWorkbenchState {
  if (!isStoreHydrated) {
    return {
      ready: false,
      message: '正在加载本地配置...',
    };
  }
  if (!hasAppliedInitialGlobalProxy) {
    return {
      ready: false,
      message: '正在同步全局代理配置...',
    };
  }
  return {
    ready: true,
    message: '',
  };
}
