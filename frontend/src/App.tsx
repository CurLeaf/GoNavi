import Modal from './components/common/ResizableDraggableModal';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Layout, Button, ConfigProvider, theme, message, Spin, Slider, Progress, Switch, Input, InputNumber, Select, Segmented, Tooltip } from 'antd';
import { PlusOutlined, ConsoleSqlOutlined, UploadOutlined, DownloadOutlined, CloudDownloadOutlined, BugOutlined, ToolOutlined, GlobalOutlined, InfoCircleOutlined, GithubOutlined, SkinOutlined, CheckOutlined, MinusOutlined, BorderOutlined, CloseOutlined, SettingOutlined, LinkOutlined, BgColorsOutlined, AppstoreOutlined, RobotOutlined, FolderOpenOutlined, HddOutlined, SafetyCertificateOutlined, SwitcherOutlined, CodeOutlined, RightOutlined } from '@ant-design/icons';
import { BrowserOpenURL, Environment, EventsOn, WindowFullscreen, WindowGetPosition, WindowGetSize, WindowIsFullscreen, WindowIsMaximised, WindowIsMinimised, WindowIsNormal, WindowMaximise, WindowMinimise, WindowSetDarkTheme, WindowSetLightTheme, WindowSetPosition, WindowSetSize, WindowSetSystemDefaultTheme, WindowUnfullscreen, WindowUnmaximise } from '../wailsjs/runtime';
import Sidebar from './components/Sidebar';
import TabManager from './components/TabManager';
import ConnectionModal from './components/ConnectionModal';
import SnippetSettingsModal from './components/SnippetSettingsModal';
import ConnectionPackagePasswordModal from './components/ConnectionPackagePasswordModal';
import DataSyncModal from './components/DataSyncModal';
import { type DataSyncEntryMode } from './components/dataSyncEntryMode';
import DriverManagerModal from './components/DriverManagerModal';
import LinuxCJKFontBanner from './components/LinuxCJKFontBanner';
import LogPanel from './components/LogPanel';
import AISettingsModal from './components/AISettingsModal';
import AIChatPanel from './components/AIChatPanel';
import AIPanelErrorBoundary from './components/ai/AIPanelErrorBoundary';
import SecurityUpdateBanner from './components/SecurityUpdateBanner';
import SecurityUpdateIntroModal from './components/SecurityUpdateIntroModal';
import SecurityUpdateProgressModal from './components/SecurityUpdateProgressModal';
import SecurityUpdateSettingsModal from './components/SecurityUpdateSettingsModal';
import LanguageSettingsPanel from './components/LanguageSettingsPanel';
import {
  DEFAULT_APPEARANCE,
  MAX_V2_SIDEBAR_RAIL_SCALE,
  MIN_V2_SIDEBAR_RAIL_SCALE,
  sanitizeV2SidebarRailScale,
  useStore,
} from './store';
import { SavedConnection, SecurityUpdateIssue, SecurityUpdateStatus } from './types';
import { blurToFilter, normalizeBlurForPlatform, normalizeOpacityForPlatform, isWindowsPlatform, resolveAppearanceValues } from './utils/appearance';
import { buildFontFamilyOptions, DEFAULT_MONO_FONT_FAMILY, DEFAULT_UI_FONT_FAMILY, getLinuxCJKFontInstallHint, matchFontFamilyOption, resolveMonoFontFamily, resolveUIFontFamily, sanitizeFontFamilyInput, type FontFamilyOption, type InstalledFontFamily } from './utils/fontFamilies';
import {
  DENSITY_OPTIONS,
  sanitizeDataTableDensity,
  sanitizeDataTableFontSize,
  sanitizeSidebarTreeFontSize,
} from './utils/dataGridDisplay';
import {
  TAB_DISPLAY_SECONDARY_DEFAULT_KEYS,
  TAB_DISPLAY_ELEMENT_META,
  applyTabDisplaySettingsPatch,
  resolveTabDisplayElementOrder,
  sanitizeTabDisplaySettings,
  switchTabDisplayLayout,
  type TabDisplayElementKey,
  type TabDisplayLayout,
  type TabDisplaySettings,
} from './utils/tabDisplay';
import { getMacNativeTitlebarPaddingLeft, getMacNativeTitlebarPaddingRight, shouldHandleMacNativeFullscreenShortcut, shouldSuppressMacNativeEscapeExit } from './utils/macWindow';
import { shouldEnableMacWindowDiagnostics } from './utils/macWindowDiagnostics';
import { getConnectionWorkbenchState } from './utils/startupReadiness';
import { toSaveGlobalProxyInput } from './utils/globalProxyDraft';
import {
  detectConnectionImportKind,
  isConnectionPackagePasswordRequiredError,
  resolveConnectionPackageExportResult,
  normalizeConnectionPackagePassword,
} from './utils/connectionExport';
import {
  bootstrapSecureConfig,
  finalizeSecurityUpdateStatus,
  mergeSecurityUpdateStatusWithLegacySource,
  prepareSecureConfigForExternalMCP,
  startSecurityUpdateFromBootstrap,
} from './utils/secureConfigBootstrap';
import { bootstrapSavedQueries } from './utils/savedQueryPersistence';
import {
  LEGACY_PERSIST_KEY,
  hasLegacyMigratableSensitiveItems,
  stripLegacyPersistedConnectionById,
} from './utils/legacyConnectionStorage';
import {
  getSecurityUpdateStatusMeta,
  resolveSecurityUpdateEntryVisibility,
} from './utils/securityUpdatePresentation';
import {
  hasSecurityUpdateRecentResult,
  resolveSecurityUpdateRepairEntry,
  resolveSecurityUpdateSettingsFocusTarget,
  shouldRefreshSecurityUpdateDetailsFocus,
  shouldReopenSecurityUpdateDetails,
  shouldRetrySecurityUpdateAfterRepairSave,
  type SecurityUpdateRepairSource,
  type SecurityUpdateSettingsFocusTarget,
} from './utils/securityUpdateRepairFlow';
import { getWindowsScaleFixNudgedWidth, hasWindowsViewportScaleDrift } from './utils/windowsScaleFix';
import {
  SHORTCUT_ACTION_META,
  SHORTCUT_ACTION_ORDER,
  ShortcutAction,
  canRecordShortcutForAction,
  eventToShortcut,
  findReservedConflictsForAction,
  getShortcutDisplay,
  getShortcutDisplayLabel,
  getShortcutPlatform,
  installGlobalImeCompositionTracking,
  isEditableElement,
  isShortcutMatch,
  normalizeShortcutCombo,
  resolveShortcutBinding,
  splitConflictsByContext,
  type ConflictInfo,
} from './utils/shortcuts';
import { resolveTitleBarToggleIconKey, resolveWindowsScaleCheckDelayMs, shouldApplyWindowsScaleFix, shouldResetWebViewZoomForScaleFix, shouldToggleMaximisedWindowForScaleFix, type WindowScaleFixReason, type WindowsScaleCheckTrigger } from './utils/windowStateUi';
import { resolveVisibleStartupWindowBounds } from './utils/windowRestoreBounds';
import {
  SIDEBAR_UTILITY_ITEM_KEYS,
  resolveAIEntryPlacement,
  resolveLegacyAIEdgeHandleAttachment,
  resolveLegacyAIEdgeHandleDockStyle,
  resolveLegacyAIEdgeHandleStyle,
} from './utils/aiEntryLayout';
import { DEFAULT_AI_PANEL_WIDTH, resolveOverlayAIPanelWidth, shouldOverlayAIPanel } from './utils/aiPanelLayout';
import { safeWindowRuntimeCall } from './utils/wailsRuntime';
import {
  buildApplicationQuitUnsavedSQLLabel,
  collectApplicationQuitUnsavedSQLTargets,
  saveApplicationQuitUnsavedSQLTargets,
} from './utils/sqlEditorApplicationQuit';
import { useAppUpdateManager } from './hooks/useAppUpdateManager';
import { useAppLogPanelResize } from './hooks/useAppLogPanelResize';
import { useAppSidebarResize } from './hooks/useAppSidebarResize';
import { useAppUtilityStyles } from './hooks/useAppUtilityStyles';
import { ApplyDataRootDirectory, CancelApplicationQuit, ForceQuitApplication, GetDataRootDirectoryInfo, GetSavedConnections, ListInstalledFontFamilies, OpenDataRootDirectory, SelectDataRootDirectory, SetMacNativeWindowControls, SetWindowTranslucency } from '../wailsjs/go/app/App';
import { getAntdLocale } from './i18n/frameworkLocale';
import { useI18n } from './i18n/provider';
import './App.css';
import './v2-theme.css';
import './styles/v2-theme-workbench.css';

const { Sider, Content } = Layout;
const MIN_UI_SCALE = 0.8;
const MAX_UI_SCALE = 1.25;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 20;
const DEFAULT_UI_SCALE = 1.0;
const DEFAULT_FONT_SIZE = 14;
const EMPTY_INSTALLED_FONT_FAMILIES: InstalledFontFamily[] = [];

const createEmptySecurityUpdateStatus = (): SecurityUpdateStatus => ({
  overallStatus: 'not_detected',
  summary: {
    total: 0,
    updated: 0,
    pending: 0,
    skipped: 0,
    failed: 0,
  },
  issues: [],
});

const detectNavigatorPlatform = (): string => {
  if (typeof navigator === 'undefined') {
      return '';
  }
  const uaDataPlatform = (navigator as Navigator & {
      userAgentData?: { platform?: string };
  }).userAgentData?.platform;
  if (uaDataPlatform) {
      return uaDataPlatform;
  }
  return navigator.userAgent || '';
};

const readCurrentVisibleViewport = () => ({
  availWidth: window.screen?.availWidth || window.innerWidth || 0,
  availHeight: window.screen?.availHeight || window.innerHeight || 0,
  availLeft: (window.screen as Screen & { availLeft?: number })?.availLeft || 0,
  availTop: (window.screen as Screen & { availTop?: number })?.availTop || 0,
});

const getSystemThemeMode = (): 'light' | 'dark' => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};


const mergeSavedConnections = (current: SavedConnection[], imported: SavedConnection[]): SavedConnection[] => {
  const merged = new Map<string, SavedConnection>();
  current.forEach((conn) => merged.set(conn.id, conn));
  imported.forEach((conn) => merged.set(conn.id, conn));
  return Array.from(merged.values());
};

type ConnectionPackageDialogMode = 'import' | 'export';
type ToolCenterGroupKey = 'config' | 'workflow' | 'workspace';
type ToolCenterPaneKey =
  | 'connection-package'
  | 'data-root'
  | 'security-update'
  | 'schema-compare'
  | 'data-compare'
  | 'sync'
  | 'drivers'
  | 'snippet-settings'
  | 'shortcut-settings';

type ToolCenterPaneState = {
  key: ToolCenterPaneKey;
  group: ToolCenterGroupKey;
};

type ConnectionPackageDialogState = {
  open: boolean;
  mode: ConnectionPackageDialogMode;
  includeSecrets: boolean;
  useFilePassword: boolean;
  password: string;
  error: string;
  confirmLoading: boolean;
};

const createClosedConnectionPackageDialogState = (): ConnectionPackageDialogState => ({
  open: false,
  mode: 'export',
  includeSecrets: true,
  useFilePassword: false,
  password: '',
  error: '',
  confirmLoading: false,
});

function App() {
  const { language, t } = useI18n();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConnectionModalMounted, setIsConnectionModalMounted] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncModalEntryMode, setSyncModalEntryMode] = useState<DataSyncEntryMode>('sync');
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null);
  const connectionModalWarmupDoneRef = useRef(false);
  const windowState = useStore(state => state.windowState);
  const themeMode = useStore(state => state.theme);
  const themePreference = useStore(state => state.themePreference);
  const setTheme = useStore(state => state.setTheme);
  const setThemePreference = useStore(state => state.setThemePreference);
  const appearance = useStore(state => state.appearance);
  const setAppearance = useStore(state => state.setAppearance);
  const uiScale = useStore(state => state.uiScale);
  const setUiScale = useStore(state => state.setUiScale);
  const fontSize = useStore(state => state.fontSize);
  const setFontSize = useStore(state => state.setFontSize);
  const startupFullscreen = useStore(state => state.startupFullscreen);
  const setStartupFullscreen = useStore(state => state.setStartupFullscreen);
  const globalProxy = useStore(state => state.globalProxy);
  const setGlobalProxy = useStore(state => state.setGlobalProxy);
  const replaceConnections = useStore(state => state.replaceConnections);
  const replaceGlobalProxy = useStore(state => state.replaceGlobalProxy);
  const replaceSavedQueries = useStore(state => state.replaceSavedQueries);
  const shortcutOptions = useStore(state => state.shortcutOptions);
  const updateShortcut = useStore(state => state.updateShortcut);
  const resetShortcutOptions = useStore(state => state.resetShortcutOptions);
  const [systemThemeMode, setSystemThemeMode] = useState<'light' | 'dark'>(() => getSystemThemeMode());
  const darkMode = themeMode === 'dark';
  const isV2Ui = appearance.uiVersion === 'v2';
  const effectiveUiScale = Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Number(uiScale) || DEFAULT_UI_SCALE));
  const effectiveFontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(Number(fontSize) || DEFAULT_FONT_SIZE)));
  const tokenFontSize = Math.round(effectiveFontSize * effectiveUiScale);
  const titleBarToggleIconKey = resolveTitleBarToggleIconKey(
      windowState === 'fullscreen' ? 'fullscreen' : (windowState === 'maximized' ? 'maximized' : 'normal')
  );
  const tokenFontSizeSM = Math.max(10, Math.round(tokenFontSize * 0.86));
  const tokenFontSizeLG = Math.max(tokenFontSize + 1, Math.round(tokenFontSize * 1.14));
  const tokenControlHeight = Math.max(24, Math.round(32 * effectiveUiScale));
  const tokenControlHeightSM = Math.max(20, Math.round(24 * effectiveUiScale));
  const tokenControlHeightLG = Math.max(30, Math.round(40 * effectiveUiScale));
  const dataTableFontSizeFollowsGlobal = appearance.dataTableFontSizeFollowGlobal !== false;
  const sidebarTreeFontSizeFollowsGlobal = appearance.sidebarTreeFontSizeFollowGlobal !== false;
  const effectiveDataTableFontSize = dataTableFontSizeFollowsGlobal
      ? effectiveFontSize
      : (sanitizeDataTableFontSize(appearance.dataTableFontSize) ?? effectiveFontSize);
  const effectiveSidebarTreeFontSize = sidebarTreeFontSizeFollowsGlobal
      ? effectiveFontSize
      : (sanitizeSidebarTreeFontSize(appearance.sidebarTreeFontSize) ?? effectiveFontSize);
  const effectiveSidebarRailScale = sanitizeV2SidebarRailScale(appearance.v2SidebarRailScale);
  const tableDoubleClickAction = appearance.tableDoubleClickAction === 'open-design' ? 'open-design' : 'open-data';
  const tabDisplaySettings = useMemo(
      () => sanitizeTabDisplaySettings(appearance.tabDisplay),
      [appearance.tabDisplay],
  );
  const tabDisplayElementOrder = useMemo(
      () => resolveTabDisplayElementOrder(tabDisplaySettings),
      [tabDisplaySettings],
  );
  const visibleTabDisplayElementKeys = useMemo(
      () => new Set<TabDisplayElementKey>([
          ...tabDisplaySettings.primaryElements,
          ...tabDisplaySettings.secondaryElements,
      ]),
      [tabDisplaySettings],
  );
  const getTabDisplayElementLabel = useCallback(
      (key: TabDisplayElementKey) => t(TAB_DISPLAY_ELEMENT_META[key].labelKey),
      [t],
  );
  const getTabDisplayElementDescription = useCallback(
      (key: TabDisplayElementKey) => t(TAB_DISPLAY_ELEMENT_META[key].descriptionKey),
      [t],
  );
  useEffect(() => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
          return;
      }
      const mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
      const applySystemTheme = (matches: boolean) => {
          setSystemThemeMode(matches ? 'dark' : 'light');
      };
      applySystemTheme(mediaQueryList.matches);
      const handleChange = (event: MediaQueryListEvent) => {
          applySystemTheme(event.matches);
      };
      if (typeof mediaQueryList.addEventListener === 'function') {
          mediaQueryList.addEventListener('change', handleChange);
          return () => {
              mediaQueryList.removeEventListener('change', handleChange);
          };
      }
      mediaQueryList.addListener(handleChange);
      return () => {
          mediaQueryList.removeListener(handleChange);
      };
  }, []);
  useEffect(() => {
      const resolvedTheme = themePreference === 'system' ? systemThemeMode : themePreference;
      if (themeMode !== resolvedTheme) {
          setTheme(resolvedTheme);
      }
      if (themePreference === 'system') {
          void safeWindowRuntimeCall(() => WindowSetSystemDefaultTheme(), undefined);
          return;
      }
      if (resolvedTheme === 'dark') {
          void safeWindowRuntimeCall(() => WindowSetDarkTheme(), undefined);
          return;
      }
      void safeWindowRuntimeCall(() => WindowSetLightTheme(), undefined);
  }, [setTheme, systemThemeMode, themeMode, themePreference]);
  const setTabDisplaySettings = useCallback((settings: Partial<TabDisplaySettings>) => {
      setAppearance({
          tabDisplay: applyTabDisplaySettingsPatch(tabDisplaySettings, settings),
      });
  }, [setAppearance, tabDisplaySettings]);
  const setTabDisplayLayout = useCallback((layout: TabDisplayLayout) => {
      if (layout === tabDisplaySettings.layout) return;
      setAppearance({
          tabDisplay: switchTabDisplayLayout(tabDisplaySettings, layout),
      });
  }, [setAppearance, tabDisplaySettings]);
  const updateTabDisplayElementVisibility = useCallback((key: TabDisplayElementKey, checked: boolean) => {
      setFocusedTabDisplayElementKey(key);
      const removeKey = (keys: TabDisplayElementKey[]) => keys.filter((item) => item !== key);
      if (!checked) {
          setTabDisplaySettings({
              layout: tabDisplaySettings.layout,
              primaryElements: removeKey(tabDisplaySettings.primaryElements),
              secondaryElements: removeKey(tabDisplaySettings.secondaryElements),
          });
          return;
      }

      const primaryElements = removeKey(tabDisplaySettings.primaryElements);
      const secondaryElements = removeKey(tabDisplaySettings.secondaryElements);
      if (tabDisplaySettings.layout === 'double' && TAB_DISPLAY_SECONDARY_DEFAULT_KEYS.includes(key)) {
          secondaryElements.push(key);
      } else {
          primaryElements.push(key);
      }
      setTabDisplaySettings({
          layout: tabDisplaySettings.layout,
          primaryElements,
          secondaryElements,
      });
  }, [setTabDisplaySettings, tabDisplaySettings]);
  const moveTabDisplayElement = useCallback((key: TabDisplayElementKey, offset: -1 | 1) => {
      setFocusedTabDisplayElementKey(key);
      const moveWithin = (keys: TabDisplayElementKey[]) => {
          const index = keys.indexOf(key);
          if (index < 0) return keys;
          const nextIndex = index + offset;
          if (nextIndex < 0 || nextIndex >= keys.length) return keys;
          const next = [...keys];
          [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
          return next;
      };

      setTabDisplaySettings({
          layout: tabDisplaySettings.layout,
          primaryElements: moveWithin(tabDisplaySettings.primaryElements),
          secondaryElements: moveWithin(tabDisplaySettings.secondaryElements),
      });
  }, [setTabDisplaySettings, tabDisplaySettings]);
  const setTabDisplayElementRow = useCallback((key: TabDisplayElementKey, row: 'primary' | 'secondary') => {
      setFocusedTabDisplayElementKey(key);
      const primaryElements = tabDisplaySettings.primaryElements.filter((item) => item !== key);
      const secondaryElements = tabDisplaySettings.secondaryElements.filter((item) => item !== key);
      if (row === 'primary') {
          primaryElements.push(key);
      } else {
          secondaryElements.push(key);
      }
      setTabDisplaySettings({
          layout: tabDisplaySettings.layout,
          primaryElements,
          secondaryElements,
      });
  }, [setTabDisplaySettings, tabDisplaySettings]);
  const resolvedUiFontFamily = resolveUIFontFamily(appearance.customUIFontFamily);
  const resolvedMonoFontFamily = resolveMonoFontFamily(appearance.customMonoFontFamily);
  const appComponentSize: 'small' | 'middle' | 'large' = effectiveUiScale <= 0.92 ? 'small' : (effectiveUiScale >= 1.12 ? 'large' : 'middle');
  const titleBarHeight = Math.max(28, Math.round(32 * effectiveUiScale));
  const titleBarButtonWidth = Math.max(40, Math.round(46 * effectiveUiScale));
  const floatingLogButtonHeight = Math.max(30, Math.round(34 * effectiveUiScale));
  const resolvedAppearance = resolveAppearanceValues(appearance);
  const effectiveOpacity = normalizeOpacityForPlatform(resolvedAppearance.opacity);
  const effectiveBlur = normalizeBlurForPlatform(resolvedAppearance.blur);
  const blurFilter = blurToFilter(effectiveBlur);
  const [runtimePlatform, setRuntimePlatform] = useState('');
  const [runtimeBuildType, setRuntimeBuildType] = useState('');
  const [isLinuxRuntime, setIsLinuxRuntime] = useState(false);
  const [installedFontFamilies, setInstalledFontFamilies] = useState<InstalledFontFamily[]>(EMPTY_INSTALLED_FONT_FAMILIES);
  const [isFontFamiliesLoading, setIsFontFamiliesLoading] = useState(false);
  const [fontFamiliesLoadError, setFontFamiliesLoadError] = useState<string | null>(null);
  const hasLoadedInstalledFontsRef = useRef(false);
  const uiFontOptions = useMemo(
      () => buildFontFamilyOptions(runtimePlatform, 'ui', installedFontFamilies, t),
      [installedFontFamilies, runtimePlatform, t],
  );
  const monoFontOptions = useMemo(
      () => buildFontFamilyOptions(runtimePlatform, 'mono', installedFontFamilies, t),
      [installedFontFamilies, runtimePlatform, t],
  );
  const linuxCJKFontInstallHint = getLinuxCJKFontInstallHint(runtimePlatform, installedFontFamilies);
  const [isStoreHydrated, setIsStoreHydrated] = useState(() => useStore.persist.hasHydrated());
  const [hasLoadedSecureConfig, setHasLoadedSecureConfig] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth || 1280));
  const [securityUpdateStatus, setSecurityUpdateStatus] = useState<SecurityUpdateStatus>(() => createEmptySecurityUpdateStatus());
  const [securityUpdateRawPayload, setSecurityUpdateRawPayload] = useState<string | null>(null);
  const [securityUpdateHasLegacySensitiveItems, setSecurityUpdateHasLegacySensitiveItems] = useState(false);
  const [isSecurityUpdateIntroOpen, setIsSecurityUpdateIntroOpen] = useState(false);
  const [isSecurityUpdateBannerDismissed, setIsSecurityUpdateBannerDismissed] = useState(false);
  const [isSecurityUpdateSettingsOpen, setIsSecurityUpdateSettingsOpen] = useState(false);
  const [securityUpdateSettingsFocusTarget, setSecurityUpdateSettingsFocusTarget] = useState<SecurityUpdateSettingsFocusTarget | null>(null);
  const [securityUpdateSettingsFocusRequest, setSecurityUpdateSettingsFocusRequest] = useState(0);
  const [isSecurityUpdateProgressOpen, setIsSecurityUpdateProgressOpen] = useState(false);
  const [securityUpdateProgressStage, setSecurityUpdateProgressStage] = useState(() => t('app.security_update.stage.checking_saved_config'));
  const [securityUpdateRepairSource, setSecurityUpdateRepairSource] = useState<SecurityUpdateRepairSource | null>(null);
  const [focusedTabDisplayElementKey, setFocusedTabDisplayElementKey] = useState<TabDisplayElementKey | null>(null);
  const [focusedAIProviderId, setFocusedAIProviderId] = useState<string | undefined>(undefined);
  const [connectionPackageDialog, setConnectionPackageDialog] = useState<ConnectionPackageDialogState>(() => createClosedConnectionPackageDialogState());
  const [pendingConnectionImportPayload, setPendingConnectionImportPayload] = useState<string | null>(null);
  const [aiPanelRenderNonce, setAiPanelRenderNonce] = useState(0);
  const sidebarWidth = useStore(state => state.sidebarWidth);
  const setSidebarWidth = useStore(state => state.setSidebarWidth);
  const aiPanelVisible = useStore(state => state.aiPanelVisible);
  const toggleAIPanel = useStore(state => state.toggleAIPanel);
  const setAIPanelVisible = useStore(state => state.setAIPanelVisible);
  const globalProxyInvalidHintShownRef = React.useRef(false);
  const windowDiagSequenceRef = React.useRef(0);
  const windowDiagLastSignatureRef = React.useRef('');
  const windowDiagLastAtRef = React.useRef(0);
  const connectionWorkbenchState = getConnectionWorkbenchState(isStoreHydrated, hasLoadedSecureConfig);
  const securityUpdateStatusMeta = useMemo(
      () => getSecurityUpdateStatusMeta(securityUpdateStatus, t),
      [securityUpdateStatus, t],
  );
  const securityUpdateEntryVisibility = useMemo(
      () => resolveSecurityUpdateEntryVisibility(securityUpdateStatus),
      [securityUpdateStatus],
  );

  const windowCornerRadius = 14;
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const syncViewportWidth = () => {
      setViewportWidth(window.innerWidth || document.documentElement?.clientWidth || 1280);
    };
    syncViewportWidth();
    window.addEventListener('resize', syncViewportWidth);
    return () => window.removeEventListener('resize', syncViewportWidth);
  }, []);

  useEffect(()=>{
    if (typeof document === 'undefined' || !document.body) {
        return;
    }
    switch(windowState){
        case 'fullscreen':
        case 'maximized':
            document.body.style.setProperty('--gonavi-border-radius', '0px');
            break;
        default:
            document.body.style.setProperty('--gonavi-border-radius', `${windowCornerRadius}px`);
            break;
    }
  }, [windowState]);

  // 同步 macOS 窗口透明度：opacity=1.0 且 blur=0 时关闭 NSVisualEffectView，
  // 避免 GPU 持续计算窗口背后的模糊合成
  useEffect(() => {
    try {
        void SetWindowTranslucency(resolvedAppearance.opacity, resolvedAppearance.blur).catch(() => undefined);
    } catch(e) { /* ignore */ }
  }, [resolvedAppearance.blur, resolvedAppearance.opacity]);

  useEffect(() => {
      let cancelled = false;
      try {
          Environment()
              .then((env) => {
                  if (cancelled) return;
                  const platform = String(env?.platform || '').toLowerCase();
                  setRuntimePlatform(platform);
                  setRuntimeBuildType(String(env?.buildType || '').toLowerCase());
                  setIsLinuxRuntime(platform === 'linux');
              })
              .catch(() => {
                  if (cancelled) return;
                  const platform = detectNavigatorPlatform();
                  const normalized = /linux/i.test(platform)
                      ? 'linux'
                      : (/mac/i.test(platform) ? 'darwin' : (/win/i.test(platform) ? 'windows' : ''));
                  setRuntimePlatform(normalized);
                  setIsLinuxRuntime(normalized === 'linux');
              });
      } catch(e) {
          if (cancelled) return;
          const platform = detectNavigatorPlatform();
          const normalized = /linux/i.test(platform)
              ? 'linux'
              : (/mac/i.test(platform) ? 'darwin' : (/win/i.test(platform) ? 'windows' : ''));
          setRuntimePlatform(normalized);
          setIsLinuxRuntime(normalized === 'linux');
      }
      return () => {
          cancelled = true;
      };
  }, []);

  useEffect(() => {
      if (isStoreHydrated) {
          return;
      }
      const unsubscribe = useStore.persist.onFinishHydration(() => {
          setIsStoreHydrated(true);
      });
      return () => {
          unsubscribe();
      };
  }, [isStoreHydrated]);

  useEffect(() => {
      if (!isStoreHydrated) {
          return;
      }

      let cancelled = false;
      const loadSavedQueries = async () => {
          try {
              await bootstrapSavedQueries({
                  backend: (window as any).go?.app?.App,
                  replaceSavedQueries: (queries) => {
                      if (!cancelled) {
                          replaceSavedQueries(queries);
                      }
                  },
              });
          } catch (err) {
              console.warn('Failed to bootstrap saved queries', err);
          }
      };

      void loadSavedQueries();
      return () => {
          cancelled = true;
      };
  }, [isStoreHydrated, replaceSavedQueries]);

  const normalizeSecurityUpdateStatus = useCallback((status?: Partial<SecurityUpdateStatus> | null): SecurityUpdateStatus => {
      const fallback = createEmptySecurityUpdateStatus();
      return {
          ...fallback,
          ...(status ?? {}),
          summary: {
              ...fallback.summary,
              ...(status?.summary ?? {}),
          },
          issues: Array.isArray(status?.issues) ? status.issues : [],
      };
  }, []);

  const applySecurityUpdateStatus = useCallback((
      status?: Partial<SecurityUpdateStatus> | null,
      options?: {
          openSettings?: boolean;
          refreshFocus?: boolean;
          resetBannerDismissed?: boolean;
      },
  ) => {
      const nextStatus = normalizeSecurityUpdateStatus(status);
      const visibility = resolveSecurityUpdateEntryVisibility(nextStatus);
      setSecurityUpdateStatus(nextStatus);
      setIsSecurityUpdateIntroOpen(visibility.showIntro);
      if (options?.resetBannerDismissed !== false) {
          setIsSecurityUpdateBannerDismissed(false);
      }
      if (options?.openSettings) {
          if (options.refreshFocus !== false) {
              setSecurityUpdateSettingsFocusTarget(resolveSecurityUpdateSettingsFocusTarget(nextStatus));
              setSecurityUpdateSettingsFocusRequest((current) => current + 1);
          }
          setIsSecurityUpdateSettingsOpen(true);
      }
      return nextStatus;
  }, [normalizeSecurityUpdateStatus]);

  useEffect(() => {
      if (!isStoreHydrated) {
          return;
      }

      let cancelled = false;
      const loadSecureConfig = async () => {
          try {
              const result = await bootstrapSecureConfig({
                  backend: (window as any).go?.app?.App,
                  autoStartLegacySecurityUpdate: true,
                  replaceConnections,
                  replaceGlobalProxy,
                  t,
              });
              if (cancelled) {
                  return;
              }
              setSecurityUpdateRawPayload(result.rawPayload);
              setSecurityUpdateHasLegacySensitiveItems(result.hasLegacySensitiveItems);
              applySecurityUpdateStatus(result.status);
          } catch (err) {
              console.warn('Failed to bootstrap secure config', err);
          } finally {
              if (!cancelled) {
                  setHasLoadedSecureConfig(true);
              }
          }
      };

      void loadSecureConfig();
      return () => {
          cancelled = true;
      };
  }, [applySecurityUpdateStatus, isStoreHydrated, replaceConnections, replaceGlobalProxy, t]);

  useEffect(() => {
      if (!isStoreHydrated || !hasLoadedSecureConfig) {
          return;
      }

      const host = String(globalProxy.host || '').trim();
      const port = Number(globalProxy.port);
      const portValid = Number.isFinite(port) && port > 0 && port <= 65535;
      const invalidWhenEnabled = globalProxy.enabled && (!host || !portValid);

      if (invalidWhenEnabled) {
          if (!globalProxyInvalidHintShownRef.current) {
              void message.warning({
                  content: t('app.proxy.message.invalid_enabled'),
                  key: 'global-proxy-invalid',
              });
              globalProxyInvalidHintShownRef.current = true;
          }
          return;
      }

      globalProxyInvalidHintShownRef.current = false;
      void message.destroy('global-proxy-invalid');

      const backendApp = (window as any).go?.app?.App;
      if (typeof backendApp?.SaveGlobalProxy !== 'function') {
          return;
      }

      let cancelled = false;
      Promise.resolve(
          backendApp.SaveGlobalProxy(
              toSaveGlobalProxyInput({
                  ...globalProxy,
                  host,
                  port: portValid ? port : (globalProxy.type === 'http' ? 8080 : 1080),
              })
          )
      )
          .catch((err) => {
              if (cancelled) {
                  return;
              }
              const errMsg = err instanceof Error ? err.message : String(err || t('common.unknown'));
              void message.error({
                  content: t('app.proxy.message.save_failed', { error: errMsg }),
                  key: 'global-proxy-sync-error',
              });
          });

      return () => {
          cancelled = true;
      };
  }, [
      isStoreHydrated,
      hasLoadedSecureConfig,
      globalProxy.enabled,
      globalProxy.type,
      globalProxy.host,
      globalProxy.port,
      globalProxy.user,
      globalProxy.password,
      t,
  ]);

  useEffect(() => {
      let cancelled = false;
      let startupWindowTimer: number | null = null;
      const maxApplyAttempts = 6;
      const applyRetryDelayMs = 400;
      const settleDelayMs = 160;
      const useMaximiseForStartup = isWindowsPlatform();

      const checkStartupPreferenceApplied = async (): Promise<boolean> => {
          try {
              if (await WindowIsFullscreen()) {
                  return true;
              }
          } catch (_) {
              // ignore
          }
          try {
              if (await WindowIsMaximised()) {
                  return true;
              }
          } catch (_) {
              // ignore
          }
          return false;
      };

      const applyStartupWindowPreference = (attempt: number) => {
          if (startupWindowTimer !== null) {
              window.clearTimeout(startupWindowTimer);
          }
          startupWindowTimer = window.setTimeout(() => {
              if (cancelled) {
                  return;
              }
              if (!useStore.getState().startupFullscreen) {
                  return;
              }
              void Promise.resolve()
                  .then(async () => {
                      if (await checkStartupPreferenceApplied()) {
                          return;
                      }
                      // Windows 使用最大化，避免进入真正全屏后无法通过标题栏交互退出。
                      // 其他平台保持全屏优先、最大化兜底。
                      try {
                          if (useMaximiseForStartup) {
                              await WindowMaximise();
                              await new Promise((resolve) => window.setTimeout(resolve, settleDelayMs));
                          } else {
                              await WindowFullscreen();
                              await new Promise((resolve) => window.setTimeout(resolve, settleDelayMs));
                              if (await checkStartupPreferenceApplied()) {
                                  return;
                              }
                              await WindowMaximise();
                              await new Promise((resolve) => window.setTimeout(resolve, settleDelayMs));
                          }
                      } catch (e) {
                          console.warn("Wails Window APIs unavailable", e);
                      }
                      
                      if (await checkStartupPreferenceApplied()) {
                          return;
                      }
                      if (attempt < maxApplyAttempts) {
                          applyStartupWindowPreference(attempt + 1);
                      }
                  });
          }, applyRetryDelayMs);
      };

      const restoreWindowState = async () => {
          if (cancelled) return;
          const state = useStore.getState();
          // startupFullscreen 设置优先
          if (state.startupFullscreen) {
              applyStartupWindowPreference(1);
              return;
          }
          // 根据上次保存的窗口状态恢复
          const savedState = state.windowState;
          if (savedState === 'fullscreen') {
              applyStartupWindowPreference(1);
              return;
          }
          if (savedState === 'maximized') {
              try { await WindowMaximise(); } catch (_) {}
              return;
          }
          // 普通窗口：恢复尺寸和位置
          const bounds = state.windowBounds;
          if (!bounds || bounds.width < 400 || bounds.height < 300) return;
          try {
              const nextBounds = resolveVisibleStartupWindowBounds(bounds, readCurrentVisibleViewport());
              if (
                  nextBounds.x !== bounds.x ||
                  nextBounds.y !== bounds.y ||
                  nextBounds.width !== bounds.width ||
                  nextBounds.height !== bounds.height
              ) {
                  void emitWindowDiagnostic('adjust:startup-window-bounds', {
                      from: bounds,
                      to: nextBounds,
                  });
                  state.setWindowBounds(nextBounds);
              }
              WindowSetSize(nextBounds.width, nextBounds.height);
              WindowSetPosition(nextBounds.x, nextBounds.y);
          } catch (e) {
              console.warn('Failed to restore window bounds', e);
          }
      };

      if (useStore.persist.hasHydrated()) {
          void restoreWindowState();
      }
      const unsubscribeHydration = useStore.persist.onFinishHydration(() => {
          if (cancelled) {
              return;
          }
          void restoreWindowState();
      });

      return () => {
          cancelled = true;
          if (startupWindowTimer !== null) {
              window.clearTimeout(startupWindowTimer);
          }
          unsubscribeHydration();
      };
  }, []);

  // 定时保存窗口状态、尺寸与位置
  useEffect(() => {
      const SAVE_INTERVAL_MS = 2000;
      let cancelled = false;
      let hydrated = useStore.persist.hasHydrated();
      let eventSaveTimer: number | null = null;
      let boundsRepairTimer: number | null = null;
      let lastSaved = '';

      const saveWindowState = async () => {
          if (cancelled || !hydrated) {
              return;
          }
          try {
              const [isFs, isMax] = await Promise.all([
                  safeWindowRuntimeCall(() => WindowIsFullscreen(), false),
                  safeWindowRuntimeCall(() => WindowIsMaximised(), false),
              ]);

              // 保存窗口状态
              const store = useStore.getState();
              const newState = isFs ? 'fullscreen' : (isMax ? 'maximized' : 'normal');
              if (store.windowState !== newState) {
                  void emitWindowDiagnostic('transition:windowState', {
                      from: store.windowState,
                      to: newState,
                  });
                  store.setWindowState(newState);
              }

              // 只在普通窗口模式下保存尺寸和位置
              if (isFs || isMax) return;

              const [size, pos] = await Promise.all([
                  safeWindowRuntimeCall(() => WindowGetSize(), null),
                  safeWindowRuntimeCall(() => WindowGetPosition(), null),
              ]);
              if (!size || !pos) return;
              const w = Math.trunc(Number(size.w || 0));
              const h = Math.trunc(Number(size.h || 0));
              const x = Math.trunc(Number(pos.x || 0));
              const y = Math.trunc(Number(pos.y || 0));
               if (w < 400 || h < 300) return;

               const key = `${w},${h},${x},${y}`;
               if (key === lastSaved) return;
               lastSaved = key;
               if (Math.abs(x) > 5000 || Math.abs(y) > 5000) {
                   void emitWindowDiagnostic('anomaly:windowBounds', { width: w, height: h, x, y });
               }
               store.setWindowBounds({ width: w, height: h, x, y });
            } catch (e) {
                // 静默忽略
            }
      };

      const scheduleWindowStateSave = (delayMs = 120) => {
          if (cancelled || !hydrated) {
              return;
          }
          if (eventSaveTimer !== null) {
              window.clearTimeout(eventSaveTimer);
          }
          eventSaveTimer = window.setTimeout(() => {
              eventSaveTimer = null;
              void saveWindowState();
          }, delayMs);
      };

      const repairRuntimeWindowBounds = async () => {
          if (cancelled || !hydrated) {
              return;
          }
          try {
              const [isFs, isMax] = await Promise.all([
                  safeWindowRuntimeCall(() => WindowIsFullscreen(), false),
                  safeWindowRuntimeCall(() => WindowIsMaximised(), false),
              ]);
              if (isFs || isMax) {
                  return;
              }
              const [size, pos] = await Promise.all([
                  safeWindowRuntimeCall(() => WindowGetSize(), null),
                  safeWindowRuntimeCall(() => WindowGetPosition(), null),
              ]);
              if (!size || !pos) {
                  return;
              }
              const currentBounds = {
                  width: Math.trunc(Number(size.w || 0)),
                  height: Math.trunc(Number(size.h || 0)),
                  x: Math.trunc(Number(pos.x || 0)),
                  y: Math.trunc(Number(pos.y || 0)),
              };
              if (currentBounds.width <= 0 || currentBounds.height <= 0) {
                  return;
              }
              const nextBounds = resolveVisibleStartupWindowBounds(currentBounds, readCurrentVisibleViewport());
              if (
                  nextBounds.x === currentBounds.x &&
                  nextBounds.y === currentBounds.y &&
                  nextBounds.width === currentBounds.width &&
                  nextBounds.height === currentBounds.height
              ) {
                  return;
              }
              void emitWindowDiagnostic('adjust:runtime-window-bounds', {
                  from: currentBounds,
                  to: nextBounds,
              });
              WindowSetSize(nextBounds.width, nextBounds.height);
              WindowSetPosition(nextBounds.x, nextBounds.y);
              lastSaved = `${nextBounds.width},${nextBounds.height},${nextBounds.x},${nextBounds.y}`;
              useStore.getState().setWindowBounds(nextBounds);
              window.dispatchEvent(new Event('resize'));
          } catch {
              // Wails runtime window APIs are best-effort here.
          }
      };

      const scheduleWindowBoundsRepair = (delayMs = 80) => {
          if (cancelled || !hydrated) {
              return;
          }
          if (boundsRepairTimer !== null) {
              window.clearTimeout(boundsRepairTimer);
          }
          boundsRepairTimer = window.setTimeout(() => {
              boundsRepairTimer = null;
              void repairRuntimeWindowBounds();
          }, delayMs);
      };

      const handleWindowRuntimeChange = () => {
          scheduleWindowBoundsRepair();
          scheduleWindowStateSave(260);
      };

      const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
              scheduleWindowBoundsRepair();
              scheduleWindowStateSave(260);
          }
      };

      const handleWindowLifecycleFlush = () => {
          void saveWindowState();
      };

      if (hydrated) {
          scheduleWindowBoundsRepair(360);
          scheduleWindowStateSave(320);
      }
      const unsubscribeHydration = useStore.persist.onFinishHydration(() => {
          if (cancelled || hydrated) {
              return;
          }
          hydrated = true;
          scheduleWindowBoundsRepair(360);
          scheduleWindowStateSave(320);
      });

      const timer = window.setInterval(() => {
          void saveWindowState();
      }, SAVE_INTERVAL_MS);
      window.addEventListener('resize', handleWindowRuntimeChange);
      window.addEventListener('focus', handleWindowRuntimeChange);
      window.addEventListener('pageshow', handleWindowRuntimeChange);
      window.addEventListener('pagehide', handleWindowLifecycleFlush, { capture: true });
      window.addEventListener('beforeunload', handleWindowLifecycleFlush, { capture: true });
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
          cancelled = true;
          if (eventSaveTimer !== null) {
              window.clearTimeout(eventSaveTimer);
          }
          if (boundsRepairTimer !== null) {
              window.clearTimeout(boundsRepairTimer);
          }
          window.clearInterval(timer);
          window.removeEventListener('resize', handleWindowRuntimeChange);
          window.removeEventListener('focus', handleWindowRuntimeChange);
          window.removeEventListener('pageshow', handleWindowRuntimeChange);
          window.removeEventListener('pagehide', handleWindowLifecycleFlush, { capture: true });
          window.removeEventListener('beforeunload', handleWindowLifecycleFlush, { capture: true });
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          unsubscribeHydration();
      };
  }, []);

  useEffect(() => {
      if (!isWindowsPlatform()) {
          return;
      }

      let cancelled = false;
      let inFlight = false;
      let lastRatio = Number(window.devicePixelRatio) || 1;
      let lastFixAt = 0;
      let activationTimer: number | null = null;
      let resizeTimer: number | null = null;
      let minimisedSeen = false;
      let hiddenSeen = document.visibilityState === 'hidden';

      const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

      const fixWindowScaleIfNeeded = async (reason: WindowScaleFixReason) => {
          if (cancelled || inFlight) return;
          const now = Date.now();
          if (now - lastFixAt < 700) return;
          inFlight = true;
          try {
              const [isFullscreen, isMaximised] = await Promise.all([
                  safeWindowRuntimeCall(() => WindowIsFullscreen(), false),
                  safeWindowRuntimeCall(() => WindowIsMaximised(), false),
              ]);

              // 全屏状态下只广播 resize，避免破坏用户的全屏上下文。
              if (isFullscreen) {
                  window.dispatchEvent(new Event('resize'));
                  lastFixAt = Date.now();
                  return;
              }

              const size = await safeWindowRuntimeCall(() => WindowGetSize(), null);
              const width = Math.trunc(Number(size?.w || 0));
              const height = Math.trunc(Number(size?.h || 0));
              const hasViewportScaleDrift = hasWindowsViewportScaleDrift({
                  windowWidth: width,
                  innerWidth: window.innerWidth,
                  devicePixelRatio: Number(window.devicePixelRatio) || 1,
                  visualViewportScale: window.visualViewport?.scale,
              });
              const shouldResetWebViewZoom = shouldResetWebViewZoomForScaleFix(reason, hasViewportScaleDrift);

              if (shouldResetWebViewZoom && !isMaximised) {
                  try {
                      const res = await (window as any).go?.app?.App?.ResetWebViewZoom?.();
                      if (!res?.success) {
                          console.warn('ResetWebViewZoom unavailable in fixWindowScaleIfNeeded:', res?.message);
                      }
                  } catch (e) {
                      console.warn('ResetWebViewZoom call failed in fixWindowScaleIfNeeded', e);
                  }
              }

              if (isMaximised) {
                  if (!shouldToggleMaximisedWindowForScaleFix(reason, hasViewportScaleDrift)) {
                      // restore（任务栏点击恢复后字体异常变大/变糊）的零感知修复路径：
                      // 调 backend App.ResetWebViewZoom 触发 WebView2 ICoreWebView2Controller::put_ZoomFactor(1.0)，
                      // 让 WebView2 重算 D2D/DirectWrite 字体度量。该异常不一定表现为 viewport ratio drift，
                      // 所以 restore 场景不能依赖 hasViewportScaleDrift。完全不动窗口、零动画。
                      // backend 失败（wails 升级破坏反射 / 非 Windows）时回退到 dispatch resize 兜底；
                      // 用户仍可按 Ctrl+Shift+0 手动 toggle 修复。
                      if (shouldResetWebViewZoom) {
                          try {
                              const res = await (window as any).go?.app?.App?.ResetWebViewZoom?.();
                              if (!res?.success) {
                                  console.warn('ResetWebViewZoom unavailable in fixWindowScaleIfNeeded:', res?.message);
                              }
                          } catch (e) {
                              console.warn('ResetWebViewZoom call failed in fixWindowScaleIfNeeded', e);
                          }
                      }
                      window.dispatchEvent(new Event('resize'));
                      lastFixAt = Date.now();
                      return;
                  }

                  try {
                      WindowUnmaximise();
                      await wait(96);
                      WindowMaximise();
                      await wait(96);
                  } catch (e) {
                      console.warn("Wails Window maximise restore unavailable in fixWindowScaleIfNeeded", e);
                  }
                  window.dispatchEvent(new Event('resize'));
                  lastFixAt = Date.now();
                  return;
              }

              if (width <= 0 || height <= 0) {
                  window.dispatchEvent(new Event('resize'));
                  lastFixAt = Date.now();
                  return;
              }

              if (!shouldApplyWindowsScaleFix(reason, hasViewportScaleDrift)) {
                  window.dispatchEvent(new Event('resize'));
                  lastFixAt = Date.now();
                  return;
              }

              const nudgedWidth = getWindowsScaleFixNudgedWidth(width);
              try {
                  WindowSetSize(nudgedWidth, height);
                  await wait(28);
                  WindowSetSize(width, height);
              } catch(e) {}
              window.dispatchEvent(new Event('resize'));
              lastFixAt = Date.now();
          } catch(e) {
              console.warn("Wails Window APIs unavailable in fixWindowScaleIfNeeded", e);
          } finally {
              inFlight = false;
          }
      };

      const rememberMinimisedState = async (): Promise<boolean> => {
          if (cancelled) return false;
          const isMinimised = await safeWindowRuntimeCall(() => WindowIsMinimised(), false);
          if (isMinimised) {
              minimisedSeen = true;
          }
          return isMinimised;
      };

      const rememberMinimisedStateSoon = () => {
          window.setTimeout(() => {
              if (cancelled) return;
              void rememberMinimisedState();
          }, 120);
      };

      const checkDevicePixelRatio = () => {
          if (cancelled) return;
          const currentRatio = Number(window.devicePixelRatio) || 1;
          if (Math.abs(currentRatio - lastRatio) < 0.02) {
              return;
          }
          lastRatio = currentRatio;
          if (minimisedSeen || hiddenSeen) {
              scheduleActivationFix();
              return;
          }
          void fixWindowScaleIfNeeded('ratio-change');
      };

      const scheduleDevicePixelRatioCheck = (trigger: WindowsScaleCheckTrigger) => {
          if (cancelled) return;
          const delayMs = resolveWindowsScaleCheckDelayMs(trigger);
          if (delayMs <= 0) {
              checkDevicePixelRatio();
              return;
          }

          if (resizeTimer !== null) {
              window.clearTimeout(resizeTimer);
          }
          resizeTimer = window.setTimeout(() => {
              resizeTimer = null;
              if (cancelled) return;
              checkDevicePixelRatio();
          }, delayMs);
      };

      const scheduleActivationFix = () => {
          if (cancelled) return;
          if (activationTimer !== null) {
              window.clearTimeout(activationTimer);
          }
          const delayMs = (minimisedSeen || hiddenSeen) ? 260 : 80;
          activationTimer = window.setTimeout(async () => {
              activationTimer = null;
              if (cancelled) return;
              if (await rememberMinimisedState()) {
                  return;
              }
              const reason: WindowScaleFixReason = (minimisedSeen || hiddenSeen) ? 'restore' : 'activation';
              minimisedSeen = false;
              hiddenSeen = false;
              void fixWindowScaleIfNeeded(reason);
          }, delayMs);
      };

      const handleWindowFocus = () => {
          if (cancelled) return;
          scheduleDevicePixelRatioCheck('focus');
          scheduleActivationFix();
      };

      const handleWindowBlur = () => {
          if (cancelled) return;
          if (document.visibilityState === 'hidden') {
              hiddenSeen = true;
          }
          rememberMinimisedStateSoon();
      };

      const handleVisibilityChange = () => {
          if (cancelled) return;
          if (document.visibilityState !== 'visible') {
              hiddenSeen = true;
              rememberMinimisedStateSoon();
              return;
          }
          scheduleDevicePixelRatioCheck('visibilitychange');
          scheduleActivationFix();
      };

      const handlePageShow = () => {
          if (cancelled) return;
          scheduleDevicePixelRatioCheck('pageshow');
          scheduleActivationFix();
      };

      const handleWindowResize = () => {
          rememberMinimisedStateSoon();
          scheduleDevicePixelRatioCheck('resize');
      };

      const pollTimer = window.setInterval(() => {
          void rememberMinimisedState();
          checkDevicePixelRatio();
      }, 900);
      window.addEventListener('resize', handleWindowResize);
      window.addEventListener('focus', handleWindowFocus);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('pageshow', handlePageShow);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
          cancelled = true;
          if (activationTimer !== null) {
              window.clearTimeout(activationTimer);
          }
          if (resizeTimer !== null) {
              window.clearTimeout(resizeTimer);
          }
          window.clearInterval(pollTimer);
          window.removeEventListener('resize', handleWindowResize);
          window.removeEventListener('focus', handleWindowFocus);
          window.removeEventListener('blur', handleWindowBlur);
          window.removeEventListener('pageshow', handlePageShow);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
  }, []);

  const {
      bgContent, bgMain,
      floatingLogButtonBgColor, floatingLogButtonBorderColor, floatingLogButtonShadow, floatingLogButtonTextColor,
      isSidebarCompact, isSidebarNarrow, isSidebarUltraCompact,
      overlayTheme, renderUtilityModalTitle,
      sidebarCreateConnectionActionStyle, sidebarHorizontalPadding, sidebarQueryActionStyle,
      toolCenterContentPanelStyle, toolCenterDetailBodyStyle, toolCenterDetailPanelStyle,
      toolCenterModalContentStyle, toolCenterModalSplitStyle, toolCenterModalWorkspaceStyle,
      toolCenterNavPanelStyle, toolCenterNavScrollStyle, toolCenterRowDescriptionStyle, toolCenterRowStyle,
      toolCenterScrollableListStyle, utilityActionCardStyle, utilityActionHintStyle, utilityButtonStyle,
      utilityModalShellStyle, utilityMutedTextStyle, utilityPanelStyle,
  } = useAppUtilityStyles({
      blurFilter,
      darkMode,
      effectiveOpacity,
      effectiveUiScale,
      resolvedAppearance,
      sidebarWidth,
  });
  
  const addTab = useStore(state => state.addTab);
  const activeContext = useStore(state => state.activeContext);
  const connections = useStore(state => state.connections);
  const tabs = useStore(state => state.tabs);
  const activeTabId = useStore(state => state.activeTabId);
  const setActiveTab = useStore(state => state.setActiveTab);
  const savedQueries = useStore(state => state.savedQueries);
  const saveQuery = useStore(state => state.saveQuery);
  const applicationQuitConfirmRef = useRef<{ destroy: () => void } | null>(null);
  const applicationQuitHandlingRef = useRef(false);
  const openSecurityUpdateSettings = useCallback((focusTarget: SecurityUpdateSettingsFocusTarget | null = null) => {
      setIsSecurityUpdateIntroOpen(false);
      setSecurityUpdateSettingsFocusTarget(focusTarget);
      setSecurityUpdateSettingsFocusRequest((current) => current + 1);
      setIsSecurityUpdateSettingsOpen(true);
  }, []);
  const handleOpenSecurityUpdateSettings = useCallback((focusTarget: SecurityUpdateSettingsFocusTarget | null = null) => {
      openSecurityUpdateSettings(focusTarget);
  }, [openSecurityUpdateSettings]);
  const runSecurityUpdateRound = useCallback(async (mode: 'start' | 'retry' | 'restart') => {
      const backendApp = (window as any).go?.app?.App;
      const stageText = mode === 'start'
          ? t('app.security_update.stage.checking_saved_config')
          : (mode === 'retry'
              ? t('app.security_update.stage.verifying_result')
              : t('app.security_update.stage.updating_secure_storage'));
      const detailsWereOpen = isSecurityUpdateSettingsOpen;
      setSecurityUpdateProgressStage(stageText);
      setIsSecurityUpdateProgressOpen(true);
      setIsSecurityUpdateIntroOpen(false);
      setIsSecurityUpdateSettingsOpen(false);

      let nextStatus: SecurityUpdateStatus | null = null;
      let shouldOpenSettings = false;
      let refreshSettingsFocus = false;
      try {
          if (mode === 'start') {
              const result = await startSecurityUpdateFromBootstrap({
                  backend: backendApp,
                  replaceConnections,
                  replaceGlobalProxy,
                  t,
              });
              if (result.error) {
                  throw result.error;
              }
              nextStatus = normalizeSecurityUpdateStatus(result.status);
          } else if (mode === 'retry') {
              if (typeof backendApp?.RetrySecurityUpdateCurrentRound !== 'function') {
                  throw new Error(t('app.security_update.error.capability_unavailable'));
              }
              nextStatus = normalizeSecurityUpdateStatus(await backendApp.RetrySecurityUpdateCurrentRound({
                  migrationId: securityUpdateStatus.migrationId,
              }));
          } else {
              if (typeof backendApp?.RestartSecurityUpdate !== 'function') {
                  throw new Error(t('app.security_update.error.capability_unavailable'));
              }
              nextStatus = normalizeSecurityUpdateStatus(await backendApp.RestartSecurityUpdate({
                  migrationId: securityUpdateStatus.migrationId,
                  sourceType: 'current_app_saved_config',
                  rawPayload: securityUpdateRawPayload ?? '',
                  options: {
                      allowPartial: true,
                      writeBackup: true,
                  },
              }));
          }

          if (mode !== 'start') {
              nextStatus = await finalizeSecurityUpdateStatus({
                  backend: backendApp,
                  replaceConnections,
                  replaceGlobalProxy,
                  t,
              }, nextStatus);
          }

          shouldOpenSettings = nextStatus.overallStatus === 'needs_attention' || nextStatus.overallStatus === 'rolled_back';
          refreshSettingsFocus = shouldRefreshSecurityUpdateDetailsFocus({
              requestedOpen: shouldOpenSettings,
              wasOpen: detailsWereOpen,
          });
      } catch (err: any) {
          console.warn('Failed to execute security update round', err);
          setIsSecurityUpdateProgressOpen(false);
          if (detailsWereOpen) {
              setIsSecurityUpdateSettingsOpen(true);
          }
          void message.error(err?.message || t('app.security_update.message.not_finished_retry_later'));
          return;
      }

      if (!nextStatus) {
          setIsSecurityUpdateProgressOpen(false);
          return;
      }
      setIsSecurityUpdateProgressOpen(false);
      applySecurityUpdateStatus(nextStatus, {
          openSettings: shouldOpenSettings,
          refreshFocus: refreshSettingsFocus,
      });

      if (nextStatus.overallStatus === 'completed') {
          setSecurityUpdateHasLegacySensitiveItems(false);
          setSecurityUpdateRawPayload(null);
          setIsSecurityUpdateSettingsOpen(false);
          void message.success(t('app.security_update.message.completed'));
      } else if (nextStatus.overallStatus === 'needs_attention') {
          void message.warning(t('app.security_update.message.needs_attention'));
      } else if (nextStatus.overallStatus === 'rolled_back') {
          void message.warning(t('app.security_update.message.rolled_back'));
      }
  }, [
      applySecurityUpdateStatus,
      isSecurityUpdateSettingsOpen,
      normalizeSecurityUpdateStatus,
      replaceConnections,
      replaceGlobalProxy,
      securityUpdateRawPayload,
      securityUpdateStatus.migrationId,
      t,
  ]);
  const handleStartSecurityUpdate = useCallback(() => {
      void runSecurityUpdateRound('start');
  }, [runSecurityUpdateRound]);
  const handlePrepareExternalMCPUse = useCallback(async () => {
      const backendApp = (window as any).go?.app?.App;
      const result = await prepareSecureConfigForExternalMCP({
          backend: backendApp,
          replaceConnections,
          replaceGlobalProxy,
          t,
      });
      if (result.error) {
          throw result.error;
      }
      if (!result.status) {
          return;
      }

      const nextStatus = normalizeSecurityUpdateStatus(result.status);
      const shouldOpenSettings = nextStatus.overallStatus === 'needs_attention' || nextStatus.overallStatus === 'rolled_back';
      applySecurityUpdateStatus(nextStatus, {
          openSettings: shouldOpenSettings,
          refreshFocus: shouldOpenSettings,
      });

      if (nextStatus.overallStatus === 'completed') {
          setSecurityUpdateHasLegacySensitiveItems(false);
          setSecurityUpdateRawPayload(null);
          setIsSecurityUpdateSettingsOpen(false);
          return;
      }

      const hasConnectionIssue = nextStatus.issues.some((issue) =>
          issue.scope === 'connection' && issue.status !== 'updated',
      );
      if (nextStatus.overallStatus === 'rolled_back' || hasConnectionIssue) {
          throw new Error(t('app.security_update.message.needs_attention'));
      }
      if (nextStatus.overallStatus === 'needs_attention') {
          void message.warning(t('app.security_update.message.needs_attention'));
      }
  }, [
      applySecurityUpdateStatus,
      normalizeSecurityUpdateStatus,
      replaceConnections,
      replaceGlobalProxy,
      t,
  ]);
  const handleRetrySecurityUpdate = useCallback(() => {
      void runSecurityUpdateRound('retry');
  }, [runSecurityUpdateRound]);
  const handleRestartSecurityUpdate = useCallback(() => {
      void runSecurityUpdateRound('restart');
  }, [runSecurityUpdateRound]);
  const handlePostponeSecurityUpdate = useCallback(async () => {
      const backendApp = (window as any).go?.app?.App;
      setIsSecurityUpdateIntroOpen(false);
      try {
          if (typeof backendApp?.DismissSecurityUpdateReminder === 'function') {
              const nextStatus = mergeSecurityUpdateStatusWithLegacySource(
                  await backendApp.DismissSecurityUpdateReminder(),
                  securityUpdateRawPayload,
                  { t },
              );
              applySecurityUpdateStatus(nextStatus);
              return;
          }
          applySecurityUpdateStatus({
              overallStatus: 'postponed',
              canStart: true,
              canPostpone: true,
              summary: securityUpdateStatus.summary,
              issues: securityUpdateStatus.issues,
          });
      } catch (err: any) {
          console.warn('Failed to dismiss security update reminder', err);
          void message.error(err?.message || t('app.security_update.message.postpone_failed'));
      }
  }, [
      applySecurityUpdateStatus,
      securityUpdateRawPayload,
      securityUpdateStatus.issues,
      securityUpdateStatus.summary,
      t,
  ]);
  const handleSecurityUpdateIssueAction = useCallback((issue: SecurityUpdateIssue) => {
      const repairEntry = resolveSecurityUpdateRepairEntry(issue, connections, securityUpdateStatus, t);
      if (repairEntry.type === 'warning') {
          void message.warning(repairEntry.message);
          return;
      }
      if (repairEntry.type === 'connection') {
          setIsSecurityUpdateSettingsOpen(false);
          setSecurityUpdateRepairSource(repairEntry.repairSource);
          setEditingConnection(repairEntry.connection);
          setIsModalOpen(true);
          return;
      }
      if (repairEntry.type === 'proxy') {
          setIsSecurityUpdateSettingsOpen(false);
          setSecurityUpdateRepairSource(repairEntry.repairSource);
          setIsProxyModalOpen(true);
          return;
      }
      if (repairEntry.type === 'ai') {
          setIsSecurityUpdateSettingsOpen(false);
          setSecurityUpdateRepairSource(repairEntry.repairSource);
          setFocusedAIProviderId(repairEntry.providerId);
          setIsAISettingsOpen(true);
          return;
      }
      if (repairEntry.type === 'retry') {
          void runSecurityUpdateRound('retry');
          return;
      }
      setSecurityUpdateRepairSource(null);
      openSecurityUpdateSettings(repairEntry.focusTarget);
  }, [connections, openSecurityUpdateSettings, runSecurityUpdateRound, securityUpdateStatus, t]);
  const isMacRuntime = runtimePlatform === 'darwin'
      || (runtimePlatform === '' && /mac/i.test(detectNavigatorPlatform()));
  const isWindowsRuntime = runtimePlatform === 'windows'
      || (runtimePlatform === '' && isWindowsPlatform());
  const useNativeMacWindowControls = isMacRuntime && appearance.useNativeMacWindowControls === true;
  const activeShortcutPlatform = getShortcutPlatform(isMacRuntime);
  const macWindowDiagnosticsEnabled = shouldEnableMacWindowDiagnostics(
      isMacRuntime,
      import.meta.env.DEV,
      import.meta.env.VITE_GONAVI_ENABLE_MAC_WINDOW_DIAGNOSTICS,
  );
  useEffect(() => {
      return installGlobalImeCompositionTracking(window, document);
  }, []);
  const {
      aboutDisplayVersion,
      aboutInfo,
      aboutLoading,
      aboutUpdateStatus,
      canShowProgressEntry,
      checkForUpdates,
      downloadUpdate,
      formatBytes,
      handleInstallFromProgress,
      hideUpdateDownloadProgress,
      isAboutOpen,
      isBackgroundProgressForLatestUpdate,
      isLatestUpdateDownloaded,
      lastUpdateInfo,
      markUpdateProgressDismissed,
      muteLatestUpdate,
      setIsAboutOpen,
      showUpdateDownloadProgress,
      updateDownloadProgress,
  } = useAppUpdateManager({
      isMacRuntime,
      runtimeBuildType,
      t,
  });

  const emitWindowDiagnostic = useCallback(async (stage: string, extra: Record<string, unknown> = {}) => {
      if (!macWindowDiagnosticsEnabled) {
          return;
      }
      const backendApp = (window as any).go?.app?.App;
      if (typeof backendApp?.LogWindowDiagnostic !== 'function') {
          return;
      }
      try {
          const [isFullscreen, isMaximised, isMinimised, isNormal, size, position] = await Promise.all([
              safeWindowRuntimeCall(() => WindowIsFullscreen(), false),
              safeWindowRuntimeCall(() => WindowIsMaximised(), false),
              safeWindowRuntimeCall(() => WindowIsMinimised(), false),
              safeWindowRuntimeCall(() => WindowIsNormal(), false),
              safeWindowRuntimeCall(() => WindowGetSize(), null),
              safeWindowRuntimeCall(() => WindowGetPosition(), null),
          ]);
          const payload = {
              seq: ++windowDiagSequenceRef.current,
              ts: new Date().toISOString(),
              stage,
              nativeControls: useNativeMacWindowControls,
              documentVisible: document.visibilityState,
              documentHasFocus: document.hasFocus(),
              devicePixelRatio: Number(window.devicePixelRatio) || 1,
              windowState: {
                  isFullscreen,
                  isMaximised,
                  isMinimised,
                  isNormal,
              },
              size: size ? { w: Math.trunc(Number(size.w || 0)), h: Math.trunc(Number(size.h || 0)) } : null,
              position: position ? { x: Math.trunc(Number(position.x || 0)), y: Math.trunc(Number(position.y || 0)) } : null,
              extra,
          };
          const signature = JSON.stringify({
              stage,
              nativeControls: payload.nativeControls,
              visible: payload.documentVisible,
              focus: payload.documentHasFocus,
              state: payload.windowState,
              size: payload.size,
              position: payload.position,
              extra,
          });
          const now = Date.now();
          if (signature === windowDiagLastSignatureRef.current && now-windowDiagLastAtRef.current < 250) {
              return;
          }
          windowDiagLastSignatureRef.current = signature;
          windowDiagLastAtRef.current = now;
          await backendApp.LogWindowDiagnostic(stage, JSON.stringify(payload));
      } catch (error) {
          console.warn('Failed to emit window diagnostic', error);
      }
  }, [macWindowDiagnosticsEnabled, useNativeMacWindowControls]);

  useEffect(() => {
      if (!isStoreHydrated || !isMacRuntime) {
          return;
      }
      const backendApp = (window as any).go?.app?.App;
      if (typeof backendApp?.SetMacNativeWindowControls !== 'function') {
          return;
      }
      void safeWindowRuntimeCall(() => SetMacNativeWindowControls(useNativeMacWindowControls), undefined);
  }, [isMacRuntime, isStoreHydrated, useNativeMacWindowControls]);

  useEffect(() => {
      if (!macWindowDiagnosticsEnabled) {
          return;
      }

      let cancelled = false;
      let pollTimer: number | null = null;
      let burstTimer: number | null = null;

      const stopBurst = () => {
          if (pollTimer !== null) {
              window.clearInterval(pollTimer);
              pollTimer = null;
          }
          if (burstTimer !== null) {
              window.clearTimeout(burstTimer);
              burstTimer = null;
          }
      };

      const startBurst = (reason: string, extra: Record<string, unknown> = {}) => {
          if (cancelled) {
              return;
          }
          void emitWindowDiagnostic(`burst:start:${reason}`, extra);
          if (pollTimer === null) {
              pollTimer = window.setInterval(() => {
                  void emitWindowDiagnostic(`burst:tick:${reason}`);
              }, 250);
          }
          if (burstTimer !== null) {
              window.clearTimeout(burstTimer);
          }
          burstTimer = window.setTimeout(() => {
              stopBurst();
              void emitWindowDiagnostic(`burst:stop:${reason}`);
          }, 6000);
      };

      const handleFocus = () => {
          void emitWindowDiagnostic('event:focus');
      };
      const handleBlur = () => {
          void emitWindowDiagnostic('event:blur');
      };
      const handleResize = () => {
          void emitWindowDiagnostic('event:resize');
      };
      const handleVisibilityChange = () => {
          void emitWindowDiagnostic('event:visibilitychange', { visibility: document.visibilityState });
      };
      const handleEditableKeydown = (event: KeyboardEvent) => {
          if (!isEditableElement(event.target)) {
              return;
          }
          const key = String(event.key || '');
          const maybeFullscreenKey = key === 'Escape' || key.toLowerCase() === 'f' || key === 'Process';
          const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
          startBurst('editable-keydown', {
              key,
              code: String(event.code || ''),
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              maybeFullscreenKey,
              hasModifier,
          });
      };
      const handleCompositionStart = () => {
          startBurst('compositionstart');
      };
      const handleCompositionEnd = () => {
          startBurst('compositionend');
      };

      void emitWindowDiagnostic('session:start');
      window.addEventListener('focus', handleFocus);
      window.addEventListener('blur', handleBlur);
      window.addEventListener('resize', handleResize);
      window.addEventListener('keydown', handleEditableKeydown, true);
      window.addEventListener('compositionstart', handleCompositionStart, true);
      window.addEventListener('compositionend', handleCompositionEnd, true);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
          cancelled = true;
          stopBurst();
          window.removeEventListener('focus', handleFocus);
          window.removeEventListener('blur', handleBlur);
          window.removeEventListener('resize', handleResize);
          window.removeEventListener('keydown', handleEditableKeydown, true);
          window.removeEventListener('compositionstart', handleCompositionStart, true);
          window.removeEventListener('compositionend', handleCompositionEnd, true);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
  }, [emitWindowDiagnostic, macWindowDiagnosticsEnabled]);

  const handleNewQuery = useCallback(() => {
      let connId = '';
      let db = '';

      // Priority: Active Tab Context (if connection still valid) > Sidebar Selection (activeContext)
      if (activeTabId) {
          const currentTab = tabs.find(t => t.id === activeTabId);
          if (currentTab && currentTab.connectionId && connections.some(c => c.id === currentTab.connectionId)) {
              connId = currentTab.connectionId;
              db = currentTab.dbName || '';
          }
      }

      // Fallback: Sidebar selection context (only if connection still valid)
      if (!connId && activeContext?.connectionId && connections.some(c => c.id === activeContext.connectionId)) {
          connId = activeContext.connectionId;
          db = activeContext.dbName || '';
      }

      addTab({
          id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: t('query.new'),
          type: 'query',
          connectionId: connId,
          dbName: db,
          query: ''
      });
  }, [activeTabId, tabs, connections, activeContext, addTab, t]);

  const switchActiveTabByOffset = useCallback((offset: 1 | -1) => {
      if (tabs.length < 2) return;
      const activeIndex = tabs.findIndex(tab => tab.id === activeTabId);
      const baseIndex = activeIndex >= 0 ? activeIndex : 0;
      const nextIndex = (baseIndex + offset + tabs.length) % tabs.length;
      setActiveTab(tabs[nextIndex].id);
  }, [activeTabId, setActiveTab, tabs]);

  const resetApplicationQuitRequest = useCallback(() => {
      applicationQuitHandlingRef.current = false;
      applicationQuitConfirmRef.current = null;
      void CancelApplicationQuit();
  }, []);

  const forceQuitApplication = useCallback(async () => {
      const res = await ForceQuitApplication();
      if (res && res.success === false) {
          throw new Error(res.message || t('common.unknown'));
      }
  }, [t]);

  const handleApplicationQuitRequest = useCallback(async () => {
      if (applicationQuitHandlingRef.current) {
          return;
      }
      applicationQuitHandlingRef.current = true;

      let targets;
      try {
          targets = await collectApplicationQuitUnsavedSQLTargets(tabs, savedQueries);
      } catch (error) {
          resetApplicationQuitRequest();
          message.error(t('app.quit.unsaved_sql.inspect_failed', {
              detail: error instanceof Error ? error.message : String(error),
          }));
          return;
      }

      if (targets.length === 0) {
          try {
              await forceQuitApplication();
          } catch (error) {
              resetApplicationQuitRequest();
              message.error(t('app.quit.message.quit_failed', {
                  detail: error instanceof Error ? error.message : String(error),
              }));
          }
          return;
      }

      const label = buildApplicationQuitUnsavedSQLLabel(targets);
      let destroyConfirm: (() => void) | null = null;
      const confirmRef = Modal.confirm({
          title: t('app.quit.unsaved_sql.title'),
          content: t(targets.length === 1
              ? 'app.quit.unsaved_sql.content_single'
              : 'app.quit.unsaved_sql.content_multiple', { label }),
          okText: t('app.quit.unsaved_sql.save_exit'),
          cancelText: t('app.quit.unsaved_sql.cancel'),
          closable: true,
          maskClosable: false,
          okButtonProps: { danger: true, type: 'primary' },
          footer: (_, { OkBtn, CancelBtn }) => (
              <>
                  <Button
                    onClick={() => {
                        destroyConfirm?.();
                        applicationQuitConfirmRef.current = null;
                        void forceQuitApplication().catch((error) => {
                            resetApplicationQuitRequest();
                            message.error(t('app.quit.message.quit_failed', {
                                detail: error instanceof Error ? error.message : String(error),
                            }));
                        });
                    }}
                  >
                      {t('app.quit.unsaved_sql.confirm_exit')}
                  </Button>
                  <CancelBtn />
                  <OkBtn />
              </>
          ),
          onCancel: () => {
              resetApplicationQuitRequest();
          },
          onOk: async () => {
              try {
                  await saveApplicationQuitUnsavedSQLTargets(targets, saveQuery);
                  message.success(t('app.quit.unsaved_sql.saved'));
                  await forceQuitApplication();
              } catch (error) {
                  resetApplicationQuitRequest();
                  message.error(t('app.quit.unsaved_sql.save_failed_cancel_exit', {
                      detail: error instanceof Error ? error.message : String(error),
                  }));
                  throw error;
              }
          },
      });
      destroyConfirm = confirmRef.destroy;
      applicationQuitConfirmRef.current = confirmRef;
  }, [forceQuitApplication, resetApplicationQuitRequest, saveQuery, savedQueries, t, tabs]);

  useEffect(() => {
      const offBeforeClose = EventsOn('app:before-close-request', () => {
          void handleApplicationQuitRequest();
      });
      return () => {
          offBeforeClose();
      };
  }, [handleApplicationQuitRequest]);

  const closeConnectionPackageDialog = useCallback(() => {
      setConnectionPackageDialog(createClosedConnectionPackageDialogState());
      setPendingConnectionImportPayload(null);
      setToolCenterBackGroupKey(null);
      setActiveToolCenterPane((current) => (current?.key === 'connection-package' ? null : current));
  }, []);

  const refreshConnectionsAfterImport = useCallback(async (importedViews: SavedConnection[]) => {
      const backendApp = (window as any).go?.app?.App;
      if (typeof backendApp?.GetSavedConnections === 'function') {
          let latestConnections: unknown;
          try {
              latestConnections = await GetSavedConnections();
          } catch (error) {
              const detail = error instanceof Error ? error.message : String(error ?? '').trim();
              throw new Error(
                  detail
                      ? t('app.connection_package.message.import_failed_with_error', { error: detail })
                      : t('app.connection_package.message.import_failed'),
              );
          }
          if (!Array.isArray(latestConnections)) {
              throw new Error(t('app.connection_package.error.refresh_failed_no_connections'));
          }
          replaceConnections(latestConnections as SavedConnection[]);
          return;
      }

      const latestConnections = useStore.getState().connections;
      replaceConnections(mergeSavedConnections(latestConnections, importedViews));
  }, [replaceConnections]);

  const importConnectionsPayload = useCallback(async (raw: string, password: string) => {
      const backendApp = (window as any).go?.app?.App;
      if (typeof backendApp?.ImportConnectionsPayload !== 'function') {
          throw new Error(t('app.connection_package.error.import_capability_unavailable'));
      }

      let importedViews: unknown;
      try {
          importedViews = await backendApp.ImportConnectionsPayload(raw, password);
      } catch (error) {
          if (isConnectionPackagePasswordRequiredError(error)) {
              throw error;
          }
          const detail = error instanceof Error ? error.message : String(error ?? '').trim();
          throw new Error(
              detail
                  ? t('app.connection_package.message.import_failed_with_error', { error: detail })
                  : t('app.connection_package.message.import_failed'),
          );
      }
      if (!Array.isArray(importedViews)) {
          throw new Error(t('app.connection_package.error.import_no_connections'));
      }
      await refreshConnectionsAfterImport(importedViews as SavedConnection[]);
      return importedViews as SavedConnection[];
  }, [refreshConnectionsAfterImport, t]);

  const handleImportConnections = async (sourceGroup?: ToolCenterGroupKey) => {
      setToolCenterBackGroupKey(sourceGroup ?? null);
      const res = await (window as any).go.app.App.ImportConfigFile();
      if (!res.success) {
          if (res.message !== "已取消") {
              void message.error(t('app.connection_package.message.import_failed_with_error', { error: res.message }));
          }
          return;
      }

      const raw = typeof res.data === 'string' ? res.data : String(res.data ?? '');
      const importKind = detectConnectionImportKind(raw);

      if (importKind === 'invalid') {
          void message.error(t('app.connection_package.message.unsupported_file_format'));
          return;
      }

      try {
          setPendingConnectionImportPayload(null);
          const importedViews = await importConnectionsPayload(raw, '');
          if ((importKind === 'mysql-workbench-xml' || importKind === 'navicat-ncx') && importedViews.some(v => !v.hasPrimaryPassword)) {
              void message.warning(t('app.connection_package.message.imported_with_missing_passwords', { count: importedViews.length }));
          } else {
              void message.success(t('app.connection_package.message.imported_connections', { count: importedViews.length }));
          }
      } catch (e: any) {
          if (isConnectionPackagePasswordRequiredError(e)) {
              if (sourceGroup) {
                  setToolCenterBackGroupKey(sourceGroup);
                  setActiveToolCenterPane({ key: 'connection-package', group: sourceGroup });
              }
              setPendingConnectionImportPayload(raw);
              setConnectionPackageDialog({
                  open: true,
                  mode: 'import',
                  includeSecrets: true,
                  useFilePassword: false,
                  password: '',
                  error: '',
                  confirmLoading: false,
              });
              return;
          }
          void message.error(e?.message || t('app.connection_package.message.import_failed'));
      }
  };

  const handleExportConnections = async (sourceGroup?: ToolCenterGroupKey) => {
      if (connections.length === 0) {
          void message.warning(t('app.connection_package.message.no_connections_to_export'));
          return;
      }

      setToolCenterBackGroupKey(sourceGroup ?? null);
      if (sourceGroup) {
          setActiveToolCenterPane({ key: 'connection-package', group: sourceGroup });
      }
      setConnectionPackageDialog({
          open: true,
          mode: 'export',
          includeSecrets: true,
          useFilePassword: false,
          password: '',
          error: '',
          confirmLoading: false,
      });
  };

  const handleConfirmConnectionPackageDialog = async () => {
      const backendApp = (window as any).go?.app?.App;
      const password = normalizeConnectionPackagePassword(connectionPackageDialog.password);

      if (connectionPackageDialog.mode === 'import' && !password) {
          setConnectionPackageDialog((current) => ({
              ...current,
              error: t('app.connection_package.error.restore_password_required'),
          }));
          return;
      }

      if (
          connectionPackageDialog.mode === 'export'
          && connectionPackageDialog.includeSecrets
          && connectionPackageDialog.useFilePassword
          && !password
      ) {
          setConnectionPackageDialog((current) => ({
              ...current,
              error: t('app.connection_package.error.file_password_required'),
          }));
          return;
      }

      setConnectionPackageDialog((current) => ({
          ...current,
          password: (
              current.mode === 'export'
              && (!current.includeSecrets || !current.useFilePassword)
          ) ? '' : password,
          error: '',
          confirmLoading: true,
      }));

      try {
          if (connectionPackageDialog.mode === 'export') {
              if (typeof backendApp?.ExportConnectionsPackage !== 'function') {
                  throw new Error(t('app.connection_package.error.export_capability_unavailable'));
              }

              let res: unknown;
              try {
                  res = await backendApp.ExportConnectionsPackage({
                      includeSecrets: connectionPackageDialog.includeSecrets,
                      filePassword: (
                          connectionPackageDialog.includeSecrets
                          && connectionPackageDialog.useFilePassword
                      ) ? password : '',
                  });
              } catch (error) {
                  const detail = error instanceof Error ? error.message : String(error ?? '').trim();
                  throw new Error(
                      detail
                          ? `${t('app.connection_package.message.export_failed')}: ${detail}`
                          : t('app.connection_package.message.export_failed'),
                  );
              }
              const exportResult = resolveConnectionPackageExportResult(connectionPackageDialog, res);
              if (exportResult.kind === 'canceled') {
                  setConnectionPackageDialog(exportResult.nextDialog);
                  return;
              }
              if (exportResult.kind === 'failed') {
                  throw new Error(exportResult.error);
              }

              closeConnectionPackageDialog();
              void message.success(t('app.connection_package.message.export_succeeded'));
              return;
          }

          if (!pendingConnectionImportPayload) {
              throw new Error(t('app.connection_package.error.missing_import_payload'));
          }

          const importedViews = await importConnectionsPayload(pendingConnectionImportPayload, password);
          closeConnectionPackageDialog();
          void message.success(t('app.connection_package.message.imported_connections', { count: importedViews.length }));
      } catch (e: any) {
          setConnectionPackageDialog((current) => ({
              ...current,
              confirmLoading: false,
              error: e?.message || t(
                  current.mode === 'export'
                      ? 'app.connection_package.message.export_failed'
                      : 'app.connection_package.message.import_failed',
              ),
          }));
      }
  };

  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [activeToolCenterGroupKey, setActiveToolCenterGroupKey] = useState<ToolCenterGroupKey>('config');
  const [toolCenterBackGroupKey, setToolCenterBackGroupKey] = useState<ToolCenterGroupKey | null>(null);
  const [activeToolCenterPane, setActiveToolCenterPane] = useState<ToolCenterPaneState | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [themeModalSection, setThemeModalSection] = useState<'theme' | 'appearance'>('theme');
  const [isLinuxCJKFontBannerDismissed, setIsLinuxCJKFontBannerDismissed] = useState(false);
  const [isAppearanceModalOpen, setIsAppearanceModalOpen] = useState(false);
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [isSnippetModalOpen, setIsSnippetModalOpen] = useState(false);
  const [capturingShortcutAction, setCapturingShortcutAction] = useState<ShortcutAction | null>(null);
  const tabDisplaySettingsPanelRef = useRef<HTMLDivElement | null>(null);
  const [tabDisplaySettingsFocusRequest, setTabDisplaySettingsFocusRequest] = useState(0);
  useEffect(() => {
      const shouldLoadInstalledFonts =
          runtimePlatform === 'linux' || (isThemeModalOpen && themeModalSection === 'appearance');
      if (!shouldLoadInstalledFonts) {
          return;
      }
      if (hasLoadedInstalledFontsRef.current || isFontFamiliesLoading) {
          return;
      }

      let cancelled = false;
      hasLoadedInstalledFontsRef.current = true;
      setIsFontFamiliesLoading(true);
      setFontFamiliesLoadError(null);

      ListInstalledFontFamilies()
          .then((result) => {
              if (cancelled) {
                  return;
              }
              if (!result?.success) {
                  throw new Error(String(result?.message || t('app.theme.font_family.load_failed')));
              }
              const nextFonts = Array.isArray(result?.data)
                  ? result.data
                      .map((item) => ({
                          family: sanitizeFontFamilyInput((item as InstalledFontFamily | Record<string, unknown>)?.family) || '',
                          path: typeof (item as InstalledFontFamily | Record<string, unknown>)?.path === 'string'
                              ? String((item as InstalledFontFamily | Record<string, unknown>).path)
                              : undefined,
                      }))
                      .filter((item) => item.family)
                  : EMPTY_INSTALLED_FONT_FAMILIES;
              setInstalledFontFamilies(nextFonts);
          })
          .catch((error) => {
              if (cancelled) {
                  return;
              }
              hasLoadedInstalledFontsRef.current = false;
              setFontFamiliesLoadError(String(error instanceof Error ? error.message : error || t('app.theme.font_family.load_failed')));
          })
          .finally(() => {
              if (!cancelled) {
                  setIsFontFamiliesLoading(false);
              }
          });

      return () => {
          cancelled = true;
      };
  }, [isThemeModalOpen, runtimePlatform, t, themeModalSection]);

  useEffect(() => {
      if (!isThemeModalOpen || themeModalSection !== 'appearance' || tabDisplaySettingsFocusRequest === 0) {
          return;
      }
      const timer = window.setTimeout(() => {
          tabDisplaySettingsPanelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 80);
      return () => window.clearTimeout(timer);
  }, [isThemeModalOpen, themeModalSection, tabDisplaySettingsFocusRequest]);

  const shortcutConflictMap = useMemo(() => {
      const map: Partial<Record<ShortcutAction, ConflictInfo[]>> = {};
      for (const action of SHORTCUT_ACTION_ORDER) {
          const binding = resolveShortcutBinding(shortcutOptions, action, activeShortcutPlatform);
          if (!binding?.enabled || !binding.combo) continue;
          const conflicts = findReservedConflictsForAction(
              action,
              normalizeShortcutCombo(binding.combo),
              activeShortcutPlatform,
          );
          if (conflicts.length > 0) {
              map[action] = conflicts;
          }
      }
      return map;
  }, [activeShortcutPlatform, language, shortcutOptions]);
  const [isProxyModalOpen, setIsProxyModalOpen] = useState(false);
  const [isDataRootModalOpen, setIsDataRootModalOpen] = useState(false);
  const [dataRootInfo, setDataRootInfo] = useState<any>(null);
  const [selectedDataRootPath, setSelectedDataRootPath] = useState('');
  const [dataRootLoading, setDataRootLoading] = useState(false);
  const [dataRootApplying, setDataRootApplying] = useState(false);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);
  const aiEntryPlacement = resolveAIEntryPlacement();
  const legacyAiEdgeHandleAttachment = resolveLegacyAIEdgeHandleAttachment(aiPanelVisible);
  const aiPanelOverlayActive = aiPanelVisible && shouldOverlayAIPanel({
      isV2Ui,
      viewportWidth,
      sidebarWidth,
      panelWidth: DEFAULT_AI_PANEL_WIDTH,
  });
  const aiPanelRenderWidth = aiPanelOverlayActive
      ? resolveOverlayAIPanelWidth({
          viewportWidth,
          sidebarWidth,
          panelWidth: DEFAULT_AI_PANEL_WIDTH,
      })
      : DEFAULT_AI_PANEL_WIDTH;
  const legacyAiEdgeHandleDockStyle = useMemo(
      () => resolveLegacyAIEdgeHandleDockStyle(legacyAiEdgeHandleAttachment),
      [legacyAiEdgeHandleAttachment],
  );
  const legacyAiEdgeHandleStyle = useMemo(() => (
      resolveLegacyAIEdgeHandleStyle({
          darkMode,
          aiPanelVisible,
          effectiveUiScale,
      })
  ), [aiPanelVisible, darkMode, effectiveUiScale]);
  const handleOpenToolsModal = useCallback((group: ToolCenterGroupKey = 'config') => {
      setToolCenterBackGroupKey(null);
      setActiveToolCenterPane(null);
      setActiveToolCenterGroupKey(group);
      setIsToolsModalOpen(true);
  }, []);
  const handleOpenSettingsModal = useCallback(() => {
      setIsSettingsModalOpen(true);
  }, []);
  const handleOpenToolCenterPane = useCallback((group: ToolCenterGroupKey, key: ToolCenterPaneKey) => {
      setToolCenterBackGroupKey(group);
      setActiveToolCenterGroupKey(group);
      setActiveToolCenterPane({ key, group });
      setIsToolsModalOpen(true);
  }, []);
  const handleReturnToToolCenter = useCallback((closeChild?: () => void) => {
      const returnGroup = toolCenterBackGroupKey ?? 'config';
      closeChild?.();
      setToolCenterBackGroupKey(null);
      setActiveToolCenterGroupKey(returnGroup);
      setActiveToolCenterPane(null);
      setIsToolsModalOpen(true);
  }, [toolCenterBackGroupKey]);
  const sidebarUtilityItems = useMemo(() => {
      const itemMap = {
          tools: {
              key: 'tools',
              title: t('app.sidebar.tools'),
              icon: <ToolOutlined />,
              onClick: () => handleOpenToolsModal(),
          },
          settings: {
              key: 'settings',
              title: t('app.sidebar.settings'),
              icon: <SettingOutlined />,
              onClick: () => handleOpenSettingsModal(),
          },
      } as const;

      return SIDEBAR_UTILITY_ITEM_KEYS.map((key) => itemMap[key]);
  }, [handleOpenSettingsModal, handleOpenToolsModal, t]);
  const handleFocusSidebarSearch = useCallback(() => {
      window.dispatchEvent(new CustomEvent('gonavi:focus-sidebar-search'));
  }, []);
  const renderLegacyAIEdgeHandle = () => (
      <Tooltip title={t('app.sidebar.ai_assistant')}>
          <Button
              type="text"
              icon={<RobotOutlined />}
              onClick={toggleAIPanel}
              style={legacyAiEdgeHandleStyle}
              data-gonavi-legacy-ai-edge-action="true"
          >
              AI
          </Button>
      </Tooltip>
  );

  const loadDataRootInfo = useCallback(async () => {
      setDataRootLoading(true);
      try {
          const res = await GetDataRootDirectoryInfo();
          if (!res?.success) {
              throw new Error(res?.message || t('app.data_root.message.load_failed'));
          }
          const data = (res?.data || {}) as any;
          setDataRootInfo(data);
          setSelectedDataRootPath(String(data.path || ''));
      } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error || t('common.unknown'));
          void message.error(t('app.data_root.message.load_failed_with_error', { error: errMsg }));
      } finally {
          setDataRootLoading(false);
      }
  }, [t]);

  useEffect(() => {
      if (!isDataRootModalOpen && activeToolCenterPane?.key !== 'data-root') {
          return;
      }
      void loadDataRootInfo();
  }, [activeToolCenterPane?.key, isDataRootModalOpen, loadDataRootInfo]);

  const handleSelectDataRoot = useCallback(async () => {
      try {
          const res = await SelectDataRootDirectory(selectedDataRootPath || dataRootInfo?.path || '');
          if (!res?.success) {
              if (String(res?.message || '') !== '已取消') {
                  throw new Error(res?.message || t('app.data_root.message.select_failed'));
              }
              return;
          }
          const data = (res?.data || {}) as any;
          setSelectedDataRootPath(String(data.path || ''));
      } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error || t('common.unknown'));
          void message.error(t('app.data_root.message.select_failed_with_error', { error: errMsg }));
      }
  }, [dataRootInfo?.path, selectedDataRootPath, t]);

  const handleApplyDataRoot = useCallback(async (migrate: boolean, useDefaultPath = false) => {
      const nextPath = useDefaultPath ? String(dataRootInfo?.defaultPath || '') : String(selectedDataRootPath || '').trim();
      if (!nextPath) {
          void message.warning(t('app.data_root.message.select_valid_first'));
          return;
      }
      setDataRootApplying(true);
      try {
          const res = await ApplyDataRootDirectory(nextPath, migrate);
          if (!res?.success) {
              throw new Error(res?.message || t('app.data_root.message.apply_failed'));
          }
          const data = (res?.data || {}) as any;
          setDataRootInfo(data);
          setSelectedDataRootPath(String(data.path || nextPath));
          void message.success(res?.message || t('app.data_root.message.updated'));
      } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error || t('common.unknown'));
          void message.error(t('app.data_root.message.apply_failed_with_error', { error: errMsg }));
      } finally {
          setDataRootApplying(false);
      }
  }, [dataRootInfo?.defaultPath, selectedDataRootPath, t]);

  const handleOpenDataRoot = useCallback(async () => {
      try {
          const res = await OpenDataRootDirectory();
          if (!res?.success) {
              throw new Error(res?.message || t('app.data_root.message.open_failed'));
          }
      } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error || t('common.unknown'));
          void message.error(t('app.data_root.message.open_failed_with_error', { error: errMsg }));
      }
  }, [t]);


  const {
      handleCloseLogPanel: handleCloseAppLogPanel,
      handleLogResizeStart,
      handleToggleLogPanel: toggleAppLogPanel,
      isLogPanelOpen,
      logGhostRef,
      logPanelHeight,
  } = useAppLogPanelResize();
  const handleToggleLogPanel = useCallback(() => {
      if (isV2Ui) {
          window.dispatchEvent(new CustomEvent('gonavi:show-sql-execution-log', { detail: { mode: 'open' } }));
          return;
      }
      toggleAppLogPanel();
  }, [isV2Ui, toggleAppLogPanel]);
  const handleCloseLogPanel = useCallback(() => {
      handleCloseAppLogPanel();
  }, [handleCloseAppLogPanel]);
  
  const handleCreateConnection = useCallback(() => {
      setSecurityUpdateRepairSource(null);
      setEditingConnection(null);
      setIsConnectionModalMounted(true);
      setIsModalOpen(true);
  }, []);

  const handleEditConnection = useCallback((conn: SavedConnection) => {
      setSecurityUpdateRepairSource(null);
      setIsConnectionModalMounted(true);
      void (async () => {
          const backendApp = (window as any).go?.app?.App;
          let nextConnection = conn;
          if (typeof backendApp?.GetEditableSavedConnection === 'function') {
              try {
                  const editableConnection = await backendApp.GetEditableSavedConnection(conn.id);
                  if (editableConnection) {
                      nextConnection = editableConnection;
                  }
              } catch (error: any) {
                  const errorMessage = error?.message;
                  const detail = (
                      typeof errorMessage === 'string'
                          ? errorMessage
                          : (
                              typeof errorMessage === 'number'
                              || typeof errorMessage === 'boolean'
                                  ? String(errorMessage)
                                  : String(error ?? '')
                          )
                  ).trim();
                  void message.warning(
                      detail
                          ? t('app.connection.message.editable_load_failed_with_detail', { detail })
                          : t('app.connection.message.editable_load_failed')
                  );
              }
          }
          setEditingConnection(nextConnection);
          setIsModalOpen(true);
      })();
  }, [t]);

  useEffect(() => {
      if (connectionModalWarmupDoneRef.current) {
          return;
      }
      connectionModalWarmupDoneRef.current = true;
      const warmup = () => setIsConnectionModalMounted(true);
      if (typeof window === 'undefined') {
          warmup();
          return;
      }
      if (typeof window.requestIdleCallback === 'function') {
          const idleId = window.requestIdleCallback(() => warmup(), { timeout: 1200 });
          return () => window.cancelIdleCallback?.(idleId);
      }
      const timerId = window.setTimeout(warmup, 300);
      return () => window.clearTimeout(timerId);
  }, []);

  const handleConnectionSaved = useCallback(async (savedConnection: SavedConnection) => {
      if (!shouldRetrySecurityUpdateAfterRepairSave(securityUpdateRepairSource)) {
          return;
      }

      const backendApp = (window as any).go?.app?.App;
      if (securityUpdateStatus.migrationId) {
          if (typeof backendApp?.RetrySecurityUpdateCurrentRound !== 'function') {
              return;
          }

          const rawStatus = await backendApp.RetrySecurityUpdateCurrentRound({
              migrationId: securityUpdateStatus.migrationId,
          });
          const nextStatus = await finalizeSecurityUpdateStatus({
              backend: backendApp,
              replaceConnections,
              replaceGlobalProxy,
              t,
          }, normalizeSecurityUpdateStatus(rawStatus));

          applySecurityUpdateStatus(nextStatus, {
              openSettings: false,
          });

          if (nextStatus.overallStatus === 'completed') {
              setSecurityUpdateHasLegacySensitiveItems(false);
              setSecurityUpdateRawPayload(null);
          }
          return;
      }

      if (!securityUpdateRawPayload || !savedConnection?.id) {
          return;
      }

      const nextRawPayload = stripLegacyPersistedConnectionById(securityUpdateRawPayload, savedConnection.id);
      if (!nextRawPayload || nextRawPayload === securityUpdateRawPayload) {
          return;
      }

      window.localStorage.setItem(LEGACY_PERSIST_KEY, nextRawPayload);

      const rawStatus = typeof backendApp?.GetSecurityUpdateStatus === 'function'
          ? await backendApp.GetSecurityUpdateStatus()
          : securityUpdateStatus;
      const nextStatus = mergeSecurityUpdateStatusWithLegacySource(rawStatus, nextRawPayload, {
          previousStatus: securityUpdateStatus,
          t,
      });
      const nextHasLegacySensitiveItems = hasLegacyMigratableSensitiveItems(nextRawPayload);

      setSecurityUpdateRawPayload(nextRawPayload);
      setSecurityUpdateHasLegacySensitiveItems(nextHasLegacySensitiveItems);
      applySecurityUpdateStatus(nextStatus, {
          openSettings: false,
      });
  }, [
      applySecurityUpdateStatus,
      normalizeSecurityUpdateStatus,
      replaceConnections,
      replaceGlobalProxy,
      securityUpdateRawPayload,
      securityUpdateRepairSource,
      securityUpdateStatus,
      securityUpdateStatus.migrationId,
      t,
  ]);

  const handleCloseModal = () => {
      const reopenSecurityUpdateDetails = shouldReopenSecurityUpdateDetails(securityUpdateRepairSource);
      setIsModalOpen(false);
      setEditingConnection(null);
      setSecurityUpdateRepairSource(null);
      if (reopenSecurityUpdateDetails) {
          setIsSecurityUpdateSettingsOpen(true);
      }
  };

  const handleOpenDriverManagerFromConnection = () => {
      setIsModalOpen(false);
      setEditingConnection(null);
      setToolCenterBackGroupKey(null);
      setIsDriverModalOpen(true);
  };

  const handleCloseDriverManager = useCallback(() => {
      const reopenSecurityUpdateDetails = shouldReopenSecurityUpdateDetails(securityUpdateRepairSource);
      setIsDriverModalOpen(false);
      setToolCenterBackGroupKey(null);
      setSecurityUpdateRepairSource(null);
      if (reopenSecurityUpdateDetails) {
          setIsSecurityUpdateSettingsOpen(true);
      }
  }, [securityUpdateRepairSource]);

  const handleOpenGlobalProxySettings = useCallback(() => {
      setSecurityUpdateRepairSource(null);
      setIsProxyModalOpen(true);
  }, []);

  const handleCloseGlobalProxySettings = useCallback(() => {
      const reopenSecurityUpdateDetails = shouldReopenSecurityUpdateDetails(securityUpdateRepairSource);
      setIsProxyModalOpen(false);
      setSecurityUpdateRepairSource(null);
      if (reopenSecurityUpdateDetails) {
          setIsSecurityUpdateSettingsOpen(true);
      }
  }, [securityUpdateRepairSource]);

  const handleOpenAISettings = useCallback((providerId?: string) => {
      setSecurityUpdateRepairSource(null);
      setFocusedAIProviderId(providerId);
      setIsAISettingsOpen(true);
  }, []);

  const handleAIPanelRenderError = useCallback((error: Error, errorInfo: React.ErrorInfo) => {
      try {
          (window as any).__gonaviLastAIPanelRenderError = {
              message: error?.message || '',
              stack: error?.stack || '',
              componentStack: errorInfo?.componentStack || '',
          };
      } catch {
          // ignore debug capture failures
      }
      console.error('AIChatPanel render error:', error, errorInfo);
  }, []);

  const handleRetryAIPanelRender = useCallback(() => {
      setAiPanelRenderNonce((current) => current + 1);
  }, []);

  const handleCloseAISettings = useCallback(() => {
      const reopenSecurityUpdateDetails = shouldReopenSecurityUpdateDetails(securityUpdateRepairSource);
      setIsAISettingsOpen(false);
      setFocusedAIProviderId(undefined);
      setSecurityUpdateRepairSource(null);
      if (reopenSecurityUpdateDetails) {
          setIsSecurityUpdateSettingsOpen(true);
      }
  }, [securityUpdateRepairSource]);

  const handleTitleBarWindowToggle = async (options?: { allowMacNativeFullscreen?: boolean }) => {
      const allowMacNativeFullscreen = options?.allowMacNativeFullscreen === true;
      const syncWindowStateFromRuntime = async () => {
          try {
              const [isFullscreen, isMaximised] = await Promise.all([
                  safeWindowRuntimeCall(() => WindowIsFullscreen(), false),
                  safeWindowRuntimeCall(() => WindowIsMaximised(), false),
              ]);
              useStore.getState().setWindowState(isFullscreen ? 'fullscreen' : (isMaximised ? 'maximized' : 'normal'));
          } catch {
              // ignore
          }
      };

      try {
          void emitWindowDiagnostic('action:titlebar-toggle:before');
          if (await WindowIsFullscreen()) {
              await WindowUnfullscreen();
              await syncWindowStateFromRuntime();
              void emitWindowDiagnostic('action:titlebar-toggle:after-unfullscreen');
              return;
          }
          if (allowMacNativeFullscreen && useNativeMacWindowControls && isMacRuntime) {
              await WindowFullscreen();
              await syncWindowStateFromRuntime();
              void emitWindowDiagnostic('action:titlebar-toggle:after-fullscreen');
              return;
          }
          const isMaximised = await safeWindowRuntimeCall(() => WindowIsMaximised(), false);
          if (isMaximised) {
              WindowUnmaximise();
          } else {
              WindowMaximise();
          }
          await new Promise((resolve) => window.setTimeout(resolve, 96));
          await syncWindowStateFromRuntime();
          void emitWindowDiagnostic('action:titlebar-toggle:after-set-maximise-state');
      } catch (_) {
          // ignore
      }
  };

  const handleTitleBarDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-no-titlebar-toggle="true"]')) {
          return;
      }
      void handleTitleBarWindowToggle({ allowMacNativeFullscreen: false });
  };

  // handleManualResetWindowZoom 由 resetWindowZoom 快捷键（默认 Ctrl+Shift+0）触发，
  // 作为自动路径失败时的兜底入口。
  //
  // 优先调 backend App.ResetWebViewZoom 走 WebView2 zoom reset（零动画零感知）；
  // 失败时回退到 Unmaximise→Maximise toggle —— 用户主动按了快捷键，预期看见动画。
  const handleManualResetWindowZoom = React.useCallback(async () => {
      if (!isWindowsPlatform()) {
          message.info(t('app.window_zoom.message.windows_only'));
          return;
      }
      try {
          const res = await (window as any).go?.app?.App?.ResetWebViewZoom?.();
          if (res?.success) {
              window.dispatchEvent(new Event('resize'));
              message.success(t('app.window_zoom.message.reset_success'));
              return;
          }
          console.warn('ResetWebViewZoom backend reported failure, falling back to maximise toggle:', res?.message);
      } catch (e) {
          console.warn('ResetWebViewZoom backend unavailable, falling back to maximise toggle', e);
      }
      try {
          const isFullscreen = await safeWindowRuntimeCall(() => WindowIsFullscreen(), false);
          if (isFullscreen) {
              message.info(t('app.window_zoom.message.fullscreen_exit_first'));
              return;
          }
          const isMaximised = await safeWindowRuntimeCall(() => WindowIsMaximised(), false);
          if (isMaximised) {
              WindowUnmaximise();
              await new Promise((resolve) => window.setTimeout(resolve, 96));
              WindowMaximise();
              await new Promise((resolve) => window.setTimeout(resolve, 96));
          } else {
              const size = await safeWindowRuntimeCall(() => WindowGetSize(), null);
              const width = Math.trunc(Number(size?.w) || 0);
              const height = Math.trunc(Number(size?.h) || 0);
              if (width > 0 && height > 0) {
                  WindowSetSize(getWindowsScaleFixNudgedWidth(width), height);
                  await new Promise((resolve) => window.setTimeout(resolve, 28));
                  WindowSetSize(width, height);
              }
          }
          window.dispatchEvent(new Event('resize'));
          message.success(t('app.window_zoom.message.reset_success_fallback'));
      } catch (e) {
          console.warn('Failed to reset window zoom', e);
          message.error(t('app.window_zoom.message.reset_failed'));
      }
  }, [t]);
  
  const {
      ghostRef,
      handleSidebarMouseDown,
      sidebarResizeHandleWidth,
      siderRef,
  } = useAppSidebarResize({
      effectiveUiScale,
      setSidebarWidth,
      sidebarWidth,
  });

  useEffect(() => {
    document.body.style.backgroundColor = 'transparent';
    document.body.style.color = darkMode ? '#ffffff' : '#000000';
    document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    document.body.setAttribute('data-ui-version', appearance.uiVersion);
    document.body.setAttribute('data-platform', runtimePlatform || '');
    document.body.style.fontSize = `${effectiveFontSize}px`;
    document.body.style.setProperty('--gn-font-sans', resolvedUiFontFamily);
    document.body.style.setProperty('--gn-font-mono', resolvedMonoFontFamily);
    document.documentElement.style.setProperty('--gonavi-font-size', `${effectiveFontSize}px`);
    document.documentElement.style.setProperty('--gn-font-sans', resolvedUiFontFamily);
    document.documentElement.style.setProperty('--gn-font-mono', resolvedMonoFontFamily);
    document.documentElement.style.setProperty('--gn-ui-scale', `${effectiveUiScale}`);
    document.documentElement.style.setProperty('--gn-font-size', `${effectiveFontSize}px`);
    document.documentElement.style.setProperty('--gn-font-size-sm', `${Math.max(10, Math.round(effectiveFontSize * 0.86))}px`);
    document.documentElement.style.setProperty('--gn-font-size-xs', `${Math.max(9, Math.round(effectiveFontSize * 0.76))}px`);
    document.documentElement.style.setProperty('--gn-font-size-mono', `${Math.max(10, Math.round(effectiveDataTableFontSize * 0.92))}px`);
    document.documentElement.style.setProperty('--gn-data-table-font-size', `${effectiveDataTableFontSize}px`);
    document.documentElement.style.setProperty('--gn-sidebar-tree-font-size', `${effectiveSidebarTreeFontSize}px`);
    document.documentElement.style.setProperty('--gn-sidebar-rail-scale', `${effectiveSidebarRailScale}`);
    document.documentElement.style.setProperty('--gn-control-height', `${tokenControlHeight}px`);
    document.documentElement.style.setProperty('--gn-control-height-sm', `${tokenControlHeightSM}px`);
  }, [
    appearance.uiVersion,
    darkMode,
    effectiveDataTableFontSize,
    effectiveFontSize,
    resolvedMonoFontFamily,
    resolvedUiFontFamily,
    runtimePlatform,
    effectiveSidebarRailScale,
    effectiveSidebarTreeFontSize,
    effectiveUiScale,
    tokenControlHeight,
    tokenControlHeightSM,
  ]);

  useEffect(() => {
      const handleOpenShortcutSettingsEvent = () => {
          setIsShortcutModalOpen(true);
      };
      window.addEventListener('gonavi:open-shortcut-settings', handleOpenShortcutSettingsEvent as EventListener);
      return () => {
          window.removeEventListener('gonavi:open-shortcut-settings', handleOpenShortcutSettingsEvent as EventListener);
      };
  }, []);

  useEffect(() => {
      const handleOpenSnippetSettingsEvent = () => {
          setIsSnippetModalOpen(false);
          handleOpenToolCenterPane('workspace', 'snippet-settings');
      };
      window.addEventListener('gonavi:open-snippet-settings', handleOpenSnippetSettingsEvent as EventListener);
      return () => {
          window.removeEventListener('gonavi:open-snippet-settings', handleOpenSnippetSettingsEvent as EventListener);
      };
  }, [handleOpenToolCenterPane]);

  useEffect(() => {
      const handleOpenTabDisplaySettingsEvent = () => {
          setIsSettingsModalOpen(false);
          setThemeModalSection('appearance');
          setIsThemeModalOpen(true);
          setTabDisplaySettingsFocusRequest((current) => current + 1);
      };
      window.addEventListener('gonavi:open-tab-display-settings', handleOpenTabDisplaySettingsEvent as EventListener);
      return () => {
          window.removeEventListener('gonavi:open-tab-display-settings', handleOpenTabDisplaySettingsEvent as EventListener);
      };
  }, []);

  useEffect(() => {
      const handleCreateQueryTabEvent = () => {
          handleNewQuery();
      };
      window.addEventListener('gonavi:create-query-tab', handleCreateQueryTabEvent as EventListener);
      return () => {
          window.removeEventListener('gonavi:create-query-tab', handleCreateQueryTabEvent as EventListener);
      };
  }, [handleNewQuery]);

  useEffect(() => {
      if (!isMacRuntime || !useNativeMacWindowControls) {
          return;
      }

      const handleMacNativeEscapeCapture = (event: KeyboardEvent) => {
          if (!shouldSuppressMacNativeEscapeExit(
              isMacRuntime,
              useNativeMacWindowControls,
              useStore.getState().windowState === 'fullscreen',
              event,
              { isEditableTarget: isEditableElement(event.target) },
          )) {
              return;
          }
          event.preventDefault();
          event.stopPropagation();
      };

      window.addEventListener('keydown', handleMacNativeEscapeCapture, true);
      return () => {
          window.removeEventListener('keydown', handleMacNativeEscapeCapture, true);
      };
  }, [isMacRuntime, useNativeMacWindowControls]);

  useEffect(() => {
      const handleGlobalShortcut = (event: KeyboardEvent) => {
          const matchedAction = SHORTCUT_ACTION_ORDER.find((action) => {
              const meta = SHORTCUT_ACTION_META[action];
              if (meta.scope && meta.scope !== 'global') {
                  return false;
              }
              const binding = resolveShortcutBinding(shortcutOptions, action, activeShortcutPlatform);
              if (!binding?.enabled) {
                  return false;
              }
              if (isEditableElement(event.target) && !meta.allowInEditable) {
                  return false;
              }
              return isShortcutMatch(event, binding.combo);
          });

          if (!matchedAction) {
              return;
          }

          event.preventDefault();
          event.stopPropagation();

          switch (matchedAction) {
              case 'runQuery':
                  window.dispatchEvent(new CustomEvent('gonavi:run-active-query'));
                  break;
              case 'focusSidebarSearch':
                  window.dispatchEvent(new CustomEvent('gonavi:focus-sidebar-search'));
                  break;
              case 'newQueryTab':
                  handleNewQuery();
                  break;
              case 'switchToNextTab':
                  switchActiveTabByOffset(1);
                  break;
              case 'switchToPreviousTab':
                  switchActiveTabByOffset(-1);
                  break;
              case 'newConnection':
                  handleCreateConnection();
                  break;
              case 'toggleAIPanel':
                  toggleAIPanel();
                  break;
              case 'toggleLogPanel':
                  handleToggleLogPanel();
                  break;
              case 'toggleTheme':
                  setThemePreference(themeMode === 'dark' ? 'light' : 'dark');
                  break;
              case 'openShortcutManager':
                  setIsShortcutModalOpen(true);
                  break;
              case 'toggleMacFullscreen':
                  if (isMacRuntime && useNativeMacWindowControls) {
                      void handleTitleBarWindowToggle({ allowMacNativeFullscreen: true });
                  }
                  break;
              case 'resetWindowZoom':
                  void handleManualResetWindowZoom();
                  break;
          }
      };

      window.addEventListener('keydown', handleGlobalShortcut, true);
      return () => {
          window.removeEventListener('keydown', handleGlobalShortcut, true);
      };
  }, [activeShortcutPlatform, handleCreateConnection, handleManualResetWindowZoom, handleNewQuery, handleTitleBarWindowToggle, handleToggleLogPanel, isMacRuntime, shortcutOptions, switchActiveTabByOffset, themeMode, setThemePreference, toggleAIPanel, useNativeMacWindowControls]);

  useEffect(() => {
      if (!capturingShortcutAction) {
          return;
      }

      const handleShortcutCapture = (event: KeyboardEvent) => {
          event.preventDefault();
          event.stopPropagation();

          if (event.key === 'Escape') {
              setCapturingShortcutAction(null);
              return;
          }

          const combo = eventToShortcut(event);
          if (!combo) {
              return;
          }

          const normalizedCombo = normalizeShortcutCombo(combo);
          if (!canRecordShortcutForAction(capturingShortcutAction, normalizedCombo)) {
              const meta = SHORTCUT_ACTION_META[capturingShortcutAction];
              void message.warning(meta.scope === 'aiComposer'
                  ? t('app.shortcuts.message.ai_send_limit')
                  : t('app.shortcuts.message.modifier_required'));
              return;
          }
          const conflictAction = SHORTCUT_ACTION_ORDER.find((action) => {
              if (action === capturingShortcutAction) {
                  return false;
              }
              const binding = resolveShortcutBinding(shortcutOptions, action, activeShortcutPlatform);
              if (!binding?.enabled) {
                  return false;
              }
              return normalizeShortcutCombo(binding.combo) === normalizedCombo;
          });
          if (conflictAction) {
              void message.warning(t('app.shortcuts.message.conflict', { action: SHORTCUT_ACTION_META[conflictAction].label }));
              return;
          }

          const reservedConflicts = findReservedConflictsForAction(
              capturingShortcutAction,
              normalizedCombo,
              activeShortcutPlatform,
          );
          if (reservedConflicts.length > 0) {
              const { hasMonaco, hasOther, monacoLabels, otherLabels, otherContexts } = splitConflictsByContext(reservedConflicts);
              if (hasMonaco) {
                  void message.info(t('app.shortcuts.message.reserved_conflict_info', { labels: monacoLabels }), 4);
              }
              if (hasOther) {
                  void message.warning(t('app.shortcuts.message.reserved_conflict_warning', { contexts: otherContexts, labels: otherLabels }), 4);
              }
          }

          updateShortcut(capturingShortcutAction, { combo: normalizedCombo, enabled: true }, activeShortcutPlatform);
          setCapturingShortcutAction(null);
      };

      window.addEventListener('keydown', handleShortcutCapture, true);
      return () => {
          window.removeEventListener('keydown', handleShortcutCapture, true);
      };
  }, [activeShortcutPlatform, capturingShortcutAction, shortcutOptions, t, updateShortcut]);

  const linuxResizeHandleStyleBase = {
      position: 'fixed',
      zIndex: 12000,
      background: 'transparent',
      WebkitAppRegion: 'drag',
      '--wails-draggable': 'drag',
      userSelect: 'none'
  } as any;

  const showLinuxResizeHandles = isLinuxRuntime;
  const resizeGuideColor = isV2Ui
      ? 'var(--gn-accent, #16a34a)'
      : (darkMode ? 'rgba(246, 196, 83, 0.55)' : 'rgba(24, 144, 255, 0.5)');
  const antdTheme = useMemo(() => ({
      algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
          fontSize: tokenFontSize,
          fontSizeSM: tokenFontSizeSM,
          fontSizeLG: tokenFontSizeLG,
          fontFamily: resolvedUiFontFamily,
          fontFamilyCode: resolvedMonoFontFamily,
          controlHeight: tokenControlHeight,
          controlHeightSM: tokenControlHeightSM,
          controlHeightLG: tokenControlHeightLG,
          colorBgLayout: 'transparent',
          colorBgContainer: darkMode
              ? `rgba(29, 29, 29, ${effectiveOpacity})`
              : `rgba(255, 255, 255, ${effectiveOpacity})`,
          colorBgElevated: darkMode
              ? '#1f1f1f'
              : '#ffffff',
          colorFillAlter: darkMode
              ? `rgba(38, 38, 38, ${effectiveOpacity})`
              : `rgba(250, 250, 250, ${effectiveOpacity})`,
          colorPrimary: darkMode ? '#f6c453' : '#1677ff',
          colorPrimaryHover: darkMode ? '#ffd666' : '#4096ff',
          colorPrimaryActive: darkMode ? '#d8a93b' : '#0958d9',
          colorInfo: darkMode ? '#f6c453' : '#1677ff',
          colorLink: darkMode ? '#ffd666' : '#1677ff',
          colorLinkHover: darkMode ? '#ffe58f' : '#4096ff',
          colorLinkActive: darkMode ? '#d8a93b' : '#0958d9',
          colorPrimaryBg: darkMode ? 'rgba(246, 196, 83, 0.22)' : '#e6f4ff',
          colorPrimaryBgHover: darkMode ? 'rgba(246, 196, 83, 0.30)' : '#bae0ff',
          colorPrimaryBorder: darkMode ? 'rgba(246, 196, 83, 0.45)' : '#91caff',
          colorPrimaryBorderHover: darkMode ? 'rgba(246, 196, 83, 0.60)' : '#69b1ff',
          controlItemBgActive: darkMode ? 'rgba(246, 196, 83, 0.20)' : 'rgba(22, 119, 255, 0.12)',
          controlItemBgActiveHover: darkMode ? 'rgba(246, 196, 83, 0.28)' : 'rgba(22, 119, 255, 0.18)',
          controlOutline: darkMode ? 'rgba(246, 196, 83, 0.50)' : 'rgba(5, 145, 255, 0.24)',
      },
      components: {
          Layout: {
              bodyBg: 'transparent',
              headerBg: 'transparent',
              siderBg: 'transparent',
              triggerBg: 'transparent'
          },
          Table: {
              headerBg: 'transparent',
              rowHoverBg: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.02)',
          },
          Tabs: {
              cardBg: 'transparent',
              itemActiveColor: darkMode ? '#ffd666' : '#1890ff',
              itemHoverColor: darkMode ? '#ffe58f' : '#40a9ff',
              itemSelectedColor: darkMode ? '#ffd666' : '#1677ff',
              inkBarColor: darkMode ? '#ffd666' : '#1677ff',
          }
      }
  }), [
      darkMode,
      effectiveOpacity,
      isV2Ui,
      tokenControlHeight,
      tokenControlHeightLG,
      tokenControlHeightSM,
      tokenFontSize,
      tokenFontSizeLG,
      tokenFontSizeSM,
      resolvedMonoFontFamily,
      resolvedUiFontFamily,
  ]);
  const filterFontOption = useCallback((input: string, option?: { value?: string; label?: React.ReactNode }) => (
      matchFontFamilyOption(input, {
          value: String(option?.value || ''),
          label: String(option?.label || ''),
      })
  ), []);
  const renderFontOptionLabel = useCallback((option: FontFamilyOption) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.35 }}>
          <span>{option.label}</span>
          <span style={{ fontSize: 11, color: darkMode ? 'rgba(255,255,255,0.45)' : 'rgba(16,24,40,0.45)' }}>
              {option.value}
          </span>
      </div>
  ), [darkMode]);
  const showLinuxCJKFontBanner = Boolean(
      linuxCJKFontInstallHint &&
      hasLoadedInstalledFontsRef.current &&
      !isFontFamiliesLoading &&
      !fontFamiliesLoadError &&
      !isLinuxCJKFontBannerDismissed,
  );

  return (
    <ConfigProvider
        locale={getAntdLocale(language)}
        componentSize={appComponentSize}
        theme={antdTheme}
    >
        <Layout style={{ 
            height: '100vh', 
            overflow: 'hidden', 
            display: 'flex', 
            flexDirection: 'column',
            background: 'transparent',
            borderRadius: showLinuxResizeHandles ? 0 : 'var(--gonavi-border-radius)',
            clipPath: showLinuxResizeHandles ? 'none' : 'inset(0 round var(--gonavi-border-radius))',
            backdropFilter: blurFilter,
            WebkitBackdropFilter: blurFilter,
        }}>
          {/* Custom Title Bar */}
          <div
            onDoubleClick={handleTitleBarDoubleClick}
            style={{
                height: titleBarHeight,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: bgMain,
                borderBottom: 'none',
                userSelect: 'none',
                WebkitAppRegion: 'drag', // Wails drag region
                '--wails-draggable': 'drag',
                paddingLeft: getMacNativeTitlebarPaddingLeft(effectiveUiScale, useNativeMacWindowControls),
                paddingRight: getMacNativeTitlebarPaddingRight(effectiveUiScale, useNativeMacWindowControls),
                fontSize: tokenFontSize
            } as any}
          >
              <div style={{ display: 'flex', alignItems: 'center', gap: Math.max(6, Math.round(8 * effectiveUiScale)), fontWeight: 600, minWidth: 0 }}>
                  {/* Logo can be added here if available */}
                  GoNavi
              </div>
              {useNativeMacWindowControls ? (
                  <div style={{ minWidth: Math.max(40, Math.round(48 * effectiveUiScale)) }} />
              ) : (
                  <div
                    data-no-titlebar-toggle="true"
                    onDoubleClick={(e) => e.stopPropagation()}
                    style={{ display: 'flex', height: '100%', WebkitAppRegion: 'no-drag', '--wails-draggable': 'no-drag' } as any}
                  >
                      <Button 
                        type="text" 
                        icon={<MinusOutlined />} 
                        style={{ height: '100%', borderRadius: 0, width: titleBarButtonWidth }} 
                        onClick={WindowMinimise} 
                      />
                      <Button 
                        type="text" 
                        icon={titleBarToggleIconKey === 'restore' ? <SwitcherOutlined /> : <BorderOutlined />} 
                        style={{ height: '100%', borderRadius: 0, width: titleBarButtonWidth }} 
                        onClick={() => { void handleTitleBarWindowToggle(); }} 
                      />
                      <Button 
                        type="text" 
                        icon={<CloseOutlined />} 
                        danger
                        className="titlebar-close-btn"
                        style={{ height: '100%', borderRadius: 0, width: titleBarButtonWidth }} 
                        onClick={() => { void handleApplicationQuitRequest(); }}
                      />
                  </div>
              )}
          </div>

          {showLinuxCJKFontBanner && (
              <LinuxCJKFontBanner
                darkMode={darkMode}
                installHint={linuxCJKFontInstallHint || ''}
                onOpenFontSettings={() => {
                        setThemeModalSection('appearance');
                        setIsThemeModalOpen(true);
                }}
                onDismiss={() => setIsLinuxCJKFontBannerDismissed(true)}
              />
          )}

          <Layout style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <Sider 
            ref={siderRef}
            width={sidebarWidth} 
            className={isV2Ui ? 'gn-v2-app-sider' : undefined}
            style={{ 
                borderRight: isV2Ui ? 'none' : '1px solid rgba(128,128,128,0.2)',
                position: 'relative',
                background: isV2Ui ? 'var(--gn-bg-panel-2)' : bgMain
            }}
          >
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {!isV2Ui && (
                <>
                <div style={{ padding: `12px ${sidebarHorizontalPadding}px 8px`, borderBottom: 'none', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sidebarUtilityItems.length}, minmax(0, 1fr))`, gap: 8, width: '100%' }}>
                        {sidebarUtilityItems.map((item) => (
                            <Tooltip key={item.key} title={item.title}>
                                <Button type="text" icon={item.icon} style={utilityButtonStyle} onClick={item.onClick} />
                            </Tooltip>
                        ))}
                    </div>
                </div>
                <div style={{ padding: `0 ${sidebarHorizontalPadding}px 10px`, borderBottom: 'none', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isSidebarCompact ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, width: '100%' }}>
                        <Button icon={<PlusOutlined />} onClick={handleCreateConnection} title={t('connection.new')} style={sidebarCreateConnectionActionStyle}>
                            {t('connection.new')}
                        </Button>
                        <Button icon={<ConsoleSqlOutlined />} onClick={handleNewQuery} title={t('query.new')} style={sidebarQueryActionStyle}>
                            {t('query.new')}
                        </Button>
                    </div>
                </div>
                </>
                )}
                
                <div style={{ flex: 1, overflow: 'hidden', paddingBottom: isV2Ui ? 0 : 58, paddingRight: sidebarResizeHandleWidth, position: 'relative' }}>
                    <div style={{ height: '100%', opacity: connectionWorkbenchState.ready ? 1 : 0.72, pointerEvents: connectionWorkbenchState.ready ? 'auto' : 'none' }}>
                        <Sidebar
                            onCreateConnection={handleCreateConnection}
                            onEditConnection={handleEditConnection}
                            onOpenTools={handleOpenToolsModal}
                            onOpenSettings={handleOpenSettingsModal}
                            onToggleAI={toggleAIPanel}
                            onToggleLogPanel={handleToggleLogPanel}
                            uiVersion={appearance.uiVersion}
                            onFocusCommandSearch={handleFocusSidebarSearch}
                        />
                    </div>
                    {!connectionWorkbenchState.ready && (
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 16,
                                background: darkMode ? 'rgba(7, 12, 20, 0.42)' : 'rgba(255, 255, 255, 0.58)',
                                backdropFilter: 'blur(4px)',
                                zIndex: 1,
                            }}
                        >
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 14px',
                                    borderRadius: 999,
                                    background: darkMode ? 'rgba(15, 23, 36, 0.86)' : 'rgba(255, 255, 255, 0.94)',
                                    border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(22,32,51,0.08)',
                                    boxShadow: darkMode ? '0 12px 24px rgba(0,0,0,0.26)' : '0 12px 24px rgba(15,23,42,0.08)',
                                    color: darkMode ? 'rgba(255,255,255,0.88)' : '#162033',
                                    fontSize: 12,
                                    fontWeight: 500,
                                }}
                            >
                                <Spin size="small" />
                                <span>{connectionWorkbenchState.message}</span>
                            </div>
                        </div>
                    )}
                    <div
                        onMouseDown={handleSidebarMouseDown}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        role="separator"
                        aria-orientation="vertical"
                        title={t('app.sidebar.resize_width')}
                        style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: sidebarResizeHandleWidth,
                            cursor: 'col-resize',
                            zIndex: 3,
                            touchAction: 'none',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            background: 'transparent',
                        }}
                    />
                </div>

                {/* Floating SQL Log Toggle */}
                {!isV2Ui && (
                <div
                    style={{
                        position: 'absolute',
                        left: 10,
                        right: 14,
                        bottom: 10,
                        zIndex: 20,
                        pointerEvents: 'none'
                    }}
                >
                    <Button
                        type={isLogPanelOpen ? "primary" : "text"}
                        icon={<BugOutlined />}
                        onClick={handleToggleLogPanel}
                        style={isLogPanelOpen ? {
                            width: '100%',
                            height: floatingLogButtonHeight,
                            borderRadius: 999,
                            boxShadow: floatingLogButtonShadow,
                            pointerEvents: 'auto'
                        } : {
                            width: '100%',
                            height: floatingLogButtonHeight,
                            borderRadius: 999,
                            border: `1px solid ${floatingLogButtonBorderColor}`,
                            color: floatingLogButtonTextColor,
                            background: floatingLogButtonBgColor,
                            boxShadow: floatingLogButtonShadow,
                            backdropFilter: blurFilter,
                            pointerEvents: 'auto'
                        }}
                    >
                        {t('app.sidebar.sql_execution_log')}
                    </Button>
                </div>
                )}
            </div>
          </Sider>
           <Content style={{ background: bgContent, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
             {securityUpdateEntryVisibility.showBanner && !isSecurityUpdateBannerDismissed && (
                <SecurityUpdateBanner
                  status={securityUpdateStatus}
                  darkMode={darkMode}
                  overlayTheme={overlayTheme}
                  surfaceOpacity={effectiveOpacity}
                  onStart={handleStartSecurityUpdate}
                  onRetry={handleRetrySecurityUpdate}
                  onRestart={handleRestartSecurityUpdate}
                  onOpenDetails={() => handleOpenSecurityUpdateSettings(
                      hasSecurityUpdateRecentResult(securityUpdateStatus) ? 'recent_result' : null,
                  )}
                  onDismiss={() => setIsSecurityUpdateBannerDismissed(true)}
                />
             )}
             <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'row', position: 'relative' }}>
               <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: bgContent, marginBottom: isLogPanelOpen ? 8 : 0, borderRadius: isLogPanelOpen ? 'var(--gonavi-border-radius)' : 0, clipPath: isLogPanelOpen ? 'inset(0 round var(--gonavi-border-radius))' : 'none' }}>
                  <TabManager />
               </div>
               {!isV2Ui && !aiPanelVisible && (
               <>
               {aiEntryPlacement === 'content-edge' && legacyAiEdgeHandleAttachment === 'content-shell' && (
                  <div style={legacyAiEdgeHandleDockStyle}>
                      {renderLegacyAIEdgeHandle()}
                  </div>
               )}
               </>
               )}
               {aiPanelVisible && (
                  <div
                    className={aiPanelOverlayActive ? 'gn-v2-ai-panel-overlay' : undefined}
                    style={aiPanelOverlayActive
                      ? { position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none', zIndex: 14 }
                      : { position: 'relative', display: 'flex', flexShrink: 0, overflow: 'visible' }}
                  >
                      {aiPanelOverlayActive && (
                          <button
                            type="button"
                            className="gn-v2-ai-panel-backdrop"
                            aria-label={t('app.ai_panel.aria.close')}
                            onClick={() => setAIPanelVisible(false)}
                            style={{
                              position: 'absolute',
                              inset: 0,
                              border: 0,
                              padding: 0,
                              background: darkMode ? 'rgba(3, 7, 18, 0.26)' : 'rgba(248, 250, 252, 0.38)',
                              backdropFilter: 'blur(2px)',
                              pointerEvents: 'auto',
                            }}
                          />
                      )}
                      <div
                        className={`gn-v2-ai-panel-dock${aiPanelOverlayActive ? ' is-overlay' : ''}`}
                        style={aiPanelOverlayActive
                          ? {
                              position: 'relative',
                              display: 'flex',
                              height: '100%',
                              pointerEvents: 'auto',
                              zIndex: 1,
                              boxShadow: '0 18px 48px rgba(15, 23, 42, 0.18)',
                            }
                          : undefined}
                      >
                      {!isV2Ui && (
                      <>
                      {aiEntryPlacement === 'content-edge' && legacyAiEdgeHandleAttachment === 'panel-shell' && (
                          <div style={legacyAiEdgeHandleDockStyle}>
                              {renderLegacyAIEdgeHandle()}
                          </div>
                      )}
                      </>
                      )}
                      <AIPanelErrorBoundary
                        key={aiPanelRenderNonce}
                        onError={handleAIPanelRenderError}
                        fallback={(error) => (
                          <div
                            style={{
                              width: aiPanelRenderWidth,
                              minWidth: 0,
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 20,
                              background: bgContent,
                              color: darkMode ? 'rgba(255,255,255,0.88)' : '#162033',
                            }}
                          >
                            <div
                              style={{
                                width: '100%',
                                maxWidth: 360,
                                display: 'grid',
                                gap: 12,
                                padding: 18,
                                borderRadius: 16,
                                border: darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.08)',
                                background: darkMode ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.94)',
                                boxShadow: darkMode ? '0 16px 36px rgba(0,0,0,0.32)' : '0 16px 36px rgba(15,23,42,0.12)',
                              }}
                            >
                              <div style={{ fontSize: 15, fontWeight: 600 }}>{t('app.ai_panel.error.title')}</div>
                              <div style={{ fontSize: 12, lineHeight: 1.6, color: darkMode ? 'rgba(255,255,255,0.68)' : '#526075' }}>
                                {t('app.ai_panel.error.description')}
                              </div>
                              {error?.message && (
                                <div
                                  style={{
                                    fontSize: 12,
                                    lineHeight: 1.5,
                                    wordBreak: 'break-word',
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    background: darkMode ? 'rgba(2,6,23,0.7)' : 'rgba(248,250,252,0.92)',
                                    border: darkMode ? '1px solid rgba(148,163,184,0.18)' : '1px solid rgba(148,163,184,0.22)',
                                  }}
                                >
                                  {error.message}
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <Button aria-label={t('app.ai_panel.aria.close')} onClick={() => setAIPanelVisible(false)}>{t('app.ai_panel.action.close')}</Button>
                                <Button type="primary" onClick={handleRetryAIPanelRender}>{t('app.ai_panel.action.reload')}</Button>
                              </div>
                            </div>
                          </div>
                        )}
                      >
                        <AIChatPanel width={aiPanelRenderWidth} darkMode={darkMode} bgColor={bgContent} onClose={() => setAIPanelVisible(false)} onOpenSettings={() => {
                          handleOpenAISettings();
                        }} overlayTheme={overlayTheme} />
                      </AIPanelErrorBoundary>
                      </div>
                  </div>
               )}
             </div>
             {!isV2Ui && isLogPanelOpen && (
                  <LogPanel
                     height={logPanelHeight}
                     onClose={handleCloseLogPanel}
                    onResizeStart={handleLogResizeStart} 
                />
            )}
          </Content>
          </Layout>
          {isConnectionModalMounted && (
          <ConnectionModal
            open={isModalOpen} 
            onClose={handleCloseModal} 
            initialValues={editingConnection}
            onOpenDriverManager={handleOpenDriverManagerFromConnection}
            onSaved={handleConnectionSaved}
          />
          )}
          {isToolsModalOpen && (() => {
            const toolCenterGroups = [
              {
                key: 'config',
                icon: <SettingOutlined />,
                title: t('app.tools.group.config.title'),
                description: t('app.tools.group.config.description'),
                items: [
                  {
                    key: 'import',
                    icon: <UploadOutlined />,
                    title: t('app.tools.entry.import.title'),
                    description: t('app.tools.entry.import.description'),
                    onClick: () => {
                      void handleImportConnections('config');
                    },
                  },
                  {
                    key: 'export',
                    icon: <DownloadOutlined />,
                    title: t('app.tools.entry.export.title'),
                    description: t('app.tools.entry.export.description'),
                    onClick: () => {
                      void handleExportConnections('config');
                    },
                  },
                  {
                    key: 'data-root',
                    icon: <HddOutlined />,
                    title: t('app.tools.entry.data_root.title'),
                    description: t('app.tools.entry.data_root.description'),
                    onClick: () => {
                      handleOpenToolCenterPane('config', 'data-root');
                    },
                  },
                  {
                    key: 'security-update',
                    icon: <SafetyCertificateOutlined />,
                    title: t('app.tools.entry.security_update.title'),
                    description: securityUpdateEntryVisibility.showDetailEntry || securityUpdateHasLegacySensitiveItems
                      ? t('app.tools.entry.security_update.status_description', { status: securityUpdateStatusMeta.label })
                      : t('app.tools.entry.security_update.description'),
                    onClick: () => {
                      handleOpenToolCenterPane('config', 'security-update');
                    },
                  },
                ],
              },
              {
                key: 'workflow',
                icon: <SwitcherOutlined />,
                title: t('app.tools.group.workflow.title'),
                description: t('app.tools.group.workflow.description'),
                items: [
                  {
                    key: 'schema-compare',
                    icon: <AppstoreOutlined />,
                    title: t('app.tools.entry.schema_compare.title'),
                    description: t('app.tools.entry.schema_compare.description'),
                    onClick: () => {
                      setSyncModalEntryMode('schemaCompare');
                      handleOpenToolCenterPane('workflow', 'schema-compare');
                    },
                  },
                  {
                    key: 'data-compare',
                    icon: <SwitcherOutlined />,
                    title: t('app.tools.entry.data_compare.title'),
                    description: t('app.tools.entry.data_compare.description'),
                    onClick: () => {
                      setSyncModalEntryMode('dataCompare');
                      handleOpenToolCenterPane('workflow', 'data-compare');
                    },
                  },
                  {
                    key: 'sync',
                    icon: <UploadOutlined rotate={90} />,
                    title: t('app.tools.entry.sync.title'),
                    description: t('app.tools.entry.sync.description'),
                    onClick: () => {
                      setSyncModalEntryMode('sync');
                      handleOpenToolCenterPane('workflow', 'sync');
                    },
                  },
                ],
              },
              {
                key: 'workspace',
                icon: <CodeOutlined />,
                title: t('app.tools.group.workspace.title'),
                description: t('app.tools.group.workspace.description'),
                items: [
                  {
                    key: 'drivers',
                    icon: <SettingOutlined />,
                    title: t('app.tools.entry.drivers.title'),
                    description: t('app.tools.entry.drivers.description'),
                    onClick: () => {
                      handleOpenToolCenterPane('workspace', 'drivers');
                    },
                  },
                  {
                    key: 'snippet-settings',
                    icon: <CodeOutlined />,
                    title: t('app.tools.entry.snippets.title'),
                    description: t('app.tools.entry.snippets.description'),
                    onClick: () => {
                      handleOpenToolCenterPane('workspace', 'snippet-settings');
                    },
                  },
                  {
                    key: 'shortcut-settings',
                    icon: <LinkOutlined />,
                    title: t('app.tools.entry.shortcuts.title'),
                    description: t('app.tools.entry.shortcuts.description'),
                    onClick: () => {
                      handleOpenToolCenterPane('workspace', 'shortcut-settings');
                    },
                  },
                ],
              },
            ] as const;
            const activeToolCenterGroup = toolCenterGroups.find((group) => group.key === activeToolCenterGroupKey) ?? toolCenterGroups[0];
            const activeToolCenterPaneItem = activeToolCenterPane
              ? toolCenterGroups
                  .find((group) => group.key === activeToolCenterPane.group)
                  ?.items.find((item) => item.key === activeToolCenterPane.key)
              : null;
            const closeToolCenterPane = () => {
              if (activeToolCenterPane?.key === 'connection-package') {
                closeConnectionPackageDialog();
                return;
              }
              setToolCenterBackGroupKey(null);
              setActiveToolCenterPane(null);
            };
            const renderToolCenterPane = () => {
              if (!activeToolCenterPane) {
                return null;
              }

              if (activeToolCenterPane.key === 'connection-package') {
                return (
                  <ConnectionPackagePasswordModal
                    embedded
                    open={connectionPackageDialog.open}
                    title={connectionPackageDialog.mode === 'export'
                        ? t('app.connection_package.dialog.export_title')
                        : t('app.connection_package.dialog.import_password_title')}
                    mode={connectionPackageDialog.mode}
                    includeSecrets={connectionPackageDialog.includeSecrets}
                    useFilePassword={connectionPackageDialog.useFilePassword}
                    password={connectionPackageDialog.password}
                    error={connectionPackageDialog.error}
                    confirmLoading={connectionPackageDialog.confirmLoading}
                    confirmText={connectionPackageDialog.mode === 'export'
                        ? t('app.connection_package.action.start_export')
                        : t('app.connection_package.action.start_import')}
                    cancelText={t('common.close')}
                    onBack={closeToolCenterPane}
                    onIncludeSecretsChange={(value) => {
                        setConnectionPackageDialog((current) => ({
                            ...current,
                            includeSecrets: value,
                            useFilePassword: value ? current.useFilePassword : false,
                            password: value ? current.password : '',
                            error: '',
                        }));
                    }}
                    onUseFilePasswordChange={(value) => {
                        setConnectionPackageDialog((current) => ({
                            ...current,
                            useFilePassword: value,
                            password: value ? current.password : '',
                            error: '',
                        }));
                    }}
                    onPasswordChange={(value) => {
                        setConnectionPackageDialog((current) => ({
                            ...current,
                            password: value,
                            error: '',
                        }));
                    }}
                    onConfirm={() => {
                        void handleConfirmConnectionPackageDialog();
                    }}
                    onCancel={closeConnectionPackageDialog}
                  />
                );
              }

              if (activeToolCenterPane.key === 'data-root') {
                return (
                  <Modal
                    embedded
                    open
                    title={null}
                    closable={false}
                    onCancel={closeToolCenterPane}
                    footer={[
                      <Button key="close" onClick={closeToolCenterPane}>
                        {t('common.close')}
                      </Button>,
                      <Button key="back" onClick={closeToolCenterPane}>
                        {t('common.back_to_previous')}
                      </Button>,
                    ]}
                    styles={{
                      header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
                      body: { paddingTop: 8 },
                      footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 },
                    }}
                  >
                    {dataRootLoading ? (
                      <div style={{ padding: '16px 0', textAlign: 'center' }}>
                        <Spin />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
                        <div style={utilityPanelStyle}>
                          <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('app.data_root.current_directory')}</div>
                          <div style={{ display: 'grid', gap: 10 }}>
                            <Input readOnly value={dataRootInfo?.path || ''} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div>
                                <div style={{ marginBottom: 6, fontWeight: 500 }}>{t('app.data_root.default_directory')}</div>
                                <div style={utilityMutedTextStyle}>{dataRootInfo?.defaultPath || '-'}</div>
                              </div>
                              <div>
                                <div style={{ marginBottom: 6, fontWeight: 500 }}>{t('app.data_root.driver_directory')}</div>
                                <div style={utilityMutedTextStyle}>{dataRootInfo?.driverPath || '-'}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div style={utilityPanelStyle}>
                          <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('app.data_root.switch_target')}</div>
                          <div style={{ display: 'grid', gap: 10 }}>
                            <Input
                              readOnly
                              value={selectedDataRootPath}
                              placeholder={t('app.data_root.placeholder.select_new_directory')}
                            />
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                              <Button icon={<FolderOpenOutlined />} onClick={() => void handleSelectDataRoot()}>
                                {t('app.data_root.action.select')}
                              </Button>
                              <Button onClick={() => void handleOpenDataRoot()}>
                                {t('app.data_root.action.open_current')}
                              </Button>
                              <Button loading={dataRootApplying} onClick={() => void handleApplyDataRoot(false, true)}>
                                {t('app.data_root.action.restore_default_directory')}
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div style={utilityPanelStyle}>
                          <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('app.data_root.apply_method')}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            <Button loading={dataRootApplying} onClick={() => void handleApplyDataRoot(false)}>
                              {t('app.data_root.action.switch_only')}
                            </Button>
                            <Button type="primary" loading={dataRootApplying} onClick={() => void handleApplyDataRoot(true)}>
                              {t('app.data_root.action.migrate_and_switch')}
                            </Button>
                          </div>
                          <div style={{ ...utilityMutedTextStyle, marginTop: 10 }}>
                            {t('app.data_root.restart_hint')}
                          </div>
                        </div>
                      </div>
                    )}
                  </Modal>
                );
              }

              if (activeToolCenterPane.key === 'security-update') {
                return (
                  <SecurityUpdateSettingsModal
                    embedded
                    open
                    darkMode={darkMode}
                    overlayTheme={overlayTheme}
                    surfaceOpacity={effectiveOpacity}
                    status={securityUpdateStatus}
                    focusTarget={securityUpdateSettingsFocusTarget}
                    focusRequest={securityUpdateSettingsFocusRequest}
                    onClose={closeToolCenterPane}
                    onBack={closeToolCenterPane}
                    onStart={handleStartSecurityUpdate}
                    onRetry={handleRetrySecurityUpdate}
                    onRestart={handleRestartSecurityUpdate}
                    onIssueAction={handleSecurityUpdateIssueAction}
                  />
                );
              }

              if (
                activeToolCenterPane.key === 'schema-compare'
                || activeToolCenterPane.key === 'data-compare'
                || activeToolCenterPane.key === 'sync'
              ) {
                return (
                  <DataSyncModal
                    embedded
                    open
                    onClose={closeToolCenterPane}
                    onBack={closeToolCenterPane}
                    entryMode={syncModalEntryMode}
                  />
                );
              }

              if (activeToolCenterPane.key === 'drivers') {
                return (
                  <DriverManagerModal
                    embedded
                    open
                    onClose={closeToolCenterPane}
                    onBack={closeToolCenterPane}
                    onOpenGlobalProxySettings={handleOpenGlobalProxySettings}
                  />
                );
              }

              if (activeToolCenterPane.key === 'snippet-settings') {
                return (
                  <SnippetSettingsModal
                    embedded
                    open
                    onClose={closeToolCenterPane}
                    onBack={closeToolCenterPane}
                    darkMode={darkMode}
                    overlayTheme={overlayTheme}
                  />
                );
              }

              if (activeToolCenterPane.key === 'shortcut-settings') {
                return (
                  <Modal
                    embedded
                    open
                    title={null}
                    closable={false}
                    onCancel={() => {
                      setCapturingShortcutAction(null);
                      closeToolCenterPane();
                    }}
                    footer={[
                      <Button
                        key="reset"
                        onClick={() => {
                           resetShortcutOptions();
                           setCapturingShortcutAction(null);
                           void message.success(t('app.shortcuts.message.restored_defaults'));
                        }}
                      >
                        {t('app.shortcuts.action.restore_defaults')}
                      </Button>,
                      <Button
                        key="close"
                        type="primary"
                        onClick={() => {
                          setCapturingShortcutAction(null);
                          closeToolCenterPane();
                        }}
                      >
                         {t('common.close')}
                      </Button>,
                      <Button
                        key="back"
                        onClick={() => {
                          setCapturingShortcutAction(null);
                          closeToolCenterPane();
                        }}
                      >
                        {t('common.back_to_previous')}
                      </Button>,
                    ]}
                    styles={{
                      header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
                      body: { paddingTop: 8, overflow: 'hidden', flex: 1, minHeight: 0 },
                      footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 },
                    }}
                  >
                    <div data-gonavi-shortcut-modal-scroll="true" style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8, paddingRight: 8 }}>
                      <div style={utilityPanelStyle}>
                        <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>
                             {t('app.shortcuts.capture_hint')}
                        </div>
                      </div>
                      {SHORTCUT_ACTION_ORDER.map((action) => {
                        const meta = SHORTCUT_ACTION_META[action];
                        if (meta.platformOnly === 'mac' && !isMacRuntime) {
                            return null;
                        }
                        const binding = resolveShortcutBinding(shortcutOptions, action, activeShortcutPlatform);
                        const isCapturing = capturingShortcutAction === action;
                        const conflicts = shortcutConflictMap[action];
                        const conflictInfo = conflicts?.length ? splitConflictsByContext(conflicts) : null;
                        return (
                            <div
                                key={action}
                                style={{
                                    ...utilityPanelStyle,
                                    display: 'grid',
                                    gridTemplateColumns: '1fr auto',
                                    gap: 12,
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500 }}>{meta.label}</div>
                                    <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>{meta.description}</div>
                                    {conflictInfo && (
                                        <div style={{ fontSize: 11, color: darkMode ? '#faad14' : '#d48806', marginTop: 2 }}>
                                            {conflictInfo.hasMonaco && (
                                                <>⚠ {t('app.shortcuts.message.reserved_conflict_info', { labels: conflictInfo.monacoLabels })}</>
                                             )}
                                             {conflictInfo.hasOther && (
                                                <>⚠ {t('app.shortcuts.message.reserved_conflict_warning', { contexts: conflictInfo.otherContexts, labels: conflictInfo.otherLabels })}</>
                                             )}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Input
                                        readOnly
                                        value={isCapturing ? t('app.shortcuts.capture_waiting') : getShortcutDisplayLabel(binding.combo, activeShortcutPlatform)}
                                        style={{ width: 180, fontFamily: resolvedMonoFontFamily }}
                                    />
                                    <Button
                                        size="small"
                                        onClick={() => setCapturingShortcutAction((prev) => (prev === action ? null : action))}
                                    >
                                        {isCapturing ? t('common.cancel') : t('app.shortcuts.action.record')}
                                    </Button>
                                    <Switch
                                        checked={binding.enabled}
                                        onChange={(checked) => updateShortcut(action, { enabled: checked }, activeShortcutPlatform)}
                                    />
                                </div>
                            </div>
                        );
                      })}
                    </div>
                  </Modal>
                );
              }

              return null;
            };

            return (
              <Modal
                title={renderUtilityModalTitle(<ToolOutlined />, t('app.tools.title'), t('app.tools.description'))}
                open={isToolsModalOpen}
                onCancel={() => {
                  if (activeToolCenterPane?.key === 'connection-package') {
                    closeConnectionPackageDialog();
                  }
                  setActiveToolCenterPane(null);
                  setToolCenterBackGroupKey(null);
                  setIsToolsModalOpen(false);
                }}
                footer={null}
                centered
                width={1080}
                styles={{
                  content: toolCenterModalContentStyle,
                  header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
                  body: { paddingTop: 8, paddingBottom: 8, overflow: 'hidden', flex: 1, minHeight: 0 },
                  footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 },
                }}
              >
                <div style={toolCenterModalWorkspaceStyle}>
                  <div style={toolCenterModalSplitStyle}>
                    <div style={toolCenterNavPanelStyle}>
                      <div style={toolCenterNavScrollStyle} role="tablist" aria-orientation="vertical">
                        {toolCenterGroups.map((group) => {
                          const active = group.key === activeToolCenterGroup.key;
                          return (
                            <button
                              key={group.key}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              title={`${group.title} - ${group.description}`}
                              onClick={() => {
                                setActiveToolCenterGroupKey(group.key);
                                setActiveToolCenterPane(null);
                              }}
                              style={{
                                position: 'relative',
                                textAlign: 'left',
                                width: '100%',
                                padding: '11px 10px 11px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background: active
                                  ? (darkMode ? 'rgba(255,214,102,0.10)' : 'rgba(24,144,255,0.08)')
                                  : 'transparent',
                                color: active ? (darkMode ? '#f5f7ff' : '#162033') : (darkMode ? 'rgba(255,255,255,0.82)' : '#3f4b5e'),
                                cursor: 'pointer',
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 10,
                                  bottom: 10,
                                  width: 3,
                                  borderRadius: 999,
                                  background: active
                                    ? (darkMode ? '#ffd666' : '#1677ff')
                                    : 'transparent',
                                }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                  <span
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 8,
                                      display: 'grid',
                                      placeItems: 'center',
                                      fontSize: 15,
                                      flexShrink: 0,
                                      background: active
                                        ? (darkMode ? 'rgba(255,214,102,0.16)' : 'rgba(24,144,255,0.12)')
                                        : (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)'),
                                      color: active
                                        ? (darkMode ? '#ffe58f' : '#1677ff')
                                        : overlayTheme.mutedText,
                                    }}
                                  >
                                    {group.icon}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 13,
                                      fontWeight: active ? 700 : 600,
                                      minWidth: 0,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {group.title}
                                  </span>
                                </span>
                                <span
                                  style={{
                                    minWidth: 20,
                                    height: 20,
                                    paddingInline: 6,
                                    borderRadius: 999,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: active
                                      ? (darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(24,144,255,0.14)')
                                      : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'),
                                    color: active ? (darkMode ? '#f8fafc' : '#0f172a') : overlayTheme.mutedText,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    flexShrink: 0,
                                  }}
                                >
                                  {group.items.length}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={toolCenterContentPanelStyle}>
                      {activeToolCenterPane ? (
                        <div style={toolCenterDetailPanelStyle}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingBottom: 10, borderBottom: `1px solid ${overlayTheme.divider}` }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 16, fontWeight: 700, color: overlayTheme.titleText }}>
                                {activeToolCenterPaneItem?.title ?? activeToolCenterGroup.title}
                              </div>
                              <div style={{ ...utilityMutedTextStyle, marginTop: 4 }}>
                                {activeToolCenterPaneItem?.description ?? activeToolCenterGroup.description}
                              </div>
                            </div>
                            <Button onClick={closeToolCenterPane}>
                              {t('common.back_to_previous')}
                            </Button>
                          </div>
                          <div style={toolCenterDetailBodyStyle}>
                            {renderToolCenterPane()}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: overlayTheme.titleText }}>{activeToolCenterGroup.title}</div>
                            <div style={utilityMutedTextStyle}>{activeToolCenterGroup.description}</div>
                          </div>
                          <div style={toolCenterScrollableListStyle}>
                            {activeToolCenterGroup.items.map((item, index) => (
                              <Button
                                key={item.key}
                                type="text"
                                style={{
                                  ...toolCenterRowStyle,
                                  borderTop: index === 0 ? `1px solid ${overlayTheme.divider}` : 'none',
                                  borderBottom: `1px solid ${overlayTheme.divider}`,
                                }}
                                onClick={item.onClick}
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                  <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: overlayTheme.iconBg, color: overlayTheme.iconColor, flexShrink: 0 }}>
                                    {item.icon}
                                  </span>
                                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                                    <span>{item.title}</span>
                                    <span style={toolCenterRowDescriptionStyle}>{item.description}</span>
                                  </span>
                                </span>
                                <RightOutlined style={{ color: overlayTheme.mutedText, fontSize: 12, flexShrink: 0 }} />
                              </Button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Modal>
            );
          })()}
          {isSettingsModalOpen && (
          <Modal
            title={renderUtilityModalTitle(<SettingOutlined />, t('app.settings.title'), t('app.settings.description'))}
            open={isSettingsModalOpen}
            onCancel={() => setIsSettingsModalOpen(false)}
            footer={null}
            width={560}
            styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 } }}
          >
            <div style={{ display: 'grid', gap: 12, padding: '12px 0' }}>
              {[
                {
                  key: 'language',
                  icon: <GlobalOutlined />,
                  title: t('settings.language.title'),
                  description: t('settings.language.description'),
                  onClick: () => {
                    setIsSettingsModalOpen(false);
                    setIsLanguageModalOpen(true);
                  },
                },
                {
                  key: 'theme',
                  icon: <SkinOutlined />,
                  title: t('app.settings.entry.theme.title'),
                  description: t('app.settings.entry.theme.description'),
                  onClick: () => {
                    setIsSettingsModalOpen(false);
                    setThemeModalSection('theme');
                    setIsThemeModalOpen(true);
                  },
                },
                {
                  key: 'proxy',
                  icon: <GlobalOutlined />,
                  title: t('app.settings.entry.proxy.title'),
                  description: t('app.settings.entry.proxy.description'),
                  onClick: () => {
                    setIsSettingsModalOpen(false);
                    setSecurityUpdateRepairSource(null);
                    setIsProxyModalOpen(true);
                  },
                },
                {
                  key: 'ai',
                  icon: <RobotOutlined />,
                  title: t('app.settings.entry.ai.title'),
                  description: t('app.settings.entry.ai.description'),
                  onClick: () => {
                    setIsSettingsModalOpen(false);
                    handleOpenAISettings();
                  },
                },
                {
                  key: 'about',
                  icon: <InfoCircleOutlined />,
                  title: t('app.settings.entry.about.title'),
                  description: t('app.settings.entry.about.description'),
                  onClick: () => {
                    setIsSettingsModalOpen(false);
                    setIsAboutOpen(true);
                  },
                },
              ].map((item) => (
                <Button key={item.key} type="text" style={utilityActionCardStyle} onClick={item.onClick}>
                  <span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: overlayTheme.iconBg, color: overlayTheme.iconColor, flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  <span style={{ display: 'grid', gap: 4, textAlign: 'left', minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: overlayTheme.titleText }}>{item.title}</span>
                    <span style={{ fontSize: 12, color: overlayTheme.mutedText, whiteSpace: 'normal' }}>{item.description}</span>
                  </span>
                </Button>
              ))}
            </div>
          </Modal>
          )}
          {isLanguageModalOpen && (
          <Modal
            title={renderUtilityModalTitle(<GlobalOutlined />, t('settings.language.title'), t('settings.language.description'))}
            open={isLanguageModalOpen}
            onCancel={() => setIsLanguageModalOpen(false)}
            footer={null}
            width={520}
            styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 } }}
          >
            <LanguageSettingsPanel />
          </Modal>
          )}
          {isDataRootModalOpen && (
          <Modal
            title={renderUtilityModalTitle(
              <HddOutlined />,
              t('app.data_root.title'),
              t('app.data_root.description'),
            )}
            open={isDataRootModalOpen}
            onCancel={() => {
              setIsDataRootModalOpen(false);
              setToolCenterBackGroupKey(null);
            }}
            footer={[
              <Button
                key="close"
                onClick={() => {
                  setIsDataRootModalOpen(false);
                  setToolCenterBackGroupKey(null);
                }}
              >
                {t('common.close')}
              </Button>,
              toolCenterBackGroupKey === 'config' ? (
                <Button
                  key="back"
                  onClick={() => handleReturnToToolCenter(() => setIsDataRootModalOpen(false))}
                >
                  {t('common.back_to_previous')}
                </Button>
              ) : null,
            ]}
            width={720}
            styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 } }}
          >
            {dataRootLoading ? (
              <div style={{ padding: '16px 0', textAlign: 'center' }}>
                <Spin />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
                <div style={utilityPanelStyle}>
                  <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('app.data_root.current_directory')}</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <Input readOnly value={dataRootInfo?.path || ''} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <div style={{ marginBottom: 6, fontWeight: 500 }}>{t('app.data_root.default_directory')}</div>
                        <div style={utilityMutedTextStyle}>{dataRootInfo?.defaultPath || '-'}</div>
                      </div>
                      <div>
                        <div style={{ marginBottom: 6, fontWeight: 500 }}>{t('app.data_root.driver_directory')}</div>
                        <div style={utilityMutedTextStyle}>{dataRootInfo?.driverPath || '-'}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={utilityPanelStyle}>
                  <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('app.data_root.switch_target')}</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <Input
                      readOnly
                      value={selectedDataRootPath}
                      placeholder={t('app.data_root.placeholder.select_new_directory')}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <Button icon={<FolderOpenOutlined />} onClick={() => void handleSelectDataRoot()}>
                        {t('app.data_root.action.select')}
                      </Button>
                      <Button onClick={() => void handleOpenDataRoot()}>
                        {t('app.data_root.action.open_current')}
                      </Button>
                      <Button loading={dataRootApplying} onClick={() => void handleApplyDataRoot(false, true)}>
                        {t('app.data_root.action.restore_default_directory')}
                      </Button>
                    </div>
                  </div>
                </div>
                <div style={utilityPanelStyle}>
                  <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('app.data_root.apply_method')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <Button loading={dataRootApplying} onClick={() => void handleApplyDataRoot(false)}>
                      {t('app.data_root.action.switch_only')}
                    </Button>
                    <Button type="primary" loading={dataRootApplying} onClick={() => void handleApplyDataRoot(true)}>
                      {t('app.data_root.action.migrate_and_switch')}
                    </Button>
                  </div>
                  <div style={{ ...utilityMutedTextStyle, marginTop: 10 }}>
                    {t('app.data_root.restart_hint')}
                  </div>
                </div>
              </div>
            )}
          </Modal>
          )}
          {isSyncModalOpen && (
          <DataSyncModal
            open={isSyncModalOpen}
            onClose={() => {
              setIsSyncModalOpen(false);
              setToolCenterBackGroupKey(null);
            }}
            onBack={toolCenterBackGroupKey === 'workflow' ? () => handleReturnToToolCenter(() => setIsSyncModalOpen(false)) : undefined}
            entryMode={syncModalEntryMode}
          />
          )}
          {isDriverModalOpen && (
          <DriverManagerModal
            open={isDriverModalOpen}
            onClose={handleCloseDriverManager}
            onBack={toolCenterBackGroupKey === 'workspace' ? () => handleReturnToToolCenter(() => setIsDriverModalOpen(false)) : undefined}
            onOpenGlobalProxySettings={handleOpenGlobalProxySettings}
          />
          )}
          <SecurityUpdateIntroModal
            open={isSecurityUpdateIntroOpen}
            loading={isSecurityUpdateProgressOpen}
            darkMode={darkMode}
            overlayTheme={overlayTheme}
            surfaceOpacity={effectiveOpacity}
            onStart={handleStartSecurityUpdate}
            onPostpone={handlePostponeSecurityUpdate}
            onViewDetails={() => handleOpenSecurityUpdateSettings()}
          />
          <SecurityUpdateSettingsModal
            open={isSecurityUpdateSettingsOpen}
            darkMode={darkMode}
            overlayTheme={overlayTheme}
            surfaceOpacity={effectiveOpacity}
            status={securityUpdateStatus}
            focusTarget={securityUpdateSettingsFocusTarget}
            focusRequest={securityUpdateSettingsFocusRequest}
            onClose={() => {
              setIsSecurityUpdateSettingsOpen(false);
              setToolCenterBackGroupKey(null);
            }}
            onBack={toolCenterBackGroupKey === 'config' ? () => handleReturnToToolCenter(() => setIsSecurityUpdateSettingsOpen(false)) : undefined}
            onStart={handleStartSecurityUpdate}
            onRetry={handleRetrySecurityUpdate}
            onRestart={handleRestartSecurityUpdate}
            onIssueAction={handleSecurityUpdateIssueAction}
          />
          <SecurityUpdateProgressModal
            open={isSecurityUpdateProgressOpen}
            stageText={securityUpdateProgressStage}
            overlayTheme={overlayTheme}
            surfaceOpacity={effectiveOpacity}
          />
          {isAISettingsOpen && (
          <AISettingsModal
            open={isAISettingsOpen}
            onClose={handleCloseAISettings}
            darkMode={darkMode}
            overlayTheme={overlayTheme}
            focusProviderId={focusedAIProviderId}
            onBeforeExternalMCPUse={handlePrepareExternalMCPUse}
          />
          )}
          <ConnectionPackagePasswordModal
            open={connectionPackageDialog.open && !(isToolsModalOpen && activeToolCenterPane?.key === 'connection-package')}
            title={connectionPackageDialog.mode === 'export'
                ? t('app.connection_package.dialog.export_title')
                : t('app.connection_package.dialog.import_password_title')}
            mode={connectionPackageDialog.mode}
            includeSecrets={connectionPackageDialog.includeSecrets}
            useFilePassword={connectionPackageDialog.useFilePassword}
            password={connectionPackageDialog.password}
            error={connectionPackageDialog.error}
            confirmLoading={connectionPackageDialog.confirmLoading}
            confirmText={connectionPackageDialog.mode === 'export'
                ? t('app.connection_package.action.start_export')
                : t('app.connection_package.action.start_import')}
            onBack={toolCenterBackGroupKey === 'config' ? () => handleReturnToToolCenter(closeConnectionPackageDialog) : undefined}
            onIncludeSecretsChange={(value) => {
                setConnectionPackageDialog((current) => ({
                    ...current,
                    includeSecrets: value,
                    useFilePassword: value ? current.useFilePassword : false,
                    password: value ? current.password : '',
                    error: '',
                }));
            }}
            onUseFilePasswordChange={(value) => {
                setConnectionPackageDialog((current) => ({
                    ...current,
                    useFilePassword: value,
                    password: value ? current.password : '',
                    error: '',
                }));
            }}
            onPasswordChange={(value) => {
                setConnectionPackageDialog((current) => ({
                    ...current,
                    password: value,
                    error: '',
                }));
            }}
            onConfirm={() => {
                void handleConfirmConnectionPackageDialog();
            }}
            onCancel={closeConnectionPackageDialog}
          />
          <Modal
            title={renderUtilityModalTitle(<InfoCircleOutlined />, t('app.about.title'), t('app.about.description'))}
            open={isAboutOpen}
            onCancel={() => setIsAboutOpen(false)}
            styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' } }}
            footer={[
                isBackgroundProgressForLatestUpdate && !isLatestUpdateDownloaded ? (
                    <Button key="progress" icon={<DownloadOutlined />} onClick={showUpdateDownloadProgress}>{t('app.about.action.download_progress')}</Button>
                ) : null,
                lastUpdateInfo?.hasUpdate && !isLatestUpdateDownloaded && !isBackgroundProgressForLatestUpdate ? (
                    <Button key="mute" onClick={muteLatestUpdate}>{t('app.about.action.mute_this_version')}</Button>
                ) : null,
                <Button key="check" icon={<CloudDownloadOutlined />} onClick={() => checkForUpdates(false)}>{t('app.about.action.check_updates')}</Button>,
                <Button key="close" onClick={() => setIsAboutOpen(false)}>{t('common.close')}</Button>,
                lastUpdateInfo?.hasUpdate && !isLatestUpdateDownloaded && !isBackgroundProgressForLatestUpdate ? (
                    <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={() => downloadUpdate(lastUpdateInfo, false)}>{t('app.about.action.download_update')}</Button>
                ) : null,
                isLatestUpdateDownloaded ? (
                    <Button key="install-direct" type="primary" icon={<DownloadOutlined />} onClick={handleInstallFromProgress}>
                        {t('app.about.action.install_update')}
                    </Button>
                ) : null,
            ].filter(Boolean)}
          >
            {aboutLoading ? (
                <div style={{ padding: '16px 0', textAlign: 'center' }}>
                    <Spin />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={utilityPanelStyle}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                            <div>
                                <div style={{ marginBottom: 6, fontWeight: 600 }}>{t('app.about.field.version')}</div>
                                <div style={utilityMutedTextStyle}>{aboutDisplayVersion}</div>
                            </div>
                            <div>
                                <div style={{ marginBottom: 6, fontWeight: 600 }}>{t('app.about.field.author')}</div>
                                <div style={utilityMutedTextStyle}>{aboutInfo?.author || t('common.unknown')}</div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ marginBottom: 6, fontWeight: 600 }}>{t('app.about.field.update_status')}</div>
                                <div style={utilityMutedTextStyle}>{aboutUpdateStatus || t('app.about.update_status.not_checked')}</div>
                            </div>
                            {aboutInfo?.communityUrl ? (
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ marginBottom: 6, fontWeight: 600 }}>{t('app.about.field.community')}</div>
                                    <a onClick={(e) => { e.preventDefault(); if (aboutInfo?.communityUrl) BrowserOpenURL(aboutInfo.communityUrl); }} href={aboutInfo.communityUrl}>{t('app.about.community.ai_book')}</a>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <div style={utilityPanelStyle}>
                        <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('app.about.project_links')}</div>
                        <div style={{ display: 'grid', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <GithubOutlined />
                                {aboutInfo?.repoUrl ? (
                                    <a onClick={(e) => { e.preventDefault(); if (aboutInfo?.repoUrl) BrowserOpenURL(aboutInfo.repoUrl); }} href={aboutInfo.repoUrl}>{aboutInfo.repoUrl}</a>
                                ) : t('common.unknown')}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <BugOutlined />
                                {aboutInfo?.issueUrl ? (
                                    <a onClick={(e) => { e.preventDefault(); if (aboutInfo?.issueUrl) BrowserOpenURL(aboutInfo.issueUrl); }} href={aboutInfo.issueUrl}>{aboutInfo.issueUrl}</a>
                                ) : t('common.unknown')}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CloudDownloadOutlined />
                                {aboutInfo?.releaseUrl ? (
                                    <a onClick={(e) => { e.preventDefault(); if (aboutInfo?.releaseUrl) BrowserOpenURL(aboutInfo.releaseUrl); }} href={aboutInfo.releaseUrl}>{aboutInfo.releaseUrl}</a>
                                ) : t('common.unknown')}
                            </div>
                        </div>
                    </div>
                </div>
            )}
          </Modal>

          {isThemeModalOpen && (
          <Modal
              title={renderUtilityModalTitle(
                  themeModalSection === 'theme' ? <SkinOutlined /> : <BgColorsOutlined />,
                  themeModalSection === 'theme' ? t('app.theme.theme_settings_title') : t('app.theme.appearance_settings_title'),
                  themeModalSection === 'theme'
                      ? t('app.theme.theme_settings_description')
                      : t('app.theme.appearance_settings_description')
              )}
              open={isThemeModalOpen}
              onCancel={() => { setIsThemeModalOpen(false); setThemeModalSection('theme'); }}
              footer={null}
              width={820}
              styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8, height: 620, overflow: 'hidden' }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 } }}
          >
              <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 16, padding: '12px 0', height: '100%', minHeight: 0, overflow: 'hidden', alignItems: 'stretch' }}>
                  <div style={{ ...utilityPanelStyle, padding: 12, height: 'fit-content' }}>
                      <div style={{ marginBottom: 12, fontWeight: 600 }}>{t('app.theme.navigation_title')}</div>
                      <div style={{ display: 'grid', gap: 10 }}>
                          {[
                              { key: 'theme', title: t('app.theme.nav.theme.title'), description: t('app.theme.nav.theme.description'), icon: <SkinOutlined /> },
                              { key: 'appearance', title: t('app.theme.nav.appearance.title'), description: t('app.theme.nav.appearance.description'), icon: <BgColorsOutlined /> },
                          ].map((item) => {
                              const active = themeModalSection === item.key;
                              return (
                                  <button
                                      key={item.key}
                                      type="button"
                                      onClick={() => setThemeModalSection(item.key as 'theme' | 'appearance')}
                                      style={{
                                          textAlign: 'left',
                                          padding: '12px 12px',
                                          borderRadius: 12,
                                          border: `1px solid ${active
                                              ? (darkMode ? 'rgba(255,214,102,0.3)' : 'rgba(24,144,255,0.24)')
                                              : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)')}`,
                                          background: active
                                              ? (darkMode ? 'linear-gradient(180deg, rgba(255,214,102,0.12) 0%, rgba(255,214,102,0.06) 100%)' : 'linear-gradient(180deg, rgba(24,144,255,0.10) 0%, rgba(24,144,255,0.05) 100%)')
                                              : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                                          color: active ? (darkMode ? '#f5f7ff' : '#162033') : (darkMode ? 'rgba(255,255,255,0.82)' : '#3f4b5e'),
                                          cursor: 'pointer',
                                      }}
                                  >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                          <span>{item.icon}</span>
                                          <span style={{ fontWeight: 700 }}>{item.title}</span>
                                      </div>
                                      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: active ? (darkMode ? 'rgba(255,255,255,0.68)' : 'rgba(22,32,51,0.68)') : utilityMutedTextStyle.color }}>
                                          {item.description}
                                      </div>
                                  </button>
                              );
                          })}
                      </div>
                  </div>
                  <div style={{ minWidth: 0, minHeight: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden', paddingRight: 8, paddingBottom: 28 }}>
                      {themeModalSection === 'theme' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span>{t('app.theme.ui_version.title')}</span>
                                      <span style={{
                                          fontSize: 10,
                                          fontWeight: 700,
                                          padding: '1px 6px',
                                          background: darkMode ? 'rgba(56,189,248,0.18)' : 'rgba(2,132,199,0.10)',
                                          color: darkMode ? '#7dd3fc' : '#0284c7',
                                          borderRadius: 4,
                                      }}>
                                          {t('app.theme.ui_version.badge.new')}
                                      </span>
                                  </div>
                                  <div style={{ ...utilityMutedTextStyle, marginBottom: 12 }}>
                                      {t('app.theme.ui_version.description')}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                                      {[
                                          { key: 'legacy', label: t('app.theme.ui_version.legacy.label'), description: t('app.theme.ui_version.legacy.description'), badge: t('app.theme.ui_version.legacy.badge') },
                                          { key: 'v2', label: t('app.theme.ui_version.v2.label'), description: t('app.theme.ui_version.v2.description'), badge: t('app.theme.ui_version.v2.badge') },
                                      ].map((item) => {
                                          const active = (appearance.uiVersion ?? 'legacy') === item.key;
                                          return (
                                              <button
                                                  key={item.key}
                                                  type="button"
                                                  onClick={() => setAppearance({ uiVersion: item.key as 'legacy' | 'v2' })}
                                                  style={{
                                                      textAlign: 'left',
                                                      padding: '14px 14px',
                                                      borderRadius: 14,
                                                      border: `1px solid ${active
                                                          ? (darkMode ? 'rgba(34,197,94,0.36)' : 'rgba(22,163,74,0.32)')
                                                          : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)')}`,
                                                      background: active
                                                          ? (darkMode ? 'linear-gradient(180deg, rgba(34,197,94,0.14) 0%, rgba(34,197,94,0.06) 100%)' : 'linear-gradient(180deg, rgba(22,163,74,0.10) 0%, rgba(22,163,74,0.05) 100%)')
                                                          : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                                                      color: active ? (darkMode ? '#f5f7ff' : '#162033') : (darkMode ? 'rgba(255,255,255,0.82)' : '#3f4b5e'),
                                                      cursor: 'pointer',
                                                  }}
                                              >
                                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                                          <span style={{ fontSize: 14, fontWeight: 700 }}>{item.label}</span>
                                                          <span style={{
                                                              fontSize: 10,
                                                              fontWeight: 600,
                                                              padding: '1px 6px',
                                                              background: item.key === 'v2'
                                                                  ? (darkMode ? 'rgba(56,189,248,0.18)' : 'rgba(2,132,199,0.10)')
                                                                  : (darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(16,24,40,0.06)'),
                                                              color: item.key === 'v2'
                                                                  ? (darkMode ? '#7dd3fc' : '#0284c7')
                                                                  : (darkMode ? 'rgba(255,255,255,0.7)' : 'rgba(16,24,40,0.6)'),
                                                              borderRadius: 4,
                                                          }}>
                                                              {item.badge}
                                                          </span>
                                                      </span>
                                                      {active ? <CheckOutlined style={{ color: darkMode ? '#4ade80' : '#16a34a' }} /> : null}
                                                  </div>
                                                  <div style={{
                                                      marginTop: 6,
                                                      fontSize: 12,
                                                      lineHeight: 1.6,
                                                      color: active ? (darkMode ? 'rgba(255,255,255,0.68)' : 'rgba(22,32,51,0.68)') : utilityMutedTextStyle.color,
                                                  }}>
                                                      {item.description}
                                                  </div>
                                              </button>
                                          );
                                      })}
                                  </div>
                                  <div style={{ ...utilityMutedTextStyle, marginTop: 10 }}>
                                      {t('app.theme.ui_version.platform_hint')}
                                  </div>
                                  {appearance.uiVersion === 'v2' && (
                                      <div style={{
                                          marginTop: 10,
                                          padding: '8px 10px',
                                          background: darkMode ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.08)',
                                          border: `1px solid ${darkMode ? 'rgba(245,158,11,0.24)' : 'rgba(245,158,11,0.22)'}`,
                                          borderRadius: 8,
                                          fontSize: 11.5,
                                          color: darkMode ? 'rgba(252,211,77,0.92)' : 'rgba(120,53,15,0.85)',
                                          lineHeight: 1.55,
                                      }}>
                                          {t('app.theme.ui_version.beta_warning')}
                                      </div>
                                  )}
                                  {appearance.uiVersion === 'v2' && (
                                      <div style={{ marginTop: 14 }}>
                                          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.ui_version.sidebar_search.title')}</div>
                                          <Segmented
                                              block
                                              options={[
                                                  { label: t('app.theme.ui_version.sidebar_search.command'), value: 'command' },
                                                  { label: t('app.theme.ui_version.sidebar_search.filter'), value: 'filter' },
                                              ]}
                                              value={appearance.v2SidebarSearchMode ?? 'command'}
                                              onChange={(value) => setAppearance({ v2SidebarSearchMode: value as 'command' | 'filter' })}
                                          />
                                          <div style={{ ...utilityMutedTextStyle, marginTop: 8 }}>
                                              {t('app.theme.ui_version.sidebar_search.hint')}
                                          </div>
                                      </div>
                                  )}
                              </div>
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('app.theme.mode_title')}</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                                      {[
                                          { key: 'light', label: t('app.theme.mode.light.label'), description: t('app.theme.mode.light.description') },
                                          { key: 'dark', label: t('app.theme.mode.dark.label'), description: t('app.theme.mode.dark.description') },
                                          { key: 'system', label: t('app.theme.mode.system.label'), description: t('app.theme.mode.system.description') },
                                      ].map((item) => {
                                          const active = themePreference === item.key;
                                          return (
                                              <button
                                                  key={item.key}
                                                  type="button"
                                                  onClick={() => setThemePreference(item.key as 'light' | 'dark' | 'system')}
                                                  style={{
                                                      textAlign: 'left',
                                                      padding: '14px 14px',
                                                      borderRadius: 14,
                                                      border: `1px solid ${active
                                                          ? (darkMode ? 'rgba(255,214,102,0.3)' : 'rgba(24,144,255,0.24)')
                                                          : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)')}`,
                                                      background: active
                                                          ? (darkMode ? 'linear-gradient(180deg, rgba(255,214,102,0.12) 0%, rgba(255,214,102,0.06) 100%)' : 'linear-gradient(180deg, rgba(24,144,255,0.10) 0%, rgba(24,144,255,0.05) 100%)')
                                                          : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                                                      color: active ? (darkMode ? '#f5f7ff' : '#162033') : (darkMode ? 'rgba(255,255,255,0.82)' : '#3f4b5e'),
                                                      cursor: 'pointer',
                                                  }}
                                              >
                                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                      <span style={{ fontSize: 14, fontWeight: 700 }}>{item.label}</span>
                                                      {active ? <CheckOutlined style={{ color: darkMode ? '#ffd666' : '#1677ff' }} /> : null}
                                                  </div>
                                                  <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: active ? (darkMode ? 'rgba(255,255,255,0.68)' : 'rgba(22,32,51,0.68)') : utilityMutedTextStyle.color }}>
                                                      {item.description}
                                                  </div>
                                              </button>
                                          );
                                      })}
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.appearance.ui_scale_title')}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                      <Slider
                                        min={MIN_UI_SCALE}
                                        max={MAX_UI_SCALE}
                                        step={0.05}
                                        value={effectiveUiScale}
                                        onChange={(v) => setUiScale(Number(v))}
                                        style={{ flex: 1 }}
                                      />
                                      <span style={{ width: 56 }}>{Math.round(effectiveUiScale * 100)}%</span>
                                  </div>
                                  <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)', marginTop: 4 }}>
                                      {t('app.theme.appearance.ui_scale_hint')}
                                  </div>
                              </div>
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.appearance.font_size_title')}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                      <Slider
                                        min={MIN_FONT_SIZE}
                                        max={MAX_FONT_SIZE}
                                        step={1}
                                        value={effectiveFontSize}
                                        onChange={(v) => setFontSize(Number(v))}
                                        style={{ flex: 1 }}
                                      />
                                      <span style={{ width: 56 }}>{effectiveFontSize}px</span>
                                  </div>
                              </div>
                              {appearance.uiVersion === 'v2' && (
                                  <div style={utilityPanelStyle}>
                                      <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.appearance.sidebar_rail_scale_title')}</div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                          <Slider
                                            min={MIN_V2_SIDEBAR_RAIL_SCALE}
                                            max={MAX_V2_SIDEBAR_RAIL_SCALE}
                                            step={0.05}
                                            value={effectiveSidebarRailScale}
                                            onChange={(value) => setAppearance({
                                                v2SidebarRailScale: sanitizeV2SidebarRailScale(value),
                                            })}
                                            style={{ flex: 1 }}
                                          />
                                          <span style={{ width: 56 }}>{Math.round(effectiveSidebarRailScale * 100)}%</span>
                                      </div>
                                      <div style={{ ...utilityMutedTextStyle, marginTop: 4 }}>
                                          {t('app.theme.appearance.sidebar_rail_scale_hint')}
                                      </div>
                                  </div>
                              )}
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 10, fontWeight: 500 }}>{t('app.theme.font_family.title')}</div>
                                  <div style={{ display: 'grid', gap: 14 }}>
                                      <div>
                                          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.font_family.ui_title')}</div>
                                          <Select
                                              allowClear
                                              showSearch
                                              optionFilterProp="label"
                                              loading={isFontFamiliesLoading}
                                              placeholder={DEFAULT_UI_FONT_FAMILY}
                                              value={appearance.customUIFontFamily ?? undefined}
                                              onChange={(value) => setAppearance({
                                                  customUIFontFamily: sanitizeFontFamilyInput(value),
                                              })}
                                              onClear={() => setAppearance({ customUIFontFamily: null })}
                                              options={uiFontOptions.map((option) => ({
                                                  value: option.value,
                                                  label: option.label,
                                              }))}
                                              filterOption={filterFontOption}
                                              popupMatchSelectWidth
                                              style={{ width: '100%' }}
                                              optionRender={(option) => renderFontOptionLabel({
                                                  value: String(option.data.value),
                                                  label: String(option.data.label),
                                              })}
                                          />
                                          <div style={{ ...utilityMutedTextStyle, marginTop: 6 }}>
                                              {fontFamiliesLoadError
                                                  ? t('app.theme.font_family.load_failed_fallback', { error: fontFamiliesLoadError })
                                                  : (installedFontFamilies.length > 0
                                                      ? t('app.theme.font_family.loaded_ui_hint', { count: installedFontFamilies.length })
                                                      : t('app.theme.font_family.loading_ui_hint'))}
                                          </div>
                                          {linuxCJKFontInstallHint && hasLoadedInstalledFontsRef.current && !isFontFamiliesLoading && !fontFamiliesLoadError && (
                                              <div
                                                  style={{
                                                      marginTop: 8,
                                                      padding: '9px 10px',
                                                      borderRadius: 8,
                                                      border: darkMode ? '1px solid rgba(250,204,21,0.28)' : '1px solid rgba(217,119,6,0.22)',
                                                      background: darkMode ? 'rgba(250,204,21,0.08)' : 'rgba(251,191,36,0.12)',
                                                      color: darkMode ? 'rgba(254,249,195,0.92)' : '#92400e',
                                                      fontSize: 12,
                                                      lineHeight: 1.7,
                                                  }}
                                              >
                                                  {t('app.theme.font_family.linux_cjk_install_prefix')}
                                                  <span style={{ fontFamily: 'var(--gn-font-mono)', marginLeft: 6 }}>{linuxCJKFontInstallHint}</span>
                                                  {t('app.theme.font_family.linux_cjk_install_suffix')}
                                              </div>
                                          )}
                                      </div>
                                      <div>
                                          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.font_family.mono_title')}</div>
                                          <Select
                                              allowClear
                                              showSearch
                                              optionFilterProp="label"
                                              loading={isFontFamiliesLoading}
                                              placeholder={DEFAULT_MONO_FONT_FAMILY}
                                              value={appearance.customMonoFontFamily ?? undefined}
                                              onChange={(value) => setAppearance({
                                                  customMonoFontFamily: sanitizeFontFamilyInput(value),
                                              })}
                                              onClear={() => setAppearance({ customMonoFontFamily: null })}
                                              options={monoFontOptions.map((option) => ({
                                                  value: option.value,
                                                  label: option.label,
                                              }))}
                                              filterOption={filterFontOption}
                                              popupMatchSelectWidth
                                              style={{ width: '100%' }}
                                              optionRender={(option) => renderFontOptionLabel({
                                                  value: String(option.data.value),
                                                  label: String(option.data.label),
                                              })}
                                          />
                                          <div style={{ ...utilityMutedTextStyle, marginTop: 6 }}>
                                              {fontFamiliesLoadError
                                                  ? t('app.theme.font_family.mono_fallback_hint')
                                                  : t('app.theme.font_family.mono_hint')}
                                          </div>
                                      </div>
                                  </div>
                              </div>
                              <div ref={tabDisplaySettingsPanelRef} style={utilityPanelStyle}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                                      <div style={{ minWidth: 0 }}>
                                          <div style={{ fontWeight: 500 }}>{t('app.theme.tab_display.title')}</div>
                                          <div style={{ ...utilityMutedTextStyle, marginTop: 4 }}>
                                              {t('app.theme.tab_display.description')}
                                          </div>
                                      </div>
                                      <Segmented
                                          size="small"
                                          options={[
                                              { label: t('app.theme.tab_display.layout.single'), value: 'single' },
                                              { label: t('app.theme.tab_display.layout.double'), value: 'double' },
                                          ]}
                                          value={tabDisplaySettings.layout}
                                          onChange={(value) => setTabDisplayLayout(value as TabDisplayLayout)}
                                      />
                                  </div>
                                  <div style={{ display: 'grid', gap: 8 }}>
                                      {tabDisplayElementOrder.map((key) => {
                                          const checked = visibleTabDisplayElementKeys.has(key);
                                          const row = tabDisplaySettings.secondaryElements.includes(key) ? 'secondary' : 'primary';
                                          const currentRowElements = row === 'secondary'
                                              ? tabDisplaySettings.secondaryElements
                                              : tabDisplaySettings.primaryElements;
                                          const indexInRow = currentRowElements.indexOf(key);
                                          const canMoveUp = checked && indexInRow > 0;
                                          const canMoveDown = checked && indexInRow >= 0 && indexInRow < currentRowElements.length - 1;
                                          const isFocused = focusedTabDisplayElementKey === key;
                                          return (
                                              <div
                                                  key={key}
                                                  role="button"
                                                  tabIndex={0}
                                                  onClick={() => setFocusedTabDisplayElementKey(key)}
                                                  onKeyDown={(event) => {
                                                      if (event.key === 'Enter' || event.key === ' ') {
                                                          event.preventDefault();
                                                          setFocusedTabDisplayElementKey(key);
                                                      }
                                                  }}
                                                  style={{
                                                      display: 'grid',
                                                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                                                      gap: 10,
                                                      alignItems: 'center',
                                                      padding: '9px 10px',
                                                      borderRadius: 10,
                                                      border: `1px solid ${isFocused
                                                          ? (darkMode ? 'rgba(255,214,102,0.54)' : 'rgba(24,144,255,0.54)')
                                                          : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)')}`,
                                                      boxShadow: isFocused
                                                          ? (darkMode ? '0 0 0 2px rgba(255,214,102,0.14)' : '0 0 0 2px rgba(24,144,255,0.12)')
                                                          : 'none',
                                                      background: isFocused
                                                          ? (darkMode ? 'linear-gradient(90deg, rgba(255,214,102,0.12) 0%, rgba(255,255,255,0.045) 100%)' : 'linear-gradient(90deg, rgba(24,144,255,0.10) 0%, rgba(255,255,255,0.78) 100%)')
                                                          : checked
                                                          ? (darkMode ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.62)')
                                                          : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(16,24,40,0.025)'),
                                                      cursor: 'pointer',
                                                      transition: 'border-color 140ms ease, box-shadow 140ms ease, background 140ms ease',
                                                  }}
                                              >
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                                      <span style={{
                                                          width: 22,
                                                          height: 22,
                                                          borderRadius: 999,
                                                          display: 'inline-flex',
                                                          alignItems: 'center',
                                                          justifyContent: 'center',
                                                          flexShrink: 0,
                                                          fontFamily: resolvedMonoFontFamily,
                                                          fontSize: 11,
                                                          fontWeight: 800,
                                                          background: isFocused
                                                              ? (darkMode ? 'rgba(255,214,102,0.22)' : 'rgba(24,144,255,0.14)')
                                                              : (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(16,24,40,0.05)'),
                                                          color: isFocused
                                                              ? (darkMode ? '#ffd666' : '#1677ff')
                                                              : (darkMode ? 'rgba(255,255,255,0.56)' : 'rgba(16,24,40,0.5)'),
                                                      }}>
                                                          {checked && indexInRow >= 0 ? indexInRow + 1 : '-'}
                                                      </span>
                                                      <Switch
                                                          size="small"
                                                          checked={checked}
                                                          onClick={(_, event) => event.stopPropagation()}
                                                          onChange={(nextChecked) => updateTabDisplayElementVisibility(key, nextChecked)}
                                                      />
                                                      <div style={{ minWidth: 0 }}>
                                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                                              <span style={{ fontWeight: 600 }}>{getTabDisplayElementLabel(key)}</span>
                                                              {isFocused ? (
                                                                  <span style={{
                                                                      fontSize: 10,
                                                                      lineHeight: '16px',
                                                                      padding: '0 6px',
                                                                      borderRadius: 999,
                                                                      background: darkMode ? 'rgba(255,214,102,0.16)' : 'rgba(24,144,255,0.10)',
                                                                      color: darkMode ? '#ffd666' : '#1677ff',
                                                                  }}>
                                                                      {t('app.theme.tab_display.badge.current')}
                                                                  </span>
                                                              ) : null}
                                                              {checked && tabDisplaySettings.layout === 'double' ? (
                                                                  <span style={{
                                                                      fontSize: 10,
                                                                      lineHeight: '16px',
                                                                      padding: '0 6px',
                                                                      borderRadius: 999,
                                                                      background: row === 'secondary'
                                                                          ? (darkMode ? 'rgba(56,189,248,0.14)' : 'rgba(2,132,199,0.08)')
                                                                          : (darkMode ? 'rgba(34,197,94,0.14)' : 'rgba(22,163,74,0.08)'),
                                                                      color: row === 'secondary'
                                                                          ? (darkMode ? '#7dd3fc' : '#0369a1')
                                                                          : (darkMode ? '#86efac' : '#15803d'),
                                                                  }}>
                                                                      {row === 'secondary'
                                                                          ? t('app.theme.tab_display.row.secondary')
                                                                          : t('app.theme.tab_display.row.primary')}
                                                                  </span>
                                                              ) : null}
                                                          </div>
                                                          <div style={{ ...utilityMutedTextStyle, marginTop: 2 }}>{getTabDisplayElementDescription(key)}</div>
                                                      </div>
                                                  </div>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                      {tabDisplaySettings.layout === 'double' && checked ? (
                                                          <Segmented
                                                              size="small"
                                                              options={[
                                                                  { label: t('app.theme.tab_display.row.primary'), value: 'primary' },
                                                                  { label: t('app.theme.tab_display.row.secondary'), value: 'secondary' },
                                                              ]}
                                                              value={row}
                                                              onChange={(value) => setTabDisplayElementRow(key, value as 'primary' | 'secondary')}
                                                              onClick={(event) => event.stopPropagation()}
                                                          />
                                                      ) : null}
                                                      <Button
                                                          size="small"
                                                          disabled={!canMoveUp}
                                                          onClick={(event) => {
                                                              event.stopPropagation();
                                                              moveTabDisplayElement(key, -1);
                                                          }}
                                                      >
                                                          {t('app.theme.tab_display.action.move_up')}
                                                      </Button>
                                                      <Button
                                                          size="small"
                                                          disabled={!canMoveDown}
                                                          onClick={(event) => {
                                                              event.stopPropagation();
                                                              moveTabDisplayElement(key, 1);
                                                          }}
                                                      >
                                                          {t('app.theme.tab_display.action.move_down')}
                                                      </Button>
                                                  </div>
                                              </div>
                                          );
                                      })}
                                  </div>
                                  <div style={{ ...utilityMutedTextStyle, marginTop: 10 }}>
                                      {t('app.theme.tab_display.preview.prefix')}
                                      {tabDisplaySettings.layout === 'double' ? `${t('app.theme.tab_display.row.primary')} ` : ''}
                                      {tabDisplaySettings.primaryElements.map(getTabDisplayElementLabel).join(' / ') || t('app.theme.tab_display.preview.default_label')}
                                      {tabDisplaySettings.layout === 'double' && tabDisplaySettings.secondaryElements.length > 0
                                          ? t('app.theme.tab_display.preview.secondary', {
                                              labels: tabDisplaySettings.secondaryElements.map(getTabDisplayElementLabel).join(' / '),
                                          })
                                          : ''}
                                      {focusedTabDisplayElementKey
                                          ? t('app.theme.tab_display.preview.focused', {
                                              label: getTabDisplayElementLabel(focusedTabDisplayElementKey),
                                          })
                                          : ''}
                                  </div>
                              </div>
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 10, fontWeight: 500 }}>{t('app.theme.appearance.transparency_blur_title')}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                                      <div>
                                          <div style={{ fontWeight: 500 }}>{t('app.theme.appearance.enable_transparency_blur')}</div>
                                          <div style={{ ...utilityMutedTextStyle, marginTop: 4 }}>{t('app.theme.appearance.enable_transparency_blur_hint')}</div>
                                      </div>
                                      <Switch checked={appearance.enabled !== false} onChange={(checked) => setAppearance({ enabled: checked })} />
                                  </div>
                                  <div style={{ display: 'grid', gap: 14, opacity: appearance.enabled !== false ? 1 : 0.6 }}>
                                      <div>
                                          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.appearance.opacity_title')}</div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                              <Slider 
                                                min={0.1} 
                                                max={1.0} 
                                                step={0.05} 
                                                disabled={appearance.enabled === false}
                                                value={appearance.opacity ?? 1.0} 
                                                onChange={(v) => setAppearance({ opacity: v })} 
                                                style={{ flex: 1 }}
                                              />
                                              <span style={{ width: 40 }}>{Math.round((appearance.opacity ?? 1.0) * 100)}%</span>
                                          </div>
                                      </div>
                                      <div>
                                          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.appearance.blur_title')}</div>
                                          {isWindowsPlatform() ? (
                                              <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>
                                                  {t('app.theme.appearance.windows_acrylic_hint')}
                                              </div>
                                          ) : (
                                              <>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                      <Slider
                                                        min={0}
                                                        max={20}
                                                        disabled={appearance.enabled === false}
                                                        value={appearance.blur ?? 0}
                                                        onChange={(v) => setAppearance({ blur: v })}
                                                        style={{ flex: 1 }}
                                                      />
                                                      <span style={{ width: 40 }}>{appearance.blur}px</span>
                                                  </div>
                                                  <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)', marginTop: 4 }}>
                                                      {t('app.theme.appearance.blur_hint')}
                                                  </div>
                                              </>
                                          )}
                                      </div>
                                  </div>
                              </div>
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 10, fontWeight: 500 }}>{t('app.theme.data_table.title')}</div>
                                  <div style={{ display: 'grid', gap: 14 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                          <div>
                                              <div style={{ fontWeight: 500 }}>{t('app.theme.data_table.vertical_borders')}</div>
                                              <div style={{ ...utilityMutedTextStyle, marginTop: 4 }}>{t('app.theme.data_table.vertical_borders_hint')}</div>
                                          </div>
                                          <Switch
                                              checked={appearance.showDataTableVerticalBorders === true}
                                              onChange={(checked) => setAppearance({ showDataTableVerticalBorders: checked })}
                                          />
                                      </div>
                                      <div>
                                          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.data_table.table_double_click_action')}</div>
                                          <Segmented
                                              block
                                              options={[
                                                  { label: t('app.theme.data_table.table_double_click_action.open_data'), value: 'open-data' },
                                                  { label: t('app.theme.data_table.table_double_click_action.open_design'), value: 'open-design' },
                                              ]}
                                              value={tableDoubleClickAction}
                                              onChange={(value) => setAppearance({ tableDoubleClickAction: value as 'open-data' | 'open-design' })}
                                          />
                                          <div style={{ ...utilityMutedTextStyle, marginTop: 8 }}>
                                              {t('app.theme.data_table.table_double_click_action_hint')}
                                          </div>
                                      </div>
                                      <div>
                                          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.data_table.density')}</div>
                                          <Segmented
                                              block
                                              options={DENSITY_OPTIONS.map((option) => ({
                                                  ...option,
                                                  label: t(`app.theme.data_table.density.${option.value}`),
                                              }))}
                                              value={appearance.dataTableDensity}
                                              onChange={(value) => setAppearance({ dataTableDensity: sanitizeDataTableDensity(value) })}
                                          />
                                          <div style={{ ...utilityMutedTextStyle, marginTop: 8 }}>
                                              {t('app.theme.data_table.density_hint')}
                                          </div>
                                      </div>
                                      <div>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                                              <div style={{ fontWeight: 500 }}>{t('app.theme.data_table.font_size')}</div>
                                              <Button
                                                  size="small"
                                                  type={dataTableFontSizeFollowsGlobal ? 'primary' : 'default'}
                                                  onClick={() => setAppearance({
                                                      dataTableFontSizeFollowGlobal: !dataTableFontSizeFollowsGlobal,
                                                      dataTableFontSize: dataTableFontSizeFollowsGlobal
                                                          ? sanitizeDataTableFontSize(appearance.dataTableFontSize)
                                                          : null,
                                                  })}
                                              >
                                                  {t('app.theme.data_table.follow_global')}
                                              </Button>
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                              <Slider
                                                  min={10}
                                                  max={18}
                                                  step={1}
                                                  disabled={dataTableFontSizeFollowsGlobal}
                                                  value={effectiveDataTableFontSize}
                                                  onChange={(value) => setAppearance({
                                                      dataTableFontSize: sanitizeDataTableFontSize(value),
                                                      dataTableFontSizeFollowGlobal: false,
                                                  })}
                                                  style={{ flex: 1 }}
                                              />
                                              <span style={{ width: 56 }}>{effectiveDataTableFontSize}px</span>
                                          </div>
                                      </div>
                                      <div>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                                              <div style={{ fontWeight: 500 }}>{t('app.theme.data_table.sidebar_tree_font_size')}</div>
                                              <Button
                                                  size="small"
                                                  type={sidebarTreeFontSizeFollowsGlobal ? 'primary' : 'default'}
                                                  onClick={() => setAppearance({
                                                      sidebarTreeFontSizeFollowGlobal: !sidebarTreeFontSizeFollowsGlobal,
                                                      sidebarTreeFontSize: sidebarTreeFontSizeFollowsGlobal
                                                          ? sanitizeSidebarTreeFontSize(appearance.sidebarTreeFontSize)
                                                          : null,
                                                  })}
                                              >
                                                  {t('app.theme.data_table.follow_global')}
                                              </Button>
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                              <Slider
                                                  min={10}
                                                  max={18}
                                                  step={1}
                                                  disabled={sidebarTreeFontSizeFollowsGlobal}
                                                  value={effectiveSidebarTreeFontSize}
                                                  onChange={(value) => setAppearance({
                                                      sidebarTreeFontSize: sanitizeSidebarTreeFontSize(value),
                                                      sidebarTreeFontSizeFollowGlobal: false,
                                                  })}
                                                  style={{ flex: 1 }}
                                              />
                                              <span style={{ width: 56 }}>{effectiveSidebarTreeFontSize}px</span>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                              {isMacRuntime ? (
                                  <div style={utilityPanelStyle}>
                                      <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.mac_window.title')}</div>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                          <div>
                                              <div style={{ fontWeight: 500 }}>{t('app.theme.mac_window.use_native_controls')}</div>
                                              <div style={{ ...utilityMutedTextStyle, marginTop: 4 }}>{t('app.theme.mac_window.use_native_controls_hint')}</div>
                                          </div>
                                          <Switch
                                              checked={appearance.useNativeMacWindowControls === true}
                                              onChange={(checked) => setAppearance({ useNativeMacWindowControls: checked })}
                                          />
                                      </div>
                                      <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)', marginTop: 8 }}>
                                          {t('app.theme.mac_window.restart_hint')}
                                      </div>
                                  </div>
                              ) : null}
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.theme.startup_window.title')}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                      <span>{isWindowsRuntime ? t('app.theme.startup_window.fullscreen_windows') : t('app.theme.startup_window.fullscreen')}</span>
                                      <Switch checked={startupFullscreen} onChange={(checked) => setStartupFullscreen(checked)} />
                                  </div>
                                  <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)', marginTop: 4 }}>
                                      {isWindowsRuntime ? t('app.theme.startup_window.windows_hint') : t('app.theme.startup_window.hint')}
                                  </div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 12 }}>
                                  <Button
                                       onClick={() => {
                                           setUiScale(DEFAULT_UI_SCALE);
                                           setFontSize(DEFAULT_FONT_SIZE);
                                           setAppearance({ ...DEFAULT_APPEARANCE });
                                       }}
                                   >
                                       {t('app.theme.action.restore_defaults')}
                                  </Button>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </Modal>
          )}

          {isShortcutModalOpen && (
          <Modal
              title={renderUtilityModalTitle(
                  <LinkOutlined />,
                  t('app.shortcuts.title'),
                  t('app.shortcuts.description'),
              )}
              open={isShortcutModalOpen}
              onCancel={() => {
                  setIsShortcutModalOpen(false);
                  setCapturingShortcutAction(null);
                  setToolCenterBackGroupKey(null);
              }}
              width={760}
              centered
              style={{ top: 0, maxHeight: 'calc(100vh - 80px)' }}
              styles={{
                  content: {
                      ...utilityModalShellStyle,
                      height: 'min(760px, calc(100vh - 80px))',
                      display: 'flex',
                      flexDirection: 'column',
                  },
                  header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
                  body: { paddingTop: 8, overflow: 'hidden', flex: 1, minHeight: 0 },
                  footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 }
              }}
              footer={[
                  <Button
                      key="reset"
                      onClick={() => {
                           resetShortcutOptions();
                           setCapturingShortcutAction(null);
                           void message.success(t('app.shortcuts.message.restored_defaults'));
                       }}
                   >
                       {t('app.shortcuts.action.restore_defaults')}
                   </Button>,
                  <Button
                      key="close"
                      type="primary"
                      onClick={() => {
                          setIsShortcutModalOpen(false);
                          setCapturingShortcutAction(null);
                      }}
                  >
                       {t('common.close')}
                  </Button>,
                  toolCenterBackGroupKey === 'workspace' ? (
                    <Button
                        key="back"
                        onClick={() => handleReturnToToolCenter(() => {
                            setIsShortcutModalOpen(false);
                            setCapturingShortcutAction(null);
                        })}
                    >
                        {t('common.back_to_previous')}
                    </Button>
                  ) : null,
              ]}
          >
              <div data-gonavi-shortcut-modal-scroll="true" style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8, paddingRight: 8 }}>
                  <div style={utilityPanelStyle}>
                      <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>
                           {t('app.shortcuts.capture_hint')}
                      </div>
                  </div>
                  {SHORTCUT_ACTION_ORDER.map((action) => {
                      const meta = SHORTCUT_ACTION_META[action];
                      if (meta.platformOnly === 'mac' && !isMacRuntime) {
                          return null;
                      }
                      const binding = resolveShortcutBinding(shortcutOptions, action, activeShortcutPlatform);
                      const isCapturing = capturingShortcutAction === action;
                      const conflicts = shortcutConflictMap[action];
                      const conflictInfo = conflicts?.length ? splitConflictsByContext(conflicts) : null;
                      return (
                          <div
                              key={action}
                              style={{
                                  ...utilityPanelStyle,
                                  display: 'grid',
                                  gridTemplateColumns: '1fr auto',
                                  gap: 12,
                                  alignItems: 'center',
                                  padding: '10px 12px',
                              }}
                          >
                              <div>
                                  <div style={{ fontWeight: 500 }}>{meta.label}</div>
                                  <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>{meta.description}</div>
                                  {conflictInfo && (
                                      <div style={{ fontSize: 11, color: darkMode ? '#faad14' : '#d48806', marginTop: 2 }}>
                                          {conflictInfo.hasMonaco && (
                                              <>⚠ {t('app.shortcuts.message.reserved_conflict_info', { labels: conflictInfo.monacoLabels })}</>
                                           )}
                                           {conflictInfo.hasOther && (
                                              <>⚠ {t('app.shortcuts.message.reserved_conflict_warning', { contexts: conflictInfo.otherContexts, labels: conflictInfo.otherLabels })}</>
                                           )}
                                      </div>
                                  )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Input
                                      readOnly
                                      value={isCapturing ? t('app.shortcuts.capture_waiting') : getShortcutDisplayLabel(binding.combo, activeShortcutPlatform)}
                                      style={{ width: 180, fontFamily: resolvedMonoFontFamily }}
                                  />
                                  <Button
                                      size="small"
                                      onClick={() => setCapturingShortcutAction((prev) => (prev === action ? null : action))}
                                  >
                                      {isCapturing ? t('common.cancel') : t('app.shortcuts.action.record')}
                                  </Button>
                                  <Switch
                                      checked={binding.enabled}
                                      onChange={(checked) => updateShortcut(action, { enabled: checked }, activeShortcutPlatform)}
                                  />
                              </div>
                          </div>
                      );
                  })}
              </div>
          </Modal>
          )}
          {isSnippetModalOpen && (
          <SnippetSettingsModal
              open={isSnippetModalOpen}
              onClose={() => {
                  setIsSnippetModalOpen(false);
                  setToolCenterBackGroupKey(null);
              }}
              onBack={toolCenterBackGroupKey === 'workspace' ? () => handleReturnToToolCenter(() => setIsSnippetModalOpen(false)) : undefined}
              darkMode={darkMode}
              overlayTheme={overlayTheme}
          />
          )}
          {isProxyModalOpen && (
          <Modal
              title={renderUtilityModalTitle(<GlobalOutlined />, t('app.proxy.title'), t('app.proxy.description'))}
              open={isProxyModalOpen}
              onCancel={handleCloseGlobalProxySettings}
              footer={null}
              width={520}
              styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 } }}
          >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
                  <div style={utilityPanelStyle}>
                      <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('app.proxy.section_title')}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span>{t('app.proxy.enable')}</span>
                          <Switch checked={globalProxy.enabled} onChange={(checked) => setGlobalProxy({ enabled: checked })} />
                      </div>
                      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, opacity: globalProxy.enabled ? 1 : 0.7 }}>
                          <div>
                              <div style={{ marginBottom: 6, fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>{t('app.proxy.type')}</div>
                              <Select
                                  value={globalProxy.type}
                                  disabled={!globalProxy.enabled}
                                  options={[
                                      { value: 'socks5', label: 'SOCKS5' },
                                      { value: 'http', label: 'HTTP' },
                                  ]}
                                  onChange={(value) => setGlobalProxy({ type: value as 'socks5' | 'http' })}
                              />
                          </div>
                          <div>
                              <div style={{ marginBottom: 6, fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>{t('app.proxy.port')}</div>
                              <InputNumber
                                  min={1}
                                  max={65535}
                                  style={{ width: '100%' }}
                                  value={globalProxy.port}
                                  disabled={!globalProxy.enabled}
                                  onChange={(value) => setGlobalProxy({
                                      port: typeof value === 'number' ? value : (globalProxy.type === 'http' ? 8080 : 1080),
                                  })}
                              />
                          </div>
                          <div style={{ gridColumn: '1 / span 2' }}>
                              <div style={{ marginBottom: 6, fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>{t('app.proxy.host')}</div>
                              <Input
                                  placeholder={t('app.proxy.host_placeholder')}
                                  value={globalProxy.host}
                                  disabled={!globalProxy.enabled}
                                  onChange={(e) => setGlobalProxy({ host: e.target.value })}
                              />
                          </div>
                          <div>
                              <div style={{ marginBottom: 6, fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>{t('app.proxy.username_optional')}</div>
                              <Input
                                  placeholder="proxy-user"
                                  value={globalProxy.user}
                                  disabled={!globalProxy.enabled}
                                  onChange={(e) => setGlobalProxy({ user: e.target.value })}
                              />
                          </div>
                          <div>
                              <div style={{ marginBottom: 6, fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>{t('app.proxy.password_optional')}</div>
                              <Input.Password
                                  placeholder="proxy-password"
                                  value={globalProxy.password}
                                  disabled={!globalProxy.enabled}
                                  onChange={(e) => setGlobalProxy({ password: e.target.value })}
                              />
                          </div>
                      </div>
                      <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)', marginTop: 6 }}>
                          {t('app.proxy.scope_hint')}
                      </div>
                  </div>
              </div>
          </Modal>
          )}

          <Modal
              title={updateDownloadProgress.version
                  ? t('app.about.download_progress.title_with_version', { version: updateDownloadProgress.version })
                  : t('app.about.download_progress.title')}
              open={updateDownloadProgress.open}
              closable
              maskClosable
              keyboard
              onCancel={hideUpdateDownloadProgress}
              footer={updateDownloadProgress.status === 'start' || updateDownloadProgress.status === 'downloading' ? [
                  <Button
                      key="background"
                      onClick={() => {
                          markUpdateProgressDismissed();
                          hideUpdateDownloadProgress();
                      }}
                  >
                      {t('app.about.action.hide_to_background')}
                  </Button>
              ] : (updateDownloadProgress.status === 'done' ? [
                  <Button key="close" onClick={hideUpdateDownloadProgress}>{t('common.close')}</Button>,
                  <Button key="install" type="primary" onClick={handleInstallFromProgress}>
                      {t('app.about.action.install_update')}
                  </Button>
              ] : (updateDownloadProgress.status === 'error' ? [
                  <Button key="close" onClick={hideUpdateDownloadProgress}>{t('common.close')}</Button>
              ] : null))}
          >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Progress
                      percent={Math.round(updateDownloadProgress.percent)}
                      status={updateDownloadProgress.status === 'error' ? 'exception' : (updateDownloadProgress.status === 'done' ? 'success' : 'active')}
                  />
                  <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>
                      {`${formatBytes(updateDownloadProgress.downloaded)} / ${formatBytes(updateDownloadProgress.total)}`}
                  </div>
                  {updateDownloadProgress.message ? (
                      <div style={{ fontSize: 12, color: '#ff4d4f' }}>{updateDownloadProgress.message}</div>
                  ) : null}
              </div>
          </Modal>

          {showLinuxResizeHandles && (
              <>
                  {/* Linux Mint 下 frameless 仅局部可缩放：补四边四角命中层 */}
                  <div style={{ ...linuxResizeHandleStyleBase, top: 0, left: 14, right: 14, height: 6, cursor: 'ns-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, bottom: 0, left: 14, right: 14, height: 6, cursor: 'ns-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, top: 14, bottom: 14, left: 0, width: 6, cursor: 'ew-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, top: 14, bottom: 14, right: 0, width: 6, cursor: 'ew-resize' }} />

                  <div style={{ ...linuxResizeHandleStyleBase, top: 0, left: 0, width: 14, height: 14, cursor: 'nwse-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, top: 0, right: 0, width: 14, height: 14, cursor: 'nesw-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, bottom: 0, left: 0, width: 14, height: 14, cursor: 'nesw-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, bottom: 0, right: 0, width: 14, height: 14, cursor: 'nwse-resize' }} />
              </>
          )}
          
          {/* Ghost Resize Line for Sidebar */}
          <div 
              ref={ghostRef}
              style={{
                  position: 'fixed',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: '4px',
                  background: resizeGuideColor,
                  zIndex: 9999,
                  pointerEvents: 'none',
                  display: 'none'
              }}
          />
          
          {/* Ghost Resize Line for Log Panel */}
          <div 
              ref={logGhostRef}
              style={{
                  position: 'fixed',
                  left: sidebarWidth, // Start from sidebar edge
                  right: 0,
                  height: '4px',
                  background: resizeGuideColor,
                  zIndex: 9999,
                  pointerEvents: 'none',
                  display: 'none',
                  cursor: 'row-resize'
              }}
          />
        </Layout>
    </ConfigProvider>
  );
}

export default App;
