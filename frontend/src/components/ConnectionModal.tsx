import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Button,
  message,
  Checkbox,
  Select,
  Alert,
  Card,
  Row,
  Col,
  Typography,
  Space,
  Table,
  Tag,
  Switch,
} from "antd";
import {
  DatabaseOutlined,
  FileTextOutlined,
  CloudOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LinkOutlined,
  EditOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
  ApiOutlined,
  ClusterOutlined,
  CodeOutlined,
  GatewayOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  getDbIcon,
  getDbDefaultColor,
  getDbIconLabel,
  DB_ICON_TYPES,
  PRESET_ICON_COLORS,
} from "./DatabaseIcons";
import { useStore } from "../store";
import { buildOverlayWorkbenchTheme } from "../utils/overlayWorkbenchTheme";
import {
  isMacLikePlatform,
  normalizeOpacityForPlatform,
  resolveAppearanceValues,
} from "../utils/appearance";
import { t } from "../i18n";
import {
  getConnectionConfigLayoutKindLabel,
  getConnectionConfigSectionCopy,
  getStoredSecretPlaceholder,
  normalizeConnectionSecretErrorMessage,
  resolveConnectionConfigLayout,
  summarizeConnectionTestFailureMessage,
  type ConnectionConfigSectionKey,
} from "../utils/connectionModalPresentation";
import { resolveConnectionSecretDraft } from "../utils/connectionSecretDraft";
import { getCustomConnectionDsnValidationMessage } from "../utils/customConnectionDsn";
import { mergeParsedUriValuesForForm } from "../utils/connectionUriMerge";
import { buildRpcConnectionConfig } from "../utils/connectionRpcConfig";
import { getCustomConnectionDriverHelp } from "../utils/driverImportGuidance";
import { isBackendCancelledResult } from "../utils/connectionExport";
import {
  buildRedisUriFromValues,
  parseRedisUriToFormValues,
  resolveRedisConfigDraft,
} from "../utils/redisConnectionUri";
import {
  buildConnectionTypeGroups,
  getAllConnectionTypeCatalogItems,
  getConnectionTypeDefaultPort as getDefaultPortByType,
  getConnectionTypeHint,
} from "../utils/connectionTypeCatalog";
import {
  isFileDatabaseType,
  isMySQLCompatibleType,
  isPostgresCompatibleSSLType,
  singleHostUriSchemesByType,
  supportsConnectionParamsForType,
  supportsSSLCAPathForType,
  supportsSSLClientCertificateForType,
  supportsSSLForType,
} from "../utils/connectionTypeCapabilities";
import {
  normalizeDriverType,
  resolveConnectionDriverType,
  type DriverStatusSnapshot,
} from "../utils/connectionDriverType";
import {
  describeUnsupportedOceanBaseProtocol,
  normalizeOceanBaseProtocol,
  OCEANBASE_PROTOCOL_PARAM_KEYS,
  resolveOceanBaseProtocolFromQueryText as resolveOceanBaseProtocolQueryText,
  type OceanBaseProtocol,
} from "../utils/oceanBaseProtocol";
import {
  applyNoAutoCapAttributes,
  noAutoCapInputProps,
} from "../utils/inputAutoCap";
import {
  buildDefaultJVMConnectionValues,
  buildJVMConnectionConfig,
  hasUnsupportedJVMDiagnosticTransport,
  hasUnsupportedJVMEditableModes,
  JVM_EDITABLE_MODES,
  normalizeEditableJVMModes,
  resolveEditableJVMModeSelection,
} from "../utils/jvmConnectionConfig";
import { resolveJVMModeMeta } from "../utils/jvmRuntimePresentation";
import {
  DBGetDatabases,
  GetDriverStatusList,
  MongoDiscoverMembers,
  TestConnection,
  RedisConnect,
  RedisGetDatabases,
  SelectDatabaseFile,
  SelectCertificateFile,
  SelectSSHKeyFile,
  TestJVMConnection,
} from "../../wailsjs/go/app/App";
import { ConnectionConfig, MongoMemberInfo, SavedConnection } from "../types";

const { Text } = Typography;
type EditableJVMMode = (typeof JVM_EDITABLE_MODES)[number];
type ChoiceCardOption = {
  value: string;
  label: string;
  description?: string;
};
type ClickHouseProtocolChoice = "auto" | "http" | "native";
type OceanBaseProtocolChoice = OceanBaseProtocol;
const MAX_URI_LENGTH = 4096;
const MAX_CONNECTION_PARAMS_LENGTH = 4096;
const MAX_URI_HOSTS = 32;
const MAX_TIMEOUT_SECONDS = 3600;
const PRIMARY_USERNAME_OPTIONAL_TYPES = new Set([
  "mongodb",
  "elasticsearch",
  "chroma",
  "qdrant",
  "rocketmq",
  "mqtt",
  "kafka",
  "rabbitmq",
]);
const CONNECTION_MODAL_WIDTH = 960;
const CONNECTION_MODAL_BODY_HEIGHT = 620;
const REDIS_DEFAULT_DATABASE_COUNT = 16;
const STEP1_SIDEBAR_DIVIDER_DARK = "rgba(255, 255, 255, 0.16)";
const STEP1_SIDEBAR_DIVIDER_LIGHT = "rgba(0, 0, 0, 0.08)";
const CLICKHOUSE_PROTOCOL_OPTIONS: Array<{
  value: ClickHouseProtocolChoice;
  label?: string;
  labelKey?: string;
}> = [
  { value: "auto", labelKey: "connection.modal.field.clickHouseProtocol.auto" },
  { value: "http", label: "HTTP" },
  { value: "native", label: "Native" },
];
const OCEANBASE_PROTOCOL_OPTIONS: Array<{
  value: OceanBaseProtocolChoice;
  label: string;
}> = [
  { value: "mysql", label: "MySQL" },
  { value: "oracle", label: "Oracle" },
];

const normalizeRedisDatabaseIndex = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
};

const buildRedisDatabaseList = (...values: unknown[]): number[] => {
  const indexes = new Set<number>();
  for (let i = 0; i < REDIS_DEFAULT_DATABASE_COUNT; i += 1) {
    indexes.add(i);
  }
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    const index = normalizeRedisDatabaseIndex(value);
    if (index !== null) {
      indexes.add(index);
    }
  };
  values.forEach(collect);
  return Array.from(indexes).sort((a, b) => a - b);
};

const extractRedisDatabaseList = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const indexes = new Set<number>();
  value.forEach((row: any) => {
    const index = normalizeRedisDatabaseIndex(row?.index ?? row?.Index);
    if (index !== null) {
      indexes.add(index);
    }
  });
  const result = Array.from(indexes).sort((a, b) => a - b);
  return result.length > 0 ? result : buildRedisDatabaseList();
};

const normalizeRedisDatabaseSelection = (
  value: unknown,
  supportedDbs: number[],
): number[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const supported = new Set(supportedDbs);
  const selected = Array.from(
    new Set(
      value
        .map(normalizeRedisDatabaseIndex)
        .filter((index): index is number => index !== null)
        .filter((index) => supported.size === 0 || supported.has(index)),
    ),
  ).sort((a, b) => a - b);
  return selected.length > 0 ? selected : undefined;
};

const normalizeClickHouseProtocolValue = (
  value: unknown,
): ClickHouseProtocolChoice => {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (text === "http" || text === "https") return "http";
  if (text === "native" || text === "tcp") return "native";
  return "auto";
};
const normalizeOceanBaseProtocolValue = (
  value: unknown,
): OceanBaseProtocolChoice => {
  return normalizeOceanBaseProtocol(value) || "mysql";
};
const resolveOceanBaseProtocolValue = (
  value: unknown,
): OceanBaseProtocolChoice | undefined => {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return undefined;
  return normalizeOceanBaseProtocol(text);
};
const resolveOceanBaseProtocolFromQueryText = (
  value: unknown,
): OceanBaseProtocolChoice | undefined => {
  return resolveOceanBaseProtocolQueryText(value).protocol;
};
const resolveOceanBaseProtocolForConfig = (
  config: Partial<ConnectionConfig>,
): OceanBaseProtocolChoice => {
  return (
    resolveOceanBaseProtocolValue(config.oceanBaseProtocol) ||
    resolveOceanBaseProtocolFromQueryText(config.connectionParams) ||
    resolveOceanBaseProtocolFromQueryText(config.uri) ||
    "mysql"
  );
};
type ConnectionSecretKey =
  | "primaryPassword"
  | "sshPassword"
  | "proxyPassword"
  | "httpTunnelPassword"
  | "mysqlReplicaPassword"
  | "mongoReplicaPassword"
  | "redisSentinelPassword"
  | "opaqueURI"
  | "opaqueDSN";

type ConnectionSecretClearState = Record<ConnectionSecretKey, boolean>;

type UriFeedbackState = {
  type: "success" | "warning" | "error";
  messageKey: string;
};

type TestFailureKind =
  | "validation"
  | "runtime"
  | "driver_unavailable"
  | "secret_blocked";

type TestResultState =
  | {
      type: "success";
      message: string;
    }
  | {
      type: "error";
      kind: TestFailureKind;
      reason: string;
      fallbackKey: string;
    };

const createEmptyConnectionSecretClearState =
  (): ConnectionSecretClearState => ({
    primaryPassword: false,
    sshPassword: false,
    proxyPassword: false,
    httpTunnelPassword: false,
    mysqlReplicaPassword: false,
    mongoReplicaPassword: false,
    redisSentinelPassword: false,
    opaqueURI: false,
    opaqueDSN: false,
  });

const resolveInitialSecretFieldValue = (
  initialValues: SavedConnection | null | undefined,
  fieldName: string,
): string => {
  if (!initialValues) {
    return "";
  }

  const config = initialValues.config || ({} as ConnectionConfig);
  switch (fieldName) {
    case "password":
      return String(config.password || "");
    case "sshPassword":
      return String(config.ssh?.password || "");
    case "proxyPassword":
      return String(config.proxy?.password || "");
    case "httpTunnelPassword":
      return String(config.httpTunnel?.password || "");
    case "mysqlReplicaPassword":
      return String(config.mysqlReplicaPassword || "");
    case "mongoReplicaPassword":
      return String(config.mongoReplicaPassword || "");
    case "redisSentinelPassword":
      return String(config.redisSentinelPassword || "");
    case "uri":
      return String(config.uri || "");
    case "dsn":
      return String(config.dsn || "");
    default:
      return "";
  }
};

const ConnectionModal: React.FC<{
  open: boolean;
  onClose: () => void;
  initialValues?: SavedConnection | null;
  onOpenDriverManager?: () => void;
  onSaved?: (savedConnection: SavedConnection) => void | Promise<void>;
}> = ({ open, onClose, initialValues, onOpenDriverManager, onSaved }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [useSSL, setUseSSL] = useState(false);
  const [useSSH, setUseSSH] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [useHttpTunnel, setUseHttpTunnel] = useState(false);
  const [dbType, setDbType] = useState("mysql");
  const [step, setStep] = useState(1); // 1: Select Type, 2: Configure
  const [activeGroup, setActiveGroup] = useState(0); // Active category index in step 1
  const [activeConfigSection, setActiveConfigSection] = useState<
    "basic" | "network" | "appearance"
  >("basic");
  const [customIconType, setCustomIconType] = useState<string | undefined>(
    undefined,
  );
  const [customIconColor, setCustomIconColor] = useState<string | undefined>(
    undefined,
  );
  const [activeNetworkConfig, setActiveNetworkConfig] = useState<
    "ssl" | "ssh" | "proxy" | "httpTunnel"
  >("ssl");
  const [testResult, setTestResult] = useState<TestResultState | null>(null);
  const [testErrorLogOpen, setTestErrorLogOpen] = useState(false);
  const [dbList, setDbList] = useState<string[]>([]);
  const [redisDbList, setRedisDbList] = useState<number[]>([]);
  const [mongoMembers, setMongoMembers] = useState<MongoMemberInfo[]>([]);
  const [discoveringMembers, setDiscoveringMembers] = useState(false);
  const [uriFeedback, setUriFeedback] = useState<UriFeedbackState | null>(null);
  const [typeSelectWarning, setTypeSelectWarning] = useState<{
    driverName: string;
    reason: string;
  } | null>(null);
  const [driverStatusMap, setDriverStatusMap] = useState<
    Record<string, DriverStatusSnapshot>
  >({});
  const [driverStatusLoaded, setDriverStatusLoaded] = useState(false);
  const [selectingDbFile, setSelectingDbFile] = useState(false);
  const [selectingSSHKey, setSelectingSSHKey] = useState(false);
  const [selectingCertificateField, setSelectingCertificateField] = useState<
    "sslCAPath" | "sslCertPath" | "sslKeyPath" | null
  >(null);
  const [clearSecrets, setClearSecrets] = useState<ConnectionSecretClearState>(
    createEmptyConnectionSecretClearState,
  );
  const [primaryPasswordVisible, setPrimaryPasswordVisible] = useState(false);
  const testInFlightRef = useRef(false);
  const testTimerRef = useRef<number | null>(null);
  const addConnection = useStore((state) => state.addConnection);
  const updateConnection = useStore((state) => state.updateConnection);
  const theme = useStore((state) => state.theme);
  const appearance = useStore((state) => state.appearance);
  const languagePreference = useStore((state) => state.languagePreference);
  void languagePreference;
  const darkMode = theme === "dark";
  const resolvedAppearance = resolveAppearanceValues(appearance);
  const effectiveOpacity = normalizeOpacityForPlatform(
    resolvedAppearance.opacity,
  );
  const disableLocalBackdropFilter = isMacLikePlatform();
  const mysqlTopology = Form.useWatch("mysqlTopology", form) || "single";
  const rocketmqTopology = Form.useWatch("rocketmqTopology", form) || "single";
  const mqttTopology = Form.useWatch("mqttTopology", form) || "single";
  const kafkaTopology = Form.useWatch("kafkaTopology", form) || "single";
  const mongoTopology = Form.useWatch("mongoTopology", form) || "single";
  const mongoSrv = Form.useWatch("mongoSrv", form) || false;
  const redisTopology = Form.useWatch("redisTopology", form) || "single";
  const oceanBaseProtocol = normalizeOceanBaseProtocolValue(
    Form.useWatch("oceanBaseProtocol", form),
  );
  const sslMode = Form.useWatch("sslMode", form) || "preferred";
  const proxyType = Form.useWatch("proxyType", form) || "socks5";
  const customDriver = Form.useWatch("driver", form) || "";
  const mongoReadPreference =
    Form.useWatch("mongoReadPreference", form) || "primary";
  const mongoAuthMechanism = Form.useWatch("mongoAuthMechanism", form) || "";
  const jvmEnvironment = Form.useWatch("jvmEnvironment", form) || "dev";
  const jvmAllowedModes = Form.useWatch("jvmAllowedModes", form);
  const jvmPreferredMode = Form.useWatch("jvmPreferredMode", form) || "jmx";
  const jvmDiagnosticEnabled =
    Form.useWatch("jvmDiagnosticEnabled", form) || false;
  const jvmDiagnosticTransport =
    Form.useWatch("jvmDiagnosticTransport", form) || "agent-bridge";
  const normalizedJvmAllowedModes = useMemo(
    () => normalizeEditableJVMModes(jvmAllowedModes),
    [jvmAllowedModes],
  );
  const hasUnsupportedJvmModeSelection = useMemo(
    () =>
      hasUnsupportedJVMEditableModes({
        allowedModes: jvmAllowedModes,
        preferredMode: jvmPreferredMode,
      }),
    [jvmAllowedModes, jvmPreferredMode],
  );
  const isOceanBaseOracle = dbType === "oceanbase" && oceanBaseProtocol === "oracle";
  const isMySQLLike = isMySQLCompatibleType(dbType) && !isOceanBaseOracle;
  const isRocketMQ = dbType === "rocketmq";
  const isMQTT = dbType === "mqtt";
  const isKafka = dbType === "kafka";
  const isRabbitMQ = dbType === "rabbitmq";
  const supportsConnectionParams = supportsConnectionParamsForType(dbType);
  const isSSLType = supportsSSLForType(dbType);
  const supportsSSLCAPath = supportsSSLCAPathForType(dbType);
  const supportsSSLClientCertificate =
    supportsSSLClientCertificateForType(dbType);
  const sslHintText = isMySQLLike
    ? t("connection.modal.network.ssl.hint.mysqlCompatible")
    : isOceanBaseOracle
      ? t("connection.modal.network.ssl.hint.oceanBaseOracle")
      : dbType === "dameng"
      ? t("connection.modal.network.ssl.hint.dameng")
      : dbType === "sqlserver"
        ? t("connection.modal.network.ssl.hint.sqlserver")
        : dbType === "mongodb"
          ? t("connection.modal.network.ssl.hint.mongodb")
          : dbType === "oracle"
            ? t("connection.modal.network.ssl.hint.oracle")
            : dbType === "tdengine"
              ? t("connection.modal.network.ssl.hint.tdengine")
              : t("connection.modal.network.ssl.hint.default");
  const resolvedUriFeedbackMessage = uriFeedback
    ? t(uriFeedback.messageKey)
    : "";
  const resolvedTestResultMessage = !testResult
    ? ""
    : testResult.type === "success"
      ? String(testResult.message || "")
      : testResult.kind === "validation"
        ? t("connection.modal.test.validation")
        : t("connection.modal.test.failure", {
            reason: normalizeConnectionSecretErrorMessage(
              testResult.reason,
              t(testResult.fallbackKey),
            ),
          });

  const getSectionBg = (darkHex: string) => {
    if (!darkMode) {
      return `rgba(245, 245, 245, ${Math.max(effectiveOpacity, 0.92)})`;
    }
    const hex = darkHex.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(effectiveOpacity, 0.82)})`;
  };

  const step1SidebarDividerColor = darkMode
    ? STEP1_SIDEBAR_DIVIDER_DARK
    : STEP1_SIDEBAR_DIVIDER_LIGHT;
  const step1SidebarActiveBg = darkMode
    ? "rgba(246, 196, 83, 0.20)"
    : "#e6f4ff";
  const step1SidebarActiveColor = darkMode ? "#ffd666" : "#1677ff";
  const overlayTheme = useMemo(
    () =>
      buildOverlayWorkbenchTheme(darkMode, {
        disableBackdropFilter: disableLocalBackdropFilter,
      }),
    [darkMode, disableLocalBackdropFilter, appearance.uiVersion],
  );

  const tunnelSectionStyle: React.CSSProperties = {
    padding: "12px",
    background: getSectionBg("#2a2a2a"),
    borderRadius: 6,
    marginTop: 12,
    border: darkMode
      ? "1px solid rgba(255, 255, 255, 0.16)"
      : "1px solid rgba(0, 0, 0, 0.06)",
  };

  useEffect(() => {
    if (!open) return;
    const applyForConnectionModal = () => {
      document
        .querySelectorAll(
          ".connection-modal-wrap input, .connection-modal-wrap textarea",
        )
        .forEach(applyNoAutoCapAttributes);
    };
    applyForConnectionModal();
    const observer = new MutationObserver(() => {
      applyForConnectionModal();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [open]);

  const modalShellStyle = useMemo(
    () => ({
      background: overlayTheme.shellBg,
      border: overlayTheme.shellBorder,
      boxShadow: overlayTheme.shellShadow,
      backdropFilter: overlayTheme.shellBackdropFilter,
    }),
    [overlayTheme],
  );

  const modalInnerSectionStyle = useMemo(
    () => ({
      padding: 14,
      borderRadius: 14,
      border: overlayTheme.sectionBorder,
      background: overlayTheme.sectionBg,
    }),
    [overlayTheme],
  );

  const modalMutedTextStyle = useMemo(
    () => ({
      color: overlayTheme.mutedText,
      fontSize: 12,
      lineHeight: 1.6,
    }),
    [overlayTheme],
  );

  const renderStoredSecretControls = ({
    fieldName,
    clearKey,
    hasStoredSecret,
    clearLabel,
    description,
  }: {
    fieldName: string;
    clearKey: ConnectionSecretKey;
    hasStoredSecret?: boolean;
    clearLabel: string;
    description: string;
  }) => {
    if (!initialValues || !hasStoredSecret) {
      return null;
    }
    return (
      <Form.Item
        noStyle
        shouldUpdate={(prev, next) => prev[fieldName] !== next[fieldName]}
      >
        {({ getFieldValue }) => {
          const draftValue = getFieldValue(fieldName);
          const initialSecretValue = resolveInitialSecretFieldValue(
            initialValues,
            fieldName,
          );
          const normalizedDraftValue = String(draftValue ?? "");
          const matchesInitialSecret =
            initialSecretValue !== "" &&
            normalizedDraftValue === initialSecretValue;
          const hasDraftValue =
            normalizedDraftValue !== "" && !matchesInitialSecret;
          const cardBorder = darkMode
            ? "1px solid rgba(255,255,255,0.12)"
            : "1px solid rgba(16,24,40,0.08)";
          const cardBg = darkMode
            ? "rgba(255,255,255,0.03)"
            : "rgba(16,24,40,0.03)";
          const effectiveChecked = clearSecrets[clearKey] && !hasDraftValue;
          return (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 12px",
                borderRadius: 10,
                border: cardBorder,
                background: cardBg,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: overlayTheme.mutedText,
                  lineHeight: 1.6,
                  marginBottom: 8,
                }}
              >
                {hasDraftValue
                  ? t("connection.modal.secret.draftReplacement")
                  : description}
              </div>
              <Checkbox
                checked={effectiveChecked}
                disabled={hasDraftValue}
                onChange={(event) => {
                  const checked = event.target.checked;
                  if (checked && matchesInitialSecret) {
                    form.setFieldValue(fieldName, "");
                  }
                  setClearSecrets((prev) => ({ ...prev, [clearKey]: checked }));
                }}
              >
                {clearLabel}
              </Checkbox>
            </div>
          );
        }}
      </Form.Item>
    );
  };
  const renderConnectionModalTitle = (
    icon: React.ReactNode,
    title: string,
    description: string,
  ) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          background: overlayTheme.iconBg,
          color: overlayTheme.iconColor,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: overlayTheme.titleText,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 4,
            color: overlayTheme.mutedText,
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );

  const getConnectionOptionCardStyle = (
    _enabled: boolean,
  ): React.CSSProperties => ({
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid transparent",
    background: darkMode ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.72)",
    boxShadow: darkMode
      ? "inset 0 0 0 1px rgba(255,255,255,0.028)"
      : "inset 0 0 0 1px rgba(16,24,40,0.03)",
    transition: "all 120ms ease",
  });

  const jvmSectionCardStyle = (): React.CSSProperties => ({
    ...modalInnerSectionStyle,
    padding: 16,
  });

  const renderJvmSectionHeader = (
    icon: React.ReactNode,
    title: string,
    description: string,
    badge?: React.ReactNode,
  ) => (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            background: darkMode
              ? "rgba(255,214,102,0.14)"
              : "rgba(22,119,255,0.10)",
            color: darkMode ? "#ffd666" : "#1677ff",
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: darkMode ? "#f5f7ff" : "#162033",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            {title}
          </div>
          <div style={{ ...modalMutedTextStyle, marginTop: 4 }}>
            {description}
          </div>
        </div>
      </div>
      {badge ? <div style={{ flexShrink: 0 }}>{badge}</div> : null}
    </div>
  );

  const configSectionCardStyle = (): React.CSSProperties => ({
    padding: 16,
    borderRadius: 16,
    border: darkMode
      ? "1px solid rgba(255,255,255,0.08)"
      : "1px solid rgba(16,24,40,0.08)",
    background: darkMode
      ? "rgba(255,255,255,0.025)"
      : "rgba(255,255,255,0.70)",
    boxShadow: darkMode
      ? "inset 0 1px 0 rgba(255,255,255,0.04)"
      : "inset 0 1px 0 rgba(255,255,255,0.90)",
  });

  const renderConfigSectionCard = ({
    sectionKey,
    icon,
    children,
    badge,
  }: {
    sectionKey: ConnectionConfigSectionKey;
    icon: React.ReactNode;
    children: React.ReactNode;
    badge?: React.ReactNode;
  }) => {
    const copy = getConnectionConfigSectionCopy(sectionKey);
    return (
      <div
        data-connection-config-section={sectionKey}
        style={configSectionCardStyle()}
      >
        {renderJvmSectionHeader(icon, copy.title, copy.description, badge)}
        {children}
      </div>
    );
  };

  const clearConnectionTestResultForChoice = () => {
    if (testResult) {
      setTestResult(null);
      setTestErrorLogOpen(false);
    }
  };

  const setChoiceFieldValue = (fieldName: string, value: string | boolean) => {
    clearConnectionTestResultForChoice();
    form.setFieldValue(fieldName, value);
    if (
      fieldName === "mongoTopology" ||
      fieldName === "mongoSrv" ||
      fieldName === "host" ||
      fieldName === "port"
    ) {
      setMongoMembers([]);
    }
    if (fieldName === "redisTopology") {
      const nextRedisTopology = String(value || "single").toLowerCase();
      const currentRedisPort = Number(form.getFieldValue("port") || 0);
      if (
        nextRedisTopology === "sentinel" &&
        (!currentRedisPort || currentRedisPort === 6379)
      ) {
        form.setFieldValue("port", 26379);
      } else if (
        nextRedisTopology !== "sentinel" &&
        currentRedisPort === 26379
      ) {
        form.setFieldValue("port", 6379);
      }
      const supportedDbs = buildRedisDatabaseList(
        form.getFieldValue("redisDB"),
        form.getFieldValue("includeRedisDatabases"),
      );
      setRedisDbList(supportedDbs);
      form.setFieldValue(
        "includeRedisDatabases",
        normalizeRedisDatabaseSelection(
          form.getFieldValue("includeRedisDatabases"),
          supportedDbs,
        ),
      );
    }
    if (fieldName === "proxyType") {
      const nextType = String(value || "socks5").toLowerCase();
      const currentPort = Number(form.getFieldValue("proxyPort") || 0);
      if (nextType === "http") {
        if (!currentPort || currentPort === 1080) {
          form.setFieldValue("proxyPort", 8080);
        }
      } else if (!currentPort || currentPort === 8080) {
        form.setFieldValue("proxyPort", 1080);
      }
    }
  };

  const renderChoiceCards = ({
    fieldName,
    value,
    options,
    minWidth = 180,
    onSelect,
  }: {
    fieldName: string;
    value: string;
    options: ChoiceCardOption[];
    minWidth?: number;
    onSelect?: (value: string) => void;
  }) => (
    <>
      <Form.Item name={fieldName} hidden>
        <Input {...noAutoCapInputProps} />
      </Form.Item>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
          gap: 10,
        }}
      >
        {options.map((option) => {
          const active = String(value ?? "") === option.value;
          return (
            <button
              key={option.value || "empty"}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onSelect
                  ? onSelect(option.value)
                  : setChoiceFieldValue(fieldName, option.value)
              }
              style={{
                textAlign: "left",
                padding: "12px 14px",
                borderRadius: 14,
                border: active
                  ? darkMode
                    ? "1px solid rgba(255,214,102,0.42)"
                    : "1px solid rgba(22,119,255,0.36)"
                  : darkMode
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid rgba(16,24,40,0.08)",
                background: active
                  ? darkMode
                    ? "rgba(255,214,102,0.10)"
                    : "rgba(22,119,255,0.07)"
                  : darkMode
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(16,24,40,0.03)",
                color: darkMode ? "#f5f7ff" : "#162033",
                cursor: "pointer",
                transition: "all 120ms ease",
                boxShadow: active
                  ? darkMode
                    ? "0 0 0 2px rgba(255,214,102,0.10)"
                    : "0 0 0 2px rgba(22,119,255,0.08)"
                  : "none",
              }}
            >
              <Space size={8} wrap>
                <Text strong>{option.label}</Text>
                {active ? <Tag color="blue">{t("connection.modal.choice.current")}</Tag> : null}
              </Space>
              {option.description ? (
                <div style={{ ...modalMutedTextStyle, marginTop: 6 }}>
                  {option.description}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );

  const applyJvmModeSelection = (
    nextModes: EditableJVMMode[],
    preferredMode?: EditableJVMMode,
  ) => {
    const normalizedModes = normalizeEditableJVMModes(nextModes);
    const resolvedModes = normalizedModes.length ? normalizedModes : ["jmx"];
    const resolvedPreferred =
      preferredMode && resolvedModes.includes(preferredMode)
        ? preferredMode
        : resolvedModes.includes(jvmPreferredMode as EditableJVMMode)
          ? (jvmPreferredMode as EditableJVMMode)
          : resolvedModes[0];
    form.setFieldsValue({
      jvmAllowedModes: resolvedModes,
      jvmPreferredMode: resolvedPreferred,
      jvmEndpointEnabled: resolvedModes.includes("endpoint"),
      jvmAgentEnabled: resolvedModes.includes("agent"),
    });
  };

  const handleJvmModeCardSelect = (mode: EditableJVMMode) => {
    const enabled = normalizedJvmAllowedModes.includes(mode);
    applyJvmModeSelection(
      enabled ? normalizedJvmAllowedModes : [...normalizedJvmAllowedModes, mode],
      mode,
    );
  };

  const handleJvmModeToggle = (
    mode: EditableJVMMode,
    event: React.MouseEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
    const enabled = normalizedJvmAllowedModes.includes(mode);
    if (!enabled) {
      applyJvmModeSelection([...normalizedJvmAllowedModes, mode], mode);
      return;
    }
    if (normalizedJvmAllowedModes.length <= 1) {
      return;
    }
    const nextModes = normalizedJvmAllowedModes.filter((item) => item !== mode);
    applyJvmModeSelection(nextModes, nextModes[0]);
  };

  const fetchDriverStatusMap = async (): Promise<
    Record<string, DriverStatusSnapshot>
  > => {
    const result: Record<string, DriverStatusSnapshot> = {};
    const res = await GetDriverStatusList("", "");
    if (!res?.success) {
      return result;
    }
    const data = (res?.data || {}) as any;
    const drivers = Array.isArray(data.drivers) ? data.drivers : [];
    drivers.forEach((item: any) => {
      const type = normalizeDriverType(String(item.type || "").trim());
      if (!type) return;
      result[type] = {
        type,
        name: String(item.name || item.type || type).trim(),
        connectable: !!item.connectable,
        expectedRevision: String(item.expectedRevision || "").trim() || undefined,
        needsUpdate: !!item.needsUpdate,
        updateReason: String(item.updateReason || "").trim() || undefined,
        affectedConnections: Number.isFinite(Number(item.affectedConnections))
          ? Number(item.affectedConnections)
          : undefined,
        message: String(item.message || "").trim() || undefined,
      };
    });
    return result;
  };

  const refreshDriverStatus = async () => {
    try {
      const next = await fetchDriverStatusMap();
      setDriverStatusMap(next);
    } catch {
      setDriverStatusMap({});
    } finally {
      setDriverStatusLoaded(true);
    }
  };

  const resolveDriverUnavailableReason = async (
    type: string,
    driver?: string,
  ): Promise<string> => {
    const normalized = resolveConnectionDriverType(type, driver);
    if (!normalized || normalized === "custom") {
      return "";
    }
    let snapshot = driverStatusMap;
    if (!snapshot[normalized]) {
      snapshot = await fetchDriverStatusMap();
      setDriverStatusMap(snapshot);
    }
    const status = snapshot[normalized];
    if (!status || status.connectable) {
      return "";
    }
    return (
      status.message ||
      t("connection.modal.driver.unavailableFallback", {
        name: status.name || normalized,
      })
    );
  };

  const promptInstallDriver = (driverType: string, reason: string) => {
    const normalized = normalizeDriverType(driverType);
    const snapshot = driverStatusMap[normalized];
    const driverName =
      snapshot?.name || normalized || t("connection.modal.driver.currentFallback");
    Modal.confirm({
      title: t("connection.modal.driver.unavailableTitle", {
        name: driverName,
      }),
      content:
        reason ||
        t("connection.modal.driver.unavailableFallback", {
          name: driverName,
        }),
      okText: t("connection.modal.driver.installAction"),
      cancelText: t("common.action.cancel"),
      onOk: () => {
        onOpenDriverManager?.();
      },
    });
  };

  const parseHostPort = (
    raw: string,
    defaultPort: number,
  ): { host: string; port: number } | null => {
    const text = String(raw || "").trim();
    if (!text) {
      return null;
    }
    if (text.startsWith("[")) {
      const closingBracket = text.indexOf("]");
      if (closingBracket > 0) {
        const host = text.slice(1, closingBracket).trim();
        const portText = text
          .slice(closingBracket + 1)
          .trim()
          .replace(/^:/, "");
        const parsedPort = Number(portText);
        return {
          host: host || "localhost",
          port:
            Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
              ? parsedPort
              : defaultPort,
        };
      }
    }

    const colonCount = (text.match(/:/g) || []).length;
    if (colonCount === 1) {
      const splitIndex = text.lastIndexOf(":");
      const host = text.slice(0, splitIndex).trim();
      const portText = text.slice(splitIndex + 1).trim();
      const parsedPort = Number(portText);
      return {
        host: host || "localhost",
        port:
          Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
            ? parsedPort
            : defaultPort,
      };
    }

    return { host: text, port: defaultPort };
  };

  const toAddress = (host: string, port: number, defaultPort: number) => {
    const safeHost = String(host || "").trim() || "localhost";
    const safePort =
      Number.isFinite(Number(port)) && Number(port) > 0
        ? Number(port)
        : defaultPort;
    return `${safeHost}:${safePort}`;
  };

  const normalizeAddressList = (
    rawList: unknown,
    defaultPort: number,
  ): string[] => {
    const list = Array.isArray(rawList) ? rawList : [];
    const seen = new Set<string>();
    const result: string[] = [];
    list.forEach((entry) => {
      const parsed = parseHostPort(String(entry || ""), defaultPort);
      if (!parsed) {
        return;
      }
      const normalized = toAddress(parsed.host, parsed.port, defaultPort);
      if (seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      result.push(normalized);
    });
    return result;
  };

  const isValidUriHostEntry = (entry: string): boolean => {
    const text = String(entry || "").trim();
    if (!text) return false;
    if (text.length > 255) return false;
    // 拒绝明显的 DSN 片段或路径/空白，避免把非 URI 主机段误判为合法地址。
    if (/[()\\/\s]/.test(text)) return false;
    return true;
  };

  const normalizeMongoSrvHostList = (
    rawList: unknown,
    defaultPort: number,
  ): string[] => {
    const list = Array.isArray(rawList) ? rawList : [];
    const seen = new Set<string>();
    const result: string[] = [];
    list.forEach((entry) => {
      const parsed = parseHostPort(String(entry || ""), defaultPort);
      if (!parsed?.host) {
        return;
      }
      const host = String(parsed.host).trim();
      if (!host || seen.has(host)) {
        return;
      }
      seen.add(host);
      result.push(host);
    });
    return result;
  };

  const safeDecode = (text: string) => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  };

  const normalizeUriBool = (raw: unknown) => {
    const text = String(raw ?? "")
      .trim()
      .toLowerCase();
    return text === "1" || text === "true" || text === "yes" || text === "on";
  };

  const normalizeConnectionParamsText = (raw: unknown) => {
    let text = String(raw || "").trim();
    if (!text) return "";
    const queryIndex = text.indexOf("?");
    if (queryIndex >= 0) {
      text = text.slice(queryIndex + 1);
    }
    const hashIndex = text.indexOf("#");
    if (hashIndex >= 0) {
      text = text.slice(0, hashIndex);
    }
    return text.replace(/^[?&]+/, "").trim().slice(0, MAX_CONNECTION_PARAMS_LENGTH);
  };

  const serializeConnectionParams = (params: URLSearchParams) => {
    const cloned = new URLSearchParams();
    params.forEach((value, key) => {
      if (String(key || "").trim()) {
        cloned.append(key, value);
      }
    });
    return cloned.toString().slice(0, MAX_CONNECTION_PARAMS_LENGTH);
  };

  const normalizeOceanBaseConnectionParamsText = (
    rawParams: unknown,
    selectedProtocol: OceanBaseProtocolChoice,
  ) => {
    const normalizedParamsText = normalizeConnectionParamsText(rawParams);
    const protocolFromParams = resolveOceanBaseProtocolQueryText(normalizedParamsText);
    if (protocolFromParams.unsupportedValue) {
      throw new Error(describeUnsupportedOceanBaseProtocol(protocolFromParams.unsupportedValue, t));
    }
    const params = new URLSearchParams(normalizedParamsText);
    for (const key of OCEANBASE_PROTOCOL_PARAM_KEYS) {
      params.delete(key);
    }
    params.set("protocol", selectedProtocol);
    return params.toString().slice(0, MAX_CONNECTION_PARAMS_LENGTH);
  };

  const mergeConnectionParams = (
    params: URLSearchParams,
    rawParams: unknown,
  ) => {
    const text = normalizeConnectionParamsText(rawParams);
    if (!text) return;
    const extra = new URLSearchParams(text);
    extra.forEach((value, key) => {
      if (String(key || "").trim()) {
        params.set(key, value);
      }
    });
  };

  const normalizeFileDbPath = (rawPath: string): string => {
    let pathText = String(rawPath || "").trim();
    if (!pathText) {
      return "";
    }
    // 兼容 sqlite:///C:/... 或 sqlite:///C:\... 解析后多出的前导斜杠。
    if (/^\/[a-zA-Z]:[\\/]/.test(pathText)) {
      pathText = pathText.slice(1);
    }
    // 兼容历史版本把 Windows 文件路径误拼成 :3306:3306。
    const legacyMatch = pathText.match(/^([a-zA-Z]:[\\/].*?)(?::\d+)+$/);
    if (legacyMatch?.[1]) {
      return legacyMatch[1];
    }
    return pathText;
  };

  const parseMultiHostUri = (uriText: string, expectedScheme: string) => {
    const prefix = `${expectedScheme}://`;
    if (!uriText.toLowerCase().startsWith(prefix)) {
      return null;
    }
    let rest = uriText.slice(prefix.length);
    const hashIndex = rest.indexOf("#");
    if (hashIndex >= 0) {
      rest = rest.slice(0, hashIndex);
    }
    let queryText = "";
    const queryIndex = rest.indexOf("?");
    if (queryIndex >= 0) {
      queryText = rest.slice(queryIndex + 1);
      rest = rest.slice(0, queryIndex);
    }

    let pathText = "";
    const slashIndex = rest.indexOf("/");
    if (slashIndex >= 0) {
      pathText = rest.slice(slashIndex + 1);
      rest = rest.slice(0, slashIndex);
    }

    let hostText = rest;
    let username = "";
    let password = "";
    const atIndex = rest.lastIndexOf("@");
    if (atIndex >= 0) {
      const userInfo = rest.slice(0, atIndex);
      hostText = rest.slice(atIndex + 1);
      const colonIndex = userInfo.indexOf(":");
      if (colonIndex >= 0) {
        username = safeDecode(userInfo.slice(0, colonIndex));
        password = safeDecode(userInfo.slice(colonIndex + 1));
      } else {
        username = safeDecode(userInfo);
      }
    }

    const hosts = hostText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return {
      username,
      password,
      hosts,
      database: safeDecode(pathText),
      params: new URLSearchParams(queryText),
    };
  };

  const parseSingleHostUri = (
    uriText: string,
    expectedSchemes: string[],
    defaultPort: number,
  ): {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    params: URLSearchParams;
  } | null => {
    let parsed: ReturnType<typeof parseMultiHostUri> | null = null;
    for (const scheme of expectedSchemes) {
      parsed = parseMultiHostUri(uriText, scheme);
      if (parsed) {
        break;
      }
    }
    if (!parsed) {
      return null;
    }
    if (!parsed.hosts.length || parsed.hosts.length > MAX_URI_HOSTS) {
      return null;
    }
    if (parsed.hosts.some((entry) => !isValidUriHostEntry(entry))) {
      return null;
    }
    const hostList = normalizeAddressList(parsed.hosts, defaultPort);
    if (!hostList.length) {
      return null;
    }
    const primary = parseHostPort(
      hostList[0] || `localhost:${defaultPort}`,
      defaultPort,
    );
    return {
      host: primary?.host || "localhost",
      port: primary?.port || defaultPort,
      username: parsed.username,
      password: parsed.password,
      database: parsed.database || "",
      params: parsed.params,
    };
  };

  const parseClickHouseHTTPUriToValues = (
    uriText: string,
    fallbackPort?: number,
  ): Record<string, any> | null => {
    const trimmed = String(uriText || "").trim();
    const lower = trimmed.toLowerCase();
    const isHttps = lower.startsWith("https://");
    const isHttp = lower.startsWith("http://");
    if (!isHttp && !isHttps) {
      return null;
    }
    const defaultPort =
      Number.isFinite(Number(fallbackPort)) && Number(fallbackPort) > 0
        ? Number(fallbackPort)
        : isHttps
          ? 8443
          : 8123;
    const parsed = parseSingleHostUri(
      trimmed,
      [isHttps ? "https" : "http"],
      defaultPort,
    );
    if (!parsed) {
      return null;
    }
    const skipVerify = normalizeUriBool(parsed.params.get("skip_verify"));
    return {
      host: parsed.host,
      port: parsed.port,
      user: parsed.username,
      password: parsed.password,
      database: parsed.database || "",
      clickHouseProtocol: "http",
      useSSL: isHttps,
      sslMode: isHttps ? (skipVerify ? "skip-verify" : "required") : "disable",
      ...extractSSLPathValuesFromParams(parsed.params, "clickhouse"),
      connectionParams: serializeConnectionParams(parsed.params),
    };
  };

  const firstConnectionParamValue = (
    params: URLSearchParams,
    names: string[],
  ): string => {
    for (const name of names) {
      const value = String(params.get(name) || "").trim();
      if (value) return value;
    }
    return "";
  };

  const extractSSLPathValuesFromParams = (
    params: URLSearchParams,
    type: string,
  ): Record<string, string> => {
    const caPath = firstConnectionParamValue(params, [
      "sslCAPath",
      "ssl_ca_path",
      "sslrootcert",
      "sslRootCert",
      "tlsCAFile",
      "caFile",
      "certificate",
      "servercertificate",
      "serverCertificate",
    ]);
    const certPath = firstConnectionParamValue(params, [
      "sslCertPath",
      "ssl_cert_path",
      "SSL_CERT_PATH",
      "sslcert",
      "sslCert",
      "tlsCertificateFile",
    ]);
    const keyPath = firstConnectionParamValue(params, [
      "sslKeyPath",
      "ssl_key_path",
      "SSL_KEY_PATH",
      "sslkey",
      "sslKey",
      "tlsKeyFile",
    ]);
    return {
      ...(supportsSSLCAPathForType(type) && caPath ? { sslCAPath: caPath } : {}),
      ...(supportsSSLClientCertificateForType(type) && certPath ? { sslCertPath: certPath } : {}),
      ...(supportsSSLClientCertificateForType(type) && keyPath ? { sslKeyPath: keyPath } : {}),
    };
  };

  const appendSSLPathParamsForUri = (
    params: URLSearchParams,
    type: string,
    values: Record<string, any>,
  ) => {
    const caPath = String(values.sslCAPath || "").trim();
    const certPath = String(values.sslCertPath || "").trim();
    const keyPath = String(values.sslKeyPath || "").trim();
    const mode = String(values.sslMode || "preferred")
      .trim()
      .toLowerCase();
    if (supportsSSLCAPathForType(type) && caPath) {
      if (isPostgresCompatibleSSLType(type)) {
        if (mode !== "skip-verify" && mode !== "disable") {
          params.set("sslrootcert", caPath);
        }
      } else if (type === "sqlserver") {
        params.set("certificate", caPath);
      } else {
        params.set("sslCAPath", caPath);
      }
    }
    if (supportsSSLClientCertificateForType(type) && certPath) {
      if (type === "dameng") {
        params.set("SSL_CERT_PATH", certPath);
      } else if (isPostgresCompatibleSSLType(type)) {
        params.set("sslcert", certPath);
      } else {
        params.set("sslCertPath", certPath);
      }
    }
    if (supportsSSLClientCertificateForType(type) && keyPath) {
      if (type === "dameng") {
        params.set("SSL_KEY_PATH", keyPath);
      } else if (isPostgresCompatibleSSLType(type)) {
        params.set("sslkey", keyPath);
      } else {
        params.set("sslKeyPath", keyPath);
      }
    }
  };

  const parseUriToValues = (
    uriText: string,
    type: string,
  ): Record<string, any> | null => {
    const trimmedUri = String(uriText || "").trim();
    if (!trimmedUri) {
      return null;
    }
    if (trimmedUri.length > MAX_URI_LENGTH) {
      return null;
    }

    if (isMySQLCompatibleType(type)) {
      const mysqlDefaultPort = getDefaultPortByType(type);
      const parsed =
        parseMultiHostUri(trimmedUri, "mysql") ||
        parseMultiHostUri(trimmedUri, "goldendb") ||
        parseMultiHostUri(trimmedUri, "greatdb") ||
        parseMultiHostUri(trimmedUri, "gdb") ||
        parseMultiHostUri(trimmedUri, "jdbc:mysql") ||
        parseMultiHostUri(trimmedUri, "oceanbase") ||
        parseMultiHostUri(trimmedUri, "jdbc:oceanbase") ||
        parseMultiHostUri(trimmedUri, "starrocks") ||
        parseMultiHostUri(trimmedUri, "jdbc:starrocks") ||
        parseMultiHostUri(trimmedUri, "diros") ||
        parseMultiHostUri(trimmedUri, "doris");
      if (!parsed) {
        return null;
      }
      if (!parsed.hosts.length || parsed.hosts.length > MAX_URI_HOSTS) {
        return null;
      }
      if (parsed.hosts.some((entry) => !isValidUriHostEntry(entry))) {
        return null;
      }
      const hostList = normalizeAddressList(parsed.hosts, mysqlDefaultPort);
      if (!hostList.length) {
        return null;
      }
      const primary = parseHostPort(
        hostList[0] || `localhost:${mysqlDefaultPort}`,
        mysqlDefaultPort,
      );
      const timeoutValue = Number(parsed.params.get("timeout"));
      const topology = String(
        parsed.params.get("topology") || "",
      ).toLowerCase();
      const tlsValue = String(
        parsed.params.get("tls") || parsed.params.get("useSSL") || "",
      )
        .trim()
        .toLowerCase();
      const parsedOceanBaseProtocol =
        type === "oceanbase"
          ? normalizeOceanBaseProtocolValue(
              parsed.params.get("protocol") ||
                parsed.params.get("oceanBaseProtocol") ||
                parsed.params.get("oceanbaseProtocol") ||
                parsed.params.get("tenantMode") ||
                parsed.params.get("compatMode") ||
                parsed.params.get("mode"),
            )
          : undefined;
      const sslMode =
        tlsValue === "true"
          ? "required"
          : tlsValue === "skip-verify"
            ? "skip-verify"
            : tlsValue === "preferred"
              ? "preferred"
              : "disable";
      return {
        host: primary?.host || "localhost",
        port: primary?.port || mysqlDefaultPort,
        user: parsed.username,
        password: parsed.password,
        database: parsed.database || "",
        useSSL: sslMode !== "disable",
        sslMode,
        ...extractSSLPathValuesFromParams(parsed.params, type),
        oceanBaseProtocol: parsedOceanBaseProtocol,
        mysqlTopology:
          parsedOceanBaseProtocol === "oracle"
            ? "single"
            : hostList.length > 1 || topology === "replica"
              ? "replica"
              : "single",
        mysqlReplicaHosts: hostList.slice(1),
        connectionParams: serializeConnectionParams(parsed.params),
        timeout:
          Number.isFinite(timeoutValue) && timeoutValue > 0
            ? Math.min(3600, Math.trunc(timeoutValue))
            : undefined,
      };
    }

    if (isFileDatabaseType(type)) {
      const rawPath = trimmedUri
        .replace(/^sqlite:\/\//i, "")
        .replace(/^duckdb:\/\//i, "")
        .trim();
      if (!rawPath) {
        return null;
      }
      return { host: normalizeFileDbPath(safeDecode(rawPath)) };
    }

    if (type === "redis") {
      return parseRedisUriToFormValues(trimmedUri);
    }

    if (type === "mongodb") {
      const parsed =
        parseMultiHostUri(trimmedUri, "mongodb") ||
        parseMultiHostUri(trimmedUri, "mongodb+srv");
      if (!parsed) {
        return null;
      }
      if (!parsed.hosts.length || parsed.hosts.length > MAX_URI_HOSTS) {
        return null;
      }
      if (parsed.hosts.some((entry) => !isValidUriHostEntry(entry))) {
        return null;
      }
      const isSrv = trimmedUri.toLowerCase().startsWith("mongodb+srv://");
      const hostList = isSrv
        ? normalizeMongoSrvHostList(parsed.hosts, 27017)
        : normalizeAddressList(parsed.hosts, 27017);
      if (!hostList.length) {
        return null;
      }
      const primary = isSrv
        ? { host: hostList[0] || "localhost", port: 27017 }
        : parseHostPort(hostList[0] || "localhost:27017", 27017);
      const timeoutMs = Number(
        parsed.params.get("connectTimeoutMS") ||
          parsed.params.get("serverSelectionTimeoutMS"),
      );
      const tlsText = String(
        parsed.params.get("tls") || parsed.params.get("ssl") || "",
      )
        .trim()
        .toLowerCase();
      const tlsInsecureText = String(
        parsed.params.get("tlsInsecure") ||
          parsed.params.get("sslInsecure") ||
          "",
      )
        .trim()
        .toLowerCase();
      const tlsEnabled =
        tlsText === "1" ||
        tlsText === "true" ||
        tlsText === "yes" ||
        tlsText === "on";
      const tlsInsecure =
        tlsInsecureText === "1" ||
        tlsInsecureText === "true" ||
        tlsInsecureText === "yes" ||
        tlsInsecureText === "on";
      return {
        host: primary?.host || "localhost",
        port: primary?.port || 27017,
        user: parsed.username,
        password: parsed.password,
        database: parsed.database || "",
        useSSL: tlsEnabled,
        sslMode: tlsEnabled
          ? tlsInsecure
            ? "skip-verify"
            : "required"
          : "disable",
        ...extractSSLPathValuesFromParams(parsed.params, type),
        mongoTopology:
          hostList.length > 1 || !!parsed.params.get("replicaSet")
            ? "replica"
            : "single",
        mongoHosts: hostList.slice(1),
        mongoSrv: isSrv,
        mongoReplicaSet: parsed.params.get("replicaSet") || "",
        mongoAuthSource: parsed.params.get("authSource") || "",
        mongoReadPreference: parsed.params.get("readPreference") || "primary",
        mongoAuthMechanism: parsed.params.get("authMechanism") || "",
        connectionParams: serializeConnectionParams(parsed.params),
        timeout:
          Number.isFinite(timeoutMs) && timeoutMs > 0
            ? Math.min(MAX_TIMEOUT_SECONDS, Math.ceil(timeoutMs / 1000))
            : undefined,
        savePassword: true,
      };
    }

    if (type === "kafka") {
      const defaultPort = getDefaultPortByType(type);
      const parsed =
        parseMultiHostUri(trimmedUri, "kafka") ||
        parseMultiHostUri(trimmedUri, "apache-kafka") ||
        parseMultiHostUri(trimmedUri, "apache_kafka");
      if (!parsed) {
        return null;
      }
      if (!parsed.hosts.length || parsed.hosts.length > MAX_URI_HOSTS) {
        return null;
      }
      if (parsed.hosts.some((entry) => !isValidUriHostEntry(entry))) {
        return null;
      }
      const hostList = normalizeAddressList(parsed.hosts, defaultPort);
      if (!hostList.length) {
        return null;
      }
      const primary = parseHostPort(
        hostList[0] || `localhost:${defaultPort}`,
        defaultPort,
      );
      const tlsEnabled = normalizeUriBool(
        parsed.params.get("tls") ||
          parsed.params.get("ssl") ||
          parsed.params.get("useSSL") ||
          parsed.params.get("use_ssl"),
      );
      const skipVerify = normalizeUriBool(
        parsed.params.get("skip_verify") || parsed.params.get("skipVerify"),
      );
      const topology = String(parsed.params.get("topology") || "")
        .trim()
        .toLowerCase();
      const timeoutValue = Number(parsed.params.get("timeout"));
      return {
        host: primary?.host || "localhost",
        port: primary?.port || defaultPort,
        user: parsed.username,
        password: parsed.password,
        database: parsed.database || "",
        useSSL: tlsEnabled,
        sslMode: tlsEnabled ? (skipVerify ? "skip-verify" : "required") : "disable",
        ...extractSSLPathValuesFromParams(parsed.params, type),
        kafkaTopology:
          topology === "cluster" || hostList.length > 1 ? "cluster" : "single",
        kafkaHosts: hostList.slice(1),
        connectionParams: serializeConnectionParams(parsed.params),
        timeout:
          Number.isFinite(timeoutValue) && timeoutValue > 0
            ? Math.min(MAX_TIMEOUT_SECONDS, Math.trunc(timeoutValue))
            : undefined,
      };
    }

    if (type === "mqtt") {
      const defaultPort = getDefaultPortByType(type);
      const parsed =
        parseMultiHostUri(trimmedUri, "mqtt") ||
        parseMultiHostUri(trimmedUri, "mqtts") ||
        parseMultiHostUri(trimmedUri, "tcp") ||
        parseMultiHostUri(trimmedUri, "ssl") ||
        parseMultiHostUri(trimmedUri, "tls");
      if (!parsed) {
        return null;
      }
      if (!parsed.hosts.length || parsed.hosts.length > MAX_URI_HOSTS) {
        return null;
      }
      if (parsed.hosts.some((entry) => !isValidUriHostEntry(entry))) {
        return null;
      }
      const hostList = normalizeAddressList(parsed.hosts, defaultPort);
      if (!hostList.length) {
        return null;
      }
      const primary = parseHostPort(
        hostList[0] || `localhost:${defaultPort}`,
        defaultPort,
      );
      const lowerUri = trimmedUri.toLowerCase();
      const tlsEnabled =
        lowerUri.startsWith("mqtts://") ||
        lowerUri.startsWith("ssl://") ||
        lowerUri.startsWith("tls://") ||
        normalizeUriBool(
          parsed.params.get("tls") ||
            parsed.params.get("ssl") ||
            parsed.params.get("useSSL") ||
            parsed.params.get("use_ssl"),
        );
      const skipVerify = normalizeUriBool(
        parsed.params.get("skip_verify") || parsed.params.get("skipVerify"),
      );
      const topology = String(parsed.params.get("topology") || "")
        .trim()
        .toLowerCase();
      const timeoutValue = Number(parsed.params.get("timeout"));
      return {
        host: primary?.host || "localhost",
        port: primary?.port || defaultPort,
        user: parsed.username,
        password: parsed.password,
        database: parsed.database || "",
        useSSL: tlsEnabled,
        sslMode: tlsEnabled ? (skipVerify ? "skip-verify" : "required") : "disable",
        ...extractSSLPathValuesFromParams(parsed.params, type),
        mqttTopology:
          topology === "cluster" || hostList.length > 1 ? "cluster" : "single",
        mqttHosts: hostList.slice(1),
        connectionParams: serializeConnectionParams(parsed.params),
        timeout:
          Number.isFinite(timeoutValue) && timeoutValue > 0
            ? Math.min(MAX_TIMEOUT_SECONDS, Math.trunc(timeoutValue))
            : undefined,
      };
    }

    if (type === "rocketmq") {
      const defaultPort = getDefaultPortByType(type);
      const parsed =
        parseMultiHostUri(trimmedUri, "rocketmq") ||
        parseMultiHostUri(trimmedUri, "rmq");
      if (!parsed) {
        return null;
      }
      if (!parsed.hosts.length || parsed.hosts.length > MAX_URI_HOSTS) {
        return null;
      }
      if (parsed.hosts.some((entry) => !isValidUriHostEntry(entry))) {
        return null;
      }
      const hostList = normalizeAddressList(parsed.hosts, defaultPort);
      if (!hostList.length) {
        return null;
      }
      const primary = parseHostPort(
        hostList[0] || `localhost:${defaultPort}`,
        defaultPort,
      );
      const topology = String(parsed.params.get("topology") || "")
        .trim()
        .toLowerCase();
      const timeoutValue = Number(parsed.params.get("timeout"));
      return {
        host: primary?.host || "localhost",
        port: primary?.port || defaultPort,
        user: parsed.username,
        password: parsed.password,
        database: parsed.database || "",
        rocketmqTopology:
          topology === "cluster" || hostList.length > 1 ? "cluster" : "single",
        rocketmqHosts: hostList.slice(1),
        connectionParams: serializeConnectionParams(parsed.params),
        timeout:
          Number.isFinite(timeoutValue) && timeoutValue > 0
            ? Math.min(MAX_TIMEOUT_SECONDS, Math.trunc(timeoutValue))
            : undefined,
      };
    }

    if (type === "rabbitmq") {
      const defaultPort = getDefaultPortByType(type);
      const parsed = parseSingleHostUri(
        trimmedUri,
        ["rabbitmq", "http", "https"],
        defaultPort,
      );
      if (!parsed) {
        return null;
      }
      const lowerUri = trimmedUri.toLowerCase();
      const tlsEnabled =
        lowerUri.startsWith("https://") ||
        normalizeUriBool(
          parsed.params.get("tls") ||
            parsed.params.get("ssl") ||
            parsed.params.get("useSSL") ||
            parsed.params.get("use_ssl"),
        );
      const skipVerify = normalizeUriBool(
        parsed.params.get("skip_verify") || parsed.params.get("skipVerify"),
      );
      const timeoutValue = Number(parsed.params.get("timeout"));
      return {
        host: parsed.host,
        port: parsed.port,
        user: parsed.username,
        password: parsed.password,
        database: parsed.database || "",
        useSSL: tlsEnabled,
        sslMode: tlsEnabled ? (skipVerify ? "skip-verify" : "required") : "disable",
        ...extractSSLPathValuesFromParams(parsed.params, type),
        connectionParams: serializeConnectionParams(parsed.params),
        timeout:
          Number.isFinite(timeoutValue) && timeoutValue > 0
            ? Math.min(MAX_TIMEOUT_SECONDS, Math.trunc(timeoutValue))
            : undefined,
      };
    }

    if (type === "clickhouse") {
      const httpValues = parseClickHouseHTTPUriToValues(trimmedUri);
      if (httpValues) {
        return httpValues;
      }
    }

    const singleHostSchemes = singleHostUriSchemesByType[type];
    if (singleHostSchemes && singleHostSchemes.length > 0) {
      const parsed = parseSingleHostUri(
        trimmedUri,
        singleHostSchemes,
        getDefaultPortByType(type),
      );
      if (!parsed) {
        return null;
      }
      if (type === "oracle" && !String(parsed.database || "").trim()) {
        // Oracle 需要显式 service name，避免 URI 解析后放过必填校验。
        return null;
      }
      const parsedValues: Record<string, any> = {
        host: parsed.host,
        port: parsed.port,
        user: parsed.username,
        password: parsed.password,
        database: parsed.database,
      };
      if (supportsConnectionParamsForType(type)) {
        parsedValues.connectionParams = serializeConnectionParams(parsed.params);
      }

      if (supportsSSLForType(type)) {
        Object.assign(parsedValues, extractSSLPathValuesFromParams(parsed.params, type));
        const normalizeBool = (raw: unknown) => {
          const text = String(raw ?? "")
            .trim()
            .toLowerCase();
          return (
            text === "1" || text === "true" || text === "yes" || text === "on"
          );
        };
        if (
          type === "postgres" ||
          type === "kingbase" ||
          type === "highgo" ||
          type === "vastbase" ||
          type === "opengauss" ||
          type === "gaussdb"
        ) {
          const sslMode = String(parsed.params.get("sslmode") || "")
            .trim()
            .toLowerCase();
          if (sslMode) {
            parsedValues.useSSL = sslMode !== "disable" && sslMode !== "false";
            parsedValues.sslMode =
              sslMode === "disable" || sslMode === "false"
                ? "disable"
                : "required";
          }
        } else if (type === "sqlserver") {
          const encrypt = String(parsed.params.get("encrypt") || "")
            .trim()
            .toLowerCase();
          const trust = String(
            parsed.params.get("TrustServerCertificate") ||
              parsed.params.get("trustservercertificate") ||
              "",
          )
            .trim()
            .toLowerCase();
          const encrypted =
            encrypt === "true" ||
            encrypt === "mandatory" ||
            encrypt === "yes" ||
            encrypt === "1" ||
            encrypt === "strict";
          if (encrypted) {
            parsedValues.useSSL = true;
            parsedValues.sslMode =
              trust === "true" || trust === "1" || trust === "yes"
                ? "skip-verify"
                : "required";
          } else if (encrypt) {
            parsedValues.useSSL = false;
            parsedValues.sslMode = "disable";
          }
        } else if (type === "clickhouse") {
          parsedValues.clickHouseProtocol = normalizeClickHouseProtocolValue(
            parsed.params.get("protocol"),
          );
          const secure = String(
            parsed.params.get("secure") || parsed.params.get("tls") || "",
          )
            .trim()
            .toLowerCase();
          const skipVerify = normalizeBool(parsed.params.get("skip_verify"));
          if (secure) {
            parsedValues.useSSL = normalizeBool(secure);
            parsedValues.sslMode = skipVerify
              ? "skip-verify"
              : parsedValues.useSSL
                ? "required"
                : "disable";
          }
        } else if (type === "dameng") {
          const certPath = String(
            parsed.params.get("SSL_CERT_PATH") ||
              parsed.params.get("ssl_cert_path") ||
              parsed.params.get("sslCertPath") ||
              "",
          ).trim();
          const keyPath = String(
            parsed.params.get("SSL_KEY_PATH") ||
              parsed.params.get("ssl_key_path") ||
              parsed.params.get("sslKeyPath") ||
              "",
          ).trim();
          parsedValues.sslCertPath = certPath;
          parsedValues.sslKeyPath = keyPath;
          if (certPath || keyPath) {
            parsedValues.useSSL = true;
            parsedValues.sslMode = "required";
          }
        } else if (type === "oracle") {
          const ssl = String(
            parsed.params.get("SSL") || parsed.params.get("ssl") || "",
          )
            .trim()
            .toLowerCase();
          const sslVerify = String(
            parsed.params.get("SSL VERIFY") ||
              parsed.params.get("ssl verify") ||
              parsed.params.get("SSL_VERIFY") ||
              parsed.params.get("ssl_verify") ||
              "",
          )
            .trim()
            .toLowerCase();
          if (ssl) {
            parsedValues.useSSL = normalizeBool(ssl);
            if (!parsedValues.useSSL) {
              parsedValues.sslMode = "disable";
            } else {
              parsedValues.sslMode = normalizeBool(sslVerify || "true")
                ? "required"
                : "skip-verify";
            }
          }
        } else if (type === "tdengine") {
          const protocol = String(parsed.params.get("protocol") || "")
            .trim()
            .toLowerCase();
          const skipVerify = normalizeBool(parsed.params.get("skip_verify"));
          if (protocol === "wss") {
            parsedValues.useSSL = true;
            parsedValues.sslMode = skipVerify ? "skip-verify" : "required";
          } else if (protocol === "ws") {
            parsedValues.useSSL = false;
            parsedValues.sslMode = "disable";
          }
        } else if (type === "chroma" || type === "qdrant") {
          const tls = String(
            parsed.params.get("tls") ||
              parsed.params.get("ssl") ||
              parsed.params.get("useSSL") ||
              parsed.params.get("use_ssl") ||
              "",
          )
            .trim()
            .toLowerCase();
          const skipVerify = normalizeBool(
            parsed.params.get("skip_verify") || parsed.params.get("skipVerify"),
          );
          const enabled = tls ? normalizeBool(tls) : trimmedUri.toLowerCase().startsWith("https://");
          parsedValues.useSSL = enabled;
          parsedValues.sslMode = enabled ? (skipVerify ? "skip-verify" : "required") : "disable";
        }
      }
      return parsedValues;
    }

    return null;
  };

  const createUriAwareRequiredRule =
    (messageText: string, validateValue?: (value: unknown) => boolean) =>
    ({ getFieldValue }: { getFieldValue: (name: string) => unknown }) => ({
      validator(_: unknown, value: unknown) {
        const uriText = String(getFieldValue("uri") || "").trim();
        const type = String(getFieldValue("type") || dbType)
          .trim()
          .toLowerCase();
        if (uriText && parseUriToValues(uriText, type)) {
          return Promise.resolve();
        }
        const valid = validateValue
          ? validateValue(value)
          : String(value ?? "").trim() !== "";
        return valid
          ? Promise.resolve()
          : Promise.reject(new Error(messageText));
      },
    });

  const createCustomDsnRule = () => ({
    validator(_: unknown, value: unknown) {
      const validationMessage = getCustomConnectionDsnValidationMessage({
        dsnInput: value,
        hasStoredSecret: initialValues?.hasOpaqueDSN,
        clearStoredSecret: clearSecrets.opaqueDSN,
      });
      return validationMessage
        ? Promise.reject(new Error(validationMessage))
        : Promise.resolve();
    },
  });

  const getUriPlaceholder = () => {
    if (isMySQLCompatibleType(dbType)) {
      const defaultPort = getDefaultPortByType(dbType);
      const scheme =
        dbType === "diros" ? "doris" : dbType === "starrocks" ? "starrocks" : dbType === "oceanbase" ? "oceanbase" : dbType === "goldendb" ? "goldendb" : "mysql";
      if (dbType === "oceanbase") {
        return `${scheme}://sys%40oracle001:pass@127.0.0.1:${defaultPort}?protocol=oracle`;
      }
      return `${scheme}://user:pass@127.0.0.1:${defaultPort},127.0.0.2:${defaultPort}/db_name?topology=replica`;
    }
    if (isFileDatabaseType(dbType)) {
      return dbType === "duckdb"
        ? "duckdb:///Users/name/demo.duckdb"
        : "sqlite:///Users/name/demo.sqlite";
    }
    if (dbType === "mongodb") {
      return "mongodb+srv://user:pass@cluster0.example.com/db_name?authSource=admin&authMechanism=SCRAM-SHA-256";
    }
    if (dbType === "clickhouse") {
      return "clickhouse://default:pass@127.0.0.1:9000/default";
    }
    if (dbType === "chroma") {
      return "http://127.0.0.1:8000/default_database?tenant=default_tenant";
    }
    if (dbType === "qdrant") {
      return "http://127.0.0.1:6333";
    }
    if (dbType === "iotdb") {
      return "iotdb://root:root@127.0.0.1:6667/root.sg";
    }
    if (dbType === "rocketmq") {
      return "rocketmq://accessKey:secretKey@127.0.0.1:9876,127.0.0.2:9876/orders.events?topology=cluster&groupId=gonavi&namespace=prod&tag=TagA&pullBatchSize=32&startOffset=latest";
    }
    if (dbType === "mqtt") {
      return "mqtt://user:pass@127.0.0.1:1883/devices%2F%2B%2Ftelemetry?topology=cluster&clientId=gonavi-desktop&qos=1";
    }
    if (dbType === "kafka") {
      return "kafka://user:pass@127.0.0.1:9092,127.0.0.2:9092/orders.events?topology=cluster&groupId=analytics&mechanism=scram-sha-256";
    }
    if (dbType === "rabbitmq") {
      return "rabbitmq://guest:guest@127.0.0.1:15672/%2F?defaultQueue=orders.queue&exchange=events.topic&timeout=30";
    }
    if (dbType === "redis") {
      return t("connection.modal.example.or", {
        first:
          "redis://:pass@127.0.0.1:6379,127.0.0.2:6379/0?topology=cluster",
        second:
          "redis://:pass@10.0.0.1:26379,10.0.0.2:26379/0?topology=sentinel&master=mymaster",
      });
    }
    if (dbType === "oracle") {
      return "oracle://user:pass@127.0.0.1:1521/ORCLPDB1";
    }
    if (dbType === "iris") {
      return "iris://user:pass@127.0.0.1:1972/USER";
    }
    if (dbType === "opengauss") {
      return "opengauss://user:pass@127.0.0.1:5432/db_name";
    }
    if (dbType === "gaussdb") {
      return "gaussdb://user:pass@127.0.0.1:5432/db_name";
    }
    return t("connection.modal.example", {
      value: "postgres://user:pass@127.0.0.1:5432/db_name",
    });
  };

  const getConnectionParamsPlaceholder = () => {
    if (dbType === "oceanbase") {
      return oceanBaseProtocol === "oracle"
        ? "PREFETCH_ROWS=5000"
        : "useUnicode=true&characterEncoding=utf8&autoReconnect=true&useSSL=false";
    }
    if (isMySQLCompatibleType(dbType)) {
      return "useUnicode=true&characterEncoding=utf8&autoReconnect=true&useSSL=false";
    }
    switch (dbType) {
      case "postgres":
      case "kingbase":
      case "highgo":
      case "vastbase":
      case "opengauss":
      case "gaussdb":
        return "application_name=GoNavi&statement_timeout=30000";
      case "oracle":
        return "PREFETCH_ROWS=5000&TRACE FILE=/tmp/go-ora.trc";
      case "sqlserver":
        return "app name=GoNavi&packet size=32767";
      case "iris":
        return "timeout=30";
      case "clickhouse":
        return "max_execution_time=60&compress=lz4";
      case "mongodb":
        return "retryWrites=true&readPreference=secondaryPreferred";
      case "chroma":
        return "tenant=default_tenant&apiKey=...";
      case "qdrant":
        return "apiKey=...";
      case "dameng":
        return "schema=SYSDBA";
      case "tdengine":
        return "timezone=Asia%2FShanghai";
      case "iotdb":
        return "fetchSize=1024&timeZone=Asia%2FShanghai";
      case "rocketmq":
        return "groupId=gonavi&namespace=prod&tag=TagA&pullBatchSize=32&startOffset=latest";
      case "mqtt":
        return "topics=devices%2F%2B%2Ftelemetry,%24SYS%2F%23&clientId=gonavi-desktop&qos=1&cleanSession=true&fetchWaitMs=4000";
      case "kafka":
        return "groupId=gonavi&mechanism=scram-sha-256&clientId=gonavi-desktop&startOffset=latest";
      case "rabbitmq":
        return "defaultQueue=orders.queue&exchange=events.topic&managementPathPrefix=/rabbitmq";
      default:
        return "key=value&another=value";
    }
  };

  const buildUriFromValues = (values: any) => {
    const type = String(values.type || "")
      .trim()
      .toLowerCase();
    const defaultPort = getDefaultPortByType(type);
    const host = String(values.host || "localhost").trim();
    const port = Number(values.port || defaultPort);
    const user = String(values.user || "").trim();
    const password = String(values.password || "");
    const database = String(values.database || "").trim();
    const timeout = Number(values.timeout || 30);
    const encodedAuth = user
      ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@`
      : "";

    if (isMySQLCompatibleType(type)) {
      const selectedOceanBaseProtocol =
        type === "oceanbase"
          ? normalizeOceanBaseProtocolValue(values.oceanBaseProtocol)
          : "mysql";
      const primary = toAddress(host, port, defaultPort);
      const replicas =
        selectedOceanBaseProtocol !== "oracle" && values.mysqlTopology === "replica"
          ? normalizeAddressList(values.mysqlReplicaHosts, defaultPort)
          : [];
      const hosts = normalizeAddressList([primary, ...replicas], defaultPort);
      const params = new URLSearchParams();
      if (hosts.length > 1 || values.mysqlTopology === "replica") {
        params.set("topology", "replica");
      }
      if (values.useSSL) {
        const mode = String(values.sslMode || "preferred")
          .trim()
          .toLowerCase();
        if (mode === "required") {
          params.set("tls", "true");
        } else if (mode === "skip-verify") {
          params.set("tls", "skip-verify");
        } else {
          params.set("tls", "preferred");
        }
      }
      appendSSLPathParamsForUri(params, type, values);
      if (Number.isFinite(timeout) && timeout > 0) {
        params.set("timeout", String(timeout));
      }
      mergeConnectionParams(params, values.connectionParams);
      if (type === "oceanbase") {
        params.set("protocol", selectedOceanBaseProtocol);
      }
      const dbPath = database ? `/${encodeURIComponent(database)}` : "/";
      const query = params.toString();
      const scheme =
        type === "diros" ? "doris" : type === "starrocks" ? "starrocks" : type === "oceanbase" ? "oceanbase" : type === "goldendb" ? "goldendb" : "mysql";
      return `${scheme}://${encodedAuth}${hosts.join(",")}${dbPath}${query ? `?${query}` : ""}`;
    }

    if (type === "kafka") {
      const primary = toAddress(host, port, defaultPort);
      const brokers =
        values.kafkaTopology === "cluster"
          ? normalizeAddressList(values.kafkaHosts, defaultPort)
          : [];
      const allBrokers = normalizeAddressList([primary, ...brokers], defaultPort);
      const params = new URLSearchParams();
      if (allBrokers.length > 1 || values.kafkaTopology === "cluster") {
        params.set("topology", "cluster");
      }
      if (values.useSSL) {
        const mode = String(values.sslMode || "preferred")
          .trim()
          .toLowerCase();
        params.set("tls", "true");
        if (mode === "skip-verify" || mode === "preferred") {
          params.set("skip_verify", "true");
        }
        appendSSLPathParamsForUri(params, type, values);
      }
      if (Number.isFinite(timeout) && timeout > 0) {
        params.set("timeout", String(timeout));
      }
      mergeConnectionParams(params, values.connectionParams);
      const topicPath = database ? `/${encodeURIComponent(database)}` : "";
      const query = params.toString();
      return `kafka://${encodedAuth}${allBrokers.join(",")}${topicPath}${query ? `?${query}` : ""}`;
    }

    if (type === "mqtt") {
      const primary = toAddress(host, port, defaultPort);
      const brokers =
        values.mqttTopology === "cluster"
          ? normalizeAddressList(values.mqttHosts, defaultPort)
          : [];
      const allBrokers = normalizeAddressList([primary, ...brokers], defaultPort);
      const params = new URLSearchParams();
      if (allBrokers.length > 1 || values.mqttTopology === "cluster") {
        params.set("topology", "cluster");
      }
      if (values.useSSL) {
        const mode = String(values.sslMode || "preferred")
          .trim()
          .toLowerCase();
        params.set("tls", "true");
        if (mode === "skip-verify" || mode === "preferred") {
          params.set("skip_verify", "true");
        }
        appendSSLPathParamsForUri(params, type, values);
      }
      if (Number.isFinite(timeout) && timeout > 0) {
        params.set("timeout", String(timeout));
      }
      mergeConnectionParams(params, values.connectionParams);
      const topicPath = database ? `/${encodeURIComponent(database)}` : "";
      const query = params.toString();
      return `mqtt://${encodedAuth}${allBrokers.join(",")}${topicPath}${query ? `?${query}` : ""}`;
    }

    if (type === "rocketmq") {
      const primary = toAddress(host, port, defaultPort);
      const nameservers =
        values.rocketmqTopology === "cluster"
          ? normalizeAddressList(values.rocketmqHosts, defaultPort)
          : [];
      const allNameServers = normalizeAddressList([primary, ...nameservers], defaultPort);
      const params = new URLSearchParams();
      if (allNameServers.length > 1 || values.rocketmqTopology === "cluster") {
        params.set("topology", "cluster");
      }
      if (Number.isFinite(timeout) && timeout > 0) {
        params.set("timeout", String(timeout));
      }
      mergeConnectionParams(params, values.connectionParams);
      const topicPath = database ? `/${encodeURIComponent(database)}` : "";
      const query = params.toString();
      return `rocketmq://${encodedAuth}${allNameServers.join(",")}${topicPath}${query ? `?${query}` : ""}`;
    }

    if (type === "rabbitmq") {
      const address = toAddress(host, port, defaultPort);
      const params = new URLSearchParams();
      if (values.useSSL) {
        const mode = String(values.sslMode || "preferred")
          .trim()
          .toLowerCase();
        params.set("tls", "true");
        if (mode === "skip-verify" || mode === "preferred") {
          params.set("skip_verify", "true");
        }
        appendSSLPathParamsForUri(params, type, values);
      }
      if (Number.isFinite(timeout) && timeout > 0) {
        params.set("timeout", String(timeout));
      }
      mergeConnectionParams(params, values.connectionParams);
      const vhostPath = database ? `/${encodeURIComponent(database)}` : "";
      const query = params.toString();
      return `rabbitmq://${encodedAuth}${address}${vhostPath}${query ? `?${query}` : ""}`;
    }

    if (type === "redis") {
      return buildRedisUriFromValues(values);
    }

    if (isFileDatabaseType(type)) {
      const pathText = normalizeFileDbPath(String(values.host || "").trim());
      if (!pathText) {
        return `${type}://`;
      }
      return `${type}://${encodeURI(pathText)}`;
    }

    if (type === "mongodb") {
      const useSrv = !!values.mongoSrv;
      const primaryAddress = useSrv
        ? parseHostPort(host, 27017)?.host || host || "localhost"
        : toAddress(host, port, 27017);
      const extraNodes =
        values.mongoTopology === "replica"
          ? useSrv
            ? normalizeMongoSrvHostList(values.mongoHosts, 27017)
            : normalizeAddressList(values.mongoHosts, 27017)
          : [];
      const hosts = useSrv
        ? normalizeMongoSrvHostList([primaryAddress, ...extraNodes], 27017)
        : normalizeAddressList([primaryAddress, ...extraNodes], 27017);
      const scheme = useSrv ? "mongodb+srv" : "mongodb";
      const params = new URLSearchParams();
      const authSource = String(
        values.mongoAuthSource || database || "admin",
      ).trim();
      if (authSource) {
        params.set("authSource", authSource);
      }
      const replicaSet = String(values.mongoReplicaSet || "").trim();
      if (replicaSet) {
        params.set("replicaSet", replicaSet);
      }
      const readPreference = String(values.mongoReadPreference || "").trim();
      if (readPreference) {
        params.set("readPreference", readPreference);
      }
      const authMechanism = String(values.mongoAuthMechanism || "").trim();
      if (authMechanism) {
        params.set("authMechanism", authMechanism);
      }
      if (values.useSSL) {
        const mode = String(values.sslMode || "preferred")
          .trim()
          .toLowerCase();
        params.set("tls", "true");
        if (mode === "skip-verify" || mode === "preferred") {
          params.set("tlsInsecure", "true");
        } else {
          params.delete("tlsInsecure");
        }
      }
      appendSSLPathParamsForUri(params, type, values);
      if (Number.isFinite(timeout) && timeout > 0) {
        params.set("connectTimeoutMS", String(timeout * 1000));
        params.set("serverSelectionTimeoutMS", String(timeout * 1000));
      }
      mergeConnectionParams(params, values.connectionParams);
      const dbPath = database ? `/${encodeURIComponent(database)}` : "/";
      const query = params.toString();
      return `${scheme}://${encodedAuth}${hosts.join(",")}${dbPath}${query ? `?${query}` : ""}`;
    }

    const clickHouseProtocol =
      type === "clickhouse"
        ? normalizeClickHouseProtocolValue(values.clickHouseProtocol)
        : "auto";
    const scheme =
      type === "gaussdb"
        ? "gaussdb"
        : type === "postgres"
        ? "postgresql"
        : type === "chroma" || type === "qdrant"
          ? values.useSSL
            ? "https"
            : "http"
        : type === "clickhouse" && clickHouseProtocol === "http"
          ? values.useSSL
            ? "https"
            : "http"
          : type;
    const dbPath = database ? `/${encodeURIComponent(database)}` : "";
    const params = new URLSearchParams();
    if (supportsSSLForType(type) && values.useSSL) {
      const mode = String(values.sslMode || "preferred")
        .trim()
        .toLowerCase();
      if (isPostgresCompatibleSSLType(type)) {
        params.set(
          "sslmode",
          mode === "skip-verify"
            ? "require"
            : String(values.sslCAPath || "").trim()
              ? "verify-ca"
              : "require",
        );
        appendSSLPathParamsForUri(params, type, values);
      } else if (type === "sqlserver") {
        params.set("encrypt", "true");
        params.set(
          "TrustServerCertificate",
          mode === "skip-verify" || mode === "preferred" ? "true" : "false",
        );
        appendSSLPathParamsForUri(params, type, values);
      } else if (type === "clickhouse") {
        if (clickHouseProtocol === "http") {
          if (mode === "skip-verify" || mode === "preferred") {
            params.set("skip_verify", "true");
          }
        } else {
          params.set("secure", "true");
          if (mode === "skip-verify" || mode === "preferred") {
            params.set("skip_verify", "true");
          }
        }
        appendSSLPathParamsForUri(params, type, values);
      } else if (type === "dameng") {
        appendSSLPathParamsForUri(params, type, values);
      } else if (type === "oracle") {
        params.set("SSL", "TRUE");
        params.set("SSL VERIFY", mode === "required" ? "TRUE" : "FALSE");
      } else if (type === "tdengine") {
        params.set("protocol", "wss");
        if (mode === "skip-verify" || mode === "preferred") {
          params.set("skip_verify", "true");
        }
      } else if (type === "chroma" || type === "qdrant") {
        if (mode === "skip-verify" || mode === "preferred") {
          params.set("skip_verify", "true");
        }
        appendSSLPathParamsForUri(params, type, values);
      }
    } else if (supportsSSLForType(type)) {
      if (isPostgresCompatibleSSLType(type)) {
        params.set("sslmode", "disable");
      } else if (type === "sqlserver") {
        params.set("encrypt", "disable");
        params.set("TrustServerCertificate", "true");
      } else if (type === "tdengine") {
        params.set("protocol", "ws");
      }
    }
    if (type === "clickhouse" && clickHouseProtocol !== "auto") {
      params.set("protocol", clickHouseProtocol);
    }
    if (supportsConnectionParamsForType(type)) {
      mergeConnectionParams(params, values.connectionParams);
    }
    const query = params.toString();
    return `${scheme}://${encodedAuth}${toAddress(host, port, defaultPort)}${dbPath}${query ? `?${query}` : ""}`;
  };

  const handleGenerateURI = () => {
    try {
      const values = form.getFieldsValue(true);
      const uri = buildUriFromValues(values);
      form.setFieldValue("uri", uri);
      setUriFeedback({
        type: "success",
        messageKey: "connection.modal.uri.feedback.generated",
      });
    } catch {
      setUriFeedback({
        type: "error",
        messageKey: "connection.modal.uri.feedback.generateFailed",
      });
    }
  };

  const handleParseURI = () => {
    try {
      const uriText = String(form.getFieldValue("uri") || "").trim();
      const type = String(form.getFieldValue("type") || dbType)
        .trim()
        .toLowerCase();
      if (!uriText) {
        setUriFeedback({
          type: "warning",
          messageKey: "connection.modal.uri.feedback.emptyInput",
        });
        return;
      }
      const parsedValues = parseUriToValues(uriText, type);
      if (!parsedValues) {
        setUriFeedback({
          type: "error",
          messageKey: "connection.modal.uri.feedback.unsupported",
        });
        return;
      }
      form.setFieldsValue(
        mergeParsedUriValuesForForm(
          form.getFieldsValue(true),
          parsedValues,
          uriText,
        ),
      );
      if (testResult) {
        setTestResult(null);
      }
      setUriFeedback({
        type: "success",
        messageKey: "connection.modal.uri.feedback.parsed",
      });
    } catch {
      setUriFeedback({
        type: "error",
        messageKey: "connection.modal.uri.feedback.parseFailed",
      });
    }
  };

  const handleCopyURI = async () => {
    let uriText = String(form.getFieldValue("uri") || "").trim();
    if (!uriText) {
      const values = form.getFieldsValue(true);
      uriText = buildUriFromValues(values);
      form.setFieldValue("uri", uriText);
    }
    if (!uriText) {
      setUriFeedback({
        type: "warning",
        messageKey: "connection.modal.uri.feedback.emptyCopy",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(uriText);
      setUriFeedback({
        type: "success",
        messageKey: "connection.modal.uri.feedback.copied",
      });
    } catch {
      setUriFeedback({
        type: "error",
        messageKey: "connection.modal.uri.feedback.copyFailed",
      });
    }
  };

  const handleSelectSSHKeyFile = async () => {
    if (selectingSSHKey) {
      return;
    }
    try {
      setSelectingSSHKey(true);
      const currentPath = String(form.getFieldValue("sshKeyPath") || "").trim();
      const res = await SelectSSHKeyFile(currentPath);
      if (res?.success) {
        const data = res.data || {};
        const selectedPath =
          typeof data === "string" ? data : String(data.path || "").trim();
        if (selectedPath) {
          form.setFieldValue("sshKeyPath", selectedPath);
        }
      } else if (!isBackendCancelledResult(res)) {
        message.error(
          t("connection.modal.filePicker.sshKeyFailure", {
            detail: res?.message || t("connection.modal.error.unknown"),
          }),
        );
      }
    } catch (e: any) {
      message.error(
        t("connection.modal.filePicker.sshKeyFailure", {
          detail: e?.message || String(e),
        }),
      );
    } finally {
      setSelectingSSHKey(false);
    }
  };

  const handleSelectCertificateFile = async (
    fieldName: "sslCAPath" | "sslCertPath" | "sslKeyPath",
    certKind: "ca" | "client-cert" | "client-key",
  ) => {
    if (selectingCertificateField) {
      return;
    }
    try {
      setSelectingCertificateField(fieldName);
      const currentPath = String(form.getFieldValue(fieldName) || "").trim();
      const res = await SelectCertificateFile(currentPath, certKind);
      if (res?.success) {
        const data = res.data || {};
        const selectedPath =
          typeof data === "string" ? data : String(data.path || "").trim();
        if (selectedPath) {
          form.setFieldValue(fieldName, selectedPath);
        }
      } else if (!isBackendCancelledResult(res)) {
        message.error(
          t("connection.modal.filePicker.certificateFailure", {
            detail: res?.message || t("connection.modal.error.unknown"),
          }),
        );
      }
    } catch (e: any) {
      message.error(
        t("connection.modal.filePicker.certificateFailure", {
          detail: e?.message || String(e),
        }),
      );
    } finally {
      setSelectingCertificateField(null);
    }
  };

  const handleSelectDatabaseFile = async () => {
    if (selectingDbFile) {
      return;
    }
    try {
      setSelectingDbFile(true);
      const currentPath = String(form.getFieldValue("host") || "").trim();
      const res = await SelectDatabaseFile(currentPath, dbType);
      if (res?.success) {
        const data = res.data || {};
        const selectedPath =
          typeof data === "string" ? data : String(data.path || "").trim();
        if (selectedPath) {
          form.setFieldValue("host", normalizeFileDbPath(selectedPath));
        }
      } else if (!isBackendCancelledResult(res)) {
        message.error(
          t("connection.modal.filePicker.databaseFailure", {
            detail: res?.message || t("connection.modal.error.unknown"),
          }),
        );
      }
    } catch (e: any) {
      message.error(
        t("connection.modal.filePicker.databaseFailure", {
          detail: e?.message || String(e),
        }),
      );
    } finally {
      setSelectingDbFile(false);
    }
  };

  useEffect(() => {
    if (open) {
      setLoading(false);
      testInFlightRef.current = false;
      if (testTimerRef.current !== null) {
        window.clearTimeout(testTimerRef.current);
        testTimerRef.current = null;
      }
      setTestResult(null); // Reset test result
      setTestErrorLogOpen(false);
      setDbList([]);
      setRedisDbList([]);
      setMongoMembers([]);
      setUriFeedback(null);
      setCustomIconType(undefined);
      setCustomIconColor(undefined);
      setClearSecrets(createEmptyConnectionSecretClearState());
      setPrimaryPasswordVisible(false);
      setTypeSelectWarning(null);
      setDriverStatusLoaded(false);
      void refreshDriverStatus();
      if (initialValues) {
        // Edit mode: Go directly to step 2
        setStep(2);
        const config: any = initialValues.config || {};
        const configType = String(config.type || "mysql");
        const isJvmConfigType = configType === "jvm";
        const defaultPort = getDefaultPortByType(configType);
        const isFileDbConfigType = isFileDatabaseType(configType);
        const jvmDefaultValues = buildDefaultJVMConnectionValues();
        const savedPrimaryAddress = isFileDbConfigType
          ? ""
          : toAddress(
              config.host || "localhost",
              Number(config.port || defaultPort),
              defaultPort,
            );
        const normalizedHosts = isFileDbConfigType
          ? []
          : normalizeAddressList(
              [
                savedPrimaryAddress,
                ...(Array.isArray(config.hosts) ? config.hosts : []),
              ],
              defaultPort,
            );
        const primaryAddress = isFileDbConfigType
          ? null
          : parseHostPort(
              normalizedHosts[0] ||
                savedPrimaryAddress,
              defaultPort,
            );
        const primaryHost = isFileDbConfigType
          ? normalizeFileDbPath(String(config.host || ""))
          : primaryAddress?.host || String(config.host || "localhost");
        const primaryPort = isFileDbConfigType
          ? 0
          : primaryAddress?.port || Number(config.port || defaultPort);
        const mysqlReplicaHosts =
          configType === "mysql" ||
          configType === "goldendb" ||
          configType === "mariadb" ||
          configType === "oceanbase" ||
          configType === "diros" ||
          configType === "starrocks" ||
          configType === "sphinx"
            ? normalizedHosts.slice(1)
            : [];
        const rocketmqHosts =
          configType === "rocketmq" ? normalizedHosts.slice(1) : [];
        const mqttHosts =
          configType === "mqtt" ? normalizedHosts.slice(1) : [];
        const kafkaHosts =
          configType === "kafka" ? normalizedHosts.slice(1) : [];
        const mongoHosts =
          configType === "mongodb" ? normalizedHosts.slice(1) : [];
        const redisHosts =
          configType === "redis" ? normalizedHosts.slice(1) : [];
        const mysqlIsReplica =
          String(config.topology || "").toLowerCase() === "replica" ||
          mysqlReplicaHosts.length > 0;
        const rocketmqIsCluster =
          String(config.topology || "").toLowerCase() === "cluster" ||
          rocketmqHosts.length > 0;
        const mqttIsCluster =
          String(config.topology || "").toLowerCase() === "cluster" ||
          mqttHosts.length > 0;
        const kafkaIsCluster =
          String(config.topology || "").toLowerCase() === "cluster" ||
          kafkaHosts.length > 0;
        const mongoIsReplica =
          String(config.topology || "").toLowerCase() === "replica" ||
          mongoHosts.length > 0 ||
          !!config.replicaSet;
        const redisTopologyValue = String(config.topology || "").toLowerCase();
        const redisIsSentinel = redisTopologyValue === "sentinel";
        const redisIsCluster =
          !redisIsSentinel &&
          (redisTopologyValue === "cluster" || redisHosts.length > 0);
        const {
          allowedModes: resolvedJvmAllowedModes,
          preferredMode: resolvedJvmPreferredMode,
        } = resolveEditableJVMModeSelection({
          allowedModes: config.jvm?.allowedModes,
          preferredMode: config.jvm?.preferredMode,
        });
        const resolvedJvmTimeout = isJvmConfigType
          ? Number(config.jvm?.endpoint?.timeoutSeconds || config.timeout || 30)
          : Number(config.timeout || 30);
        const hasHttpTunnel = !!config.useHttpTunnel;
        const hasProxy = !hasHttpTunnel && !!config.useProxy;
        form.setFieldsValue({
          type: configType,
          name: initialValues.name,
          host: primaryHost,
          port: primaryPort,
          user: config.user,
          password: config.password,
          database: config.database,
          uri: config.uri || "",
          connectionParams:
            config.connectionParams ||
            (config.uri
              ? parseUriToValues(config.uri, configType)?.connectionParams || ""
              : ""),
          clickHouseProtocol:
            configType === "clickhouse"
              ? normalizeClickHouseProtocolValue(config.clickHouseProtocol)
              : "auto",
          oceanBaseProtocol:
            configType === "oceanbase"
              ? resolveOceanBaseProtocolForConfig(config)
              : "mysql",
          includeDatabases: initialValues.includeDatabases,
          includeRedisDatabases: initialValues.includeRedisDatabases,
          useSSL: !!config.useSSL,
          sslMode: config.sslMode || "preferred",
          sslCAPath: config.sslCAPath || "",
          sslCertPath: config.sslCertPath || "",
          sslKeyPath: config.sslKeyPath || "",
          useSSH: config.useSSH,
          sshHost: config.ssh?.host,
          sshPort: config.ssh?.port,
          sshUser: config.ssh?.user,
          sshPassword: config.ssh?.password,
          sshKeyPath: config.ssh?.keyPath,
          useProxy: hasProxy,
          proxyType: config.proxy?.type || "socks5",
          proxyHost: config.proxy?.host,
          proxyPort: config.proxy?.port,
          proxyUser: config.proxy?.user,
          proxyPassword: config.proxy?.password,
          useHttpTunnel: hasHttpTunnel,
          httpTunnelHost: config.httpTunnel?.host,
          httpTunnelPort: config.httpTunnel?.port || 8080,
          httpTunnelUser: config.httpTunnel?.user,
          httpTunnelPassword: config.httpTunnel?.password,
          driver: config.driver,
          dsn: config.dsn,
          timeout: resolvedJvmTimeout,
          mysqlTopology: mysqlIsReplica ? "replica" : "single",
          mysqlReplicaHosts: mysqlReplicaHosts,
          rocketmqTopology: rocketmqIsCluster ? "cluster" : "single",
          rocketmqHosts: rocketmqHosts,
          mqttTopology: mqttIsCluster ? "cluster" : "single",
          mqttHosts: mqttHosts,
          kafkaTopology: kafkaIsCluster ? "cluster" : "single",
          kafkaHosts: kafkaHosts,
          mysqlReplicaUser: config.mysqlReplicaUser || "",
          mysqlReplicaPassword: config.mysqlReplicaPassword || "",
          mongoTopology: mongoIsReplica ? "replica" : "single",
          mongoHosts: mongoHosts,
          redisTopology: redisIsSentinel
            ? "sentinel"
            : redisIsCluster
              ? "cluster"
              : "single",
          redisHosts: redisHosts,
          redisSentinelMaster: config.redisSentinelMaster || "",
          redisSentinelUser: config.redisSentinelUser || "",
          redisSentinelPassword: config.redisSentinelPassword || "",
          mongoSrv: !!config.mongoSrv,
          mongoReplicaSet: config.replicaSet || "",
          mongoAuthSource: config.authSource || "",
          mongoReadPreference: config.readPreference || "primary",
          mongoAuthMechanism: config.mongoAuthMechanism || "",
          savePassword: config.savePassword !== false,
          redisDB: Number.isFinite(Number(config.redisDB))
            ? Number(config.redisDB)
            : 0,
          mongoReplicaUser: config.mongoReplicaUser || "",
          mongoReplicaPassword: config.mongoReplicaPassword || "",
          jvmReadOnly: isJvmConfigType
            ? (config.jvm?.readOnly ?? jvmDefaultValues.jvmReadOnly)
            : jvmDefaultValues.jvmReadOnly,
          jvmAllowedModes: isJvmConfigType
            ? resolvedJvmAllowedModes
            : jvmDefaultValues.jvmAllowedModes,
          jvmPreferredMode: isJvmConfigType
            ? resolvedJvmPreferredMode
            : jvmDefaultValues.jvmPreferredMode,
          jvmEnvironment: isJvmConfigType
            ? config.jvm?.environment || jvmDefaultValues.jvmEnvironment
            : jvmDefaultValues.jvmEnvironment,
          jvmEndpointEnabled: isJvmConfigType
            ? (config.jvm?.endpoint?.enabled ??
              resolvedJvmAllowedModes.includes("endpoint"))
            : jvmDefaultValues.jvmEndpointEnabled,
          jvmEndpointBaseUrl: isJvmConfigType
            ? config.jvm?.endpoint?.baseUrl || ""
            : jvmDefaultValues.jvmEndpointBaseUrl,
          jvmEndpointApiKey: isJvmConfigType
            ? config.jvm?.endpoint?.apiKey || ""
            : jvmDefaultValues.jvmEndpointApiKey,
          jvmAgentEnabled: isJvmConfigType
            ? (config.jvm?.agent?.enabled ??
              resolvedJvmAllowedModes.includes("agent"))
            : jvmDefaultValues.jvmAgentEnabled,
          jvmAgentBaseUrl: isJvmConfigType
            ? config.jvm?.agent?.baseUrl || ""
            : jvmDefaultValues.jvmAgentBaseUrl,
          jvmAgentApiKey: isJvmConfigType
            ? config.jvm?.agent?.apiKey || ""
            : jvmDefaultValues.jvmAgentApiKey,
          jvmDiagnosticEnabled: isJvmConfigType
            ? (config.jvm?.diagnostic?.enabled ??
              jvmDefaultValues.jvmDiagnosticEnabled)
            : jvmDefaultValues.jvmDiagnosticEnabled,
          jvmDiagnosticTransport: isJvmConfigType
            ? config.jvm?.diagnostic?.transport ||
              jvmDefaultValues.jvmDiagnosticTransport
            : jvmDefaultValues.jvmDiagnosticTransport,
          jvmDiagnosticBaseUrl: isJvmConfigType
            ? config.jvm?.diagnostic?.baseUrl || ""
            : jvmDefaultValues.jvmDiagnosticBaseUrl,
          jvmDiagnosticTargetId: isJvmConfigType
            ? config.jvm?.diagnostic?.targetId || ""
            : jvmDefaultValues.jvmDiagnosticTargetId,
          jvmDiagnosticApiKey: isJvmConfigType
            ? config.jvm?.diagnostic?.apiKey || ""
            : jvmDefaultValues.jvmDiagnosticApiKey,
          jvmDiagnosticAllowObserveCommands: isJvmConfigType
            ? (config.jvm?.diagnostic?.allowObserveCommands ??
              jvmDefaultValues.jvmDiagnosticAllowObserveCommands)
            : jvmDefaultValues.jvmDiagnosticAllowObserveCommands,
          jvmDiagnosticAllowTraceCommands: isJvmConfigType
            ? (config.jvm?.diagnostic?.allowTraceCommands ??
              jvmDefaultValues.jvmDiagnosticAllowTraceCommands)
            : jvmDefaultValues.jvmDiagnosticAllowTraceCommands,
          jvmDiagnosticAllowMutatingCommands: isJvmConfigType
            ? (config.jvm?.diagnostic?.allowMutatingCommands ??
              jvmDefaultValues.jvmDiagnosticAllowMutatingCommands)
            : jvmDefaultValues.jvmDiagnosticAllowMutatingCommands,
          jvmDiagnosticTimeoutSeconds: isJvmConfigType
            ? Number(
                config.jvm?.diagnostic?.timeoutSeconds ||
                  jvmDefaultValues.jvmDiagnosticTimeoutSeconds,
              )
            : jvmDefaultValues.jvmDiagnosticTimeoutSeconds,
          jvmEndpointTimeoutSeconds: resolvedJvmTimeout,
          jvmJmxHost:
            isJvmConfigType &&
            config.jvm?.jmx?.host &&
            config.jvm.jmx.host !== primaryHost
              ? config.jvm.jmx.host
              : "",
          jvmJmxPort:
            isJvmConfigType &&
            Number(config.jvm?.jmx?.port) > 0 &&
            Number(config.jvm.jmx.port) !== Number(primaryPort || defaultPort)
              ? Number(config.jvm.jmx.port)
              : undefined,
          jvmJmxUsername: isJvmConfigType
            ? config.jvm?.jmx?.username || ""
            : "",
          jvmJmxPassword: isJvmConfigType
            ? config.jvm?.jmx?.password || ""
            : "",
        });
        setPrimaryPasswordVisible(false);
        setUseSSL(!!config.useSSL);
        setCustomIconType(initialValues.iconType);
        setCustomIconColor(initialValues.iconColor);
        setUseSSH(config.useSSH || false);
        setUseProxy(hasProxy);
        setUseHttpTunnel(hasHttpTunnel);
        setDbType(configType);
        if (config.useSSL && supportsSSLForType(configType)) {
          setActiveNetworkConfig("ssl");
        } else if (config.useSSH) {
          setActiveNetworkConfig("ssh");
        } else if (hasProxy) {
          setActiveNetworkConfig("proxy");
        } else if (hasHttpTunnel) {
          setActiveNetworkConfig("httpTunnel");
        } else {
          setActiveNetworkConfig("ssl");
        }
        // 如果是 Redis 编辑模式，设置已保存的 Redis 数据库列表
        if (configType === "redis") {
          setRedisDbList(
            buildRedisDatabaseList(
              config.redisDB,
              initialValues.includeRedisDatabases,
            ),
          );
        }
      } else {
        // Create mode: Start at step 1
        setActiveConfigSection("basic");
        setStep(1);
        form.resetFields();
        setUseSSL(false);
        setUseSSH(false);
        setUseProxy(false);
        setUseHttpTunnel(false);
        setDbType("mysql");
        setActiveGroup(0);
        setActiveConfigSection("basic");
        setActiveNetworkConfig("ssl");
        setPrimaryPasswordVisible(false);
      }
    }
  }, [open, initialValues]);

  useEffect(() => {
    return () => {
      if (testTimerRef.current !== null) {
        window.clearTimeout(testTimerRef.current);
        testTimerRef.current = null;
      }
    };
  }, []);

  const buildSavedConnectionInput = (config: ConnectionConfig, values: any) => {
    const connectionId =
      initialValues?.id || config.id || Date.now().toString();
    const primaryDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasPrimaryPassword,
      valueInput: config.password,
      clearSecret:
        clearSecrets.primaryPassword ||
        (initialValues?.hasPrimaryPassword === true &&
          String(config.password || "") === ""),
      forceClear: values.type === "mongodb" && values.savePassword === false,
    });
    const sshDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasSSHPassword,
      valueInput: config.ssh?.password,
      clearSecret: clearSecrets.sshPassword,
      forceClear: !config.useSSH,
    });
    const proxyDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasProxyPassword,
      valueInput: config.proxy?.password,
      clearSecret: clearSecrets.proxyPassword,
      forceClear: !config.useProxy,
    });
    const httpTunnelDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasHttpTunnelPassword,
      valueInput: config.httpTunnel?.password,
      clearSecret: clearSecrets.httpTunnelPassword,
      forceClear: !config.useHttpTunnel,
    });
    const mysqlReplicaEnabled =
      isMySQLCompatibleType(config.type) && config.topology === "replica";
    const mysqlReplicaDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasMySQLReplicaPassword,
      valueInput: config.mysqlReplicaPassword,
      clearSecret: clearSecrets.mysqlReplicaPassword,
      forceClear: !mysqlReplicaEnabled,
    });
    const mongoReplicaEnabled =
      config.type === "mongodb" &&
      config.topology === "replica" &&
      values.savePassword !== false;
    const mongoReplicaDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasMongoReplicaPassword,
      valueInput: config.mongoReplicaPassword,
      clearSecret: clearSecrets.mongoReplicaPassword,
      forceClear: !mongoReplicaEnabled,
    });
    const redisSentinelEnabled =
      config.type === "redis" &&
      config.topology === "sentinel" &&
      values.savePassword !== false;
    const redisSentinelDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasRedisSentinelPassword,
      valueInput: config.redisSentinelPassword,
      clearSecret: clearSecrets.redisSentinelPassword,
      forceClear: !redisSentinelEnabled,
    });
    const opaqueUriDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasOpaqueURI,
      valueInput: config.uri,
      clearSecret: clearSecrets.opaqueURI,
      forceClear: values.type === "custom",
      trimInput: true,
    });
    const opaqueDsnDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasOpaqueDSN,
      valueInput: config.dsn,
      clearSecret: clearSecrets.opaqueDSN,
      forceClear: values.type !== "custom",
      trimInput: true,
    });
    const isRedisType = values.type === "redis";
    const displayHost = String(
      (config as any).host || values.host || "",
    ).trim();
    const nextName =
      values.name ||
      (isFileDatabaseType(values.type)
        ? values.type === "duckdb"
          ? "DuckDB DB"
          : "SQLite DB"
        : values.type === "redis"
          ? `Redis ${displayHost}`
          : displayHost);

    return {
      id: connectionId,
      name: nextName,
      config: {
        ...config,
        id: connectionId,
        password: primaryDraft.value,
        ssh: {
          ...(config.ssh || {
            host: "",
            port: 22,
            user: "",
            password: "",
            keyPath: "",
          }),
          password: sshDraft.value,
        },
        proxy: {
          ...(config.proxy || {
            type: "socks5",
            host: "",
            port: 1080,
            user: "",
            password: "",
          }),
          password: proxyDraft.value,
        },
        httpTunnel: {
          ...(config.httpTunnel || {
            host: "",
            port: 8080,
            user: "",
            password: "",
          }),
          password: httpTunnelDraft.value,
        },
        uri: opaqueUriDraft.value,
        dsn: opaqueDsnDraft.value,
        mysqlReplicaPassword: mysqlReplicaDraft.value,
        mongoReplicaPassword: mongoReplicaDraft.value,
        redisSentinelPassword: redisSentinelDraft.value,
      },
      includeDatabases: values.includeDatabases,
      includeRedisDatabases: isRedisType
        ? values.includeRedisDatabases
        : undefined,
      iconType: customIconType || "",
      iconColor: customIconColor || "",
      clearPrimaryPassword: primaryDraft.clearStoredSecret,
      clearSSHPassword: sshDraft.clearStoredSecret,
      clearProxyPassword: proxyDraft.clearStoredSecret,
      clearHttpTunnelPassword: httpTunnelDraft.clearStoredSecret,
      clearMySQLReplicaPassword: mysqlReplicaDraft.clearStoredSecret,
      clearMongoReplicaPassword: mongoReplicaDraft.clearStoredSecret,
      clearRedisSentinelPassword: redisSentinelDraft.clearStoredSecret,
      clearOpaqueURI: opaqueUriDraft.clearStoredSecret,
      clearOpaqueDSN: opaqueDsnDraft.clearStoredSecret,
    };
  };
  const handleOk = async () => {
    try {
      await form.validateFields();
      const values = form.getFieldsValue(true);
      const unavailableReason = await resolveDriverUnavailableReason(
        values.type,
        values.driver,
      );
      if (unavailableReason) {
        message.warning(unavailableReason);
        promptInstallDriver(
          resolveConnectionDriverType(values.type, values.driver) || values.type,
          unavailableReason,
        );
        return;
      }
      setLoading(true);

      const config = await buildConfig(values, true);
      const payload = buildSavedConnectionInput(config, values);
      const backendApp = (window as any).go?.app?.App;
      const savedConnection = await backendApp?.SaveConnection?.(payload);
      if (!savedConnection) {
        throw new Error(t("connection.modal.save.backendUnavailable"));
      }

      if (initialValues) {
        updateConnection(savedConnection);
        message.success(t("connection.modal.save.updatedUnconnected"));
      } else {
        addConnection(savedConnection);
        message.success(t("connection.modal.save.savedUnconnected"));
      }

      if (onSaved) {
        void Promise.resolve(onSaved(savedConnection)).catch(
          (error: unknown) => {
            console.warn("Failed to refresh post-save state", error);
            void message.warning(
              t("connection.modal.save.refreshWarning"),
            );
          },
        );
      }

      form.resetFields();
      setUseSSL(false);
      setUseSSH(false);
      setUseProxy(false);
      setUseHttpTunnel(false);
      setDbType("mysql");
      setStep(1);
      setClearSecrets(createEmptyConnectionSecretClearState());
      onClose();
    } catch (e: any) {
      message.error(
        normalizeConnectionSecretErrorMessage(
          e?.message || e,
          t("connection.modal.save.failureFallback"),
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const requestTest = () => {
    if (loading) return;
    if (testTimerRef.current !== null) return;
    testTimerRef.current = window.setTimeout(() => {
      testTimerRef.current = null;
      handleTest();
    }, 0);
  };

  const withClientTimeout = async <T,>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> => {
    let timer: number | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = window.setTimeout(
            () => reject(new Error(timeoutMessage)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    }
  };

  const getBlockingSecretClearMessage = (values: any): string | null => {
    if (
      clearSecrets.primaryPassword &&
      values.type !== "custom" &&
      !isFileDatabaseType(values.type) &&
      String(values.password ?? "") === ""
    ) {
      return t("connection.modal.secret.blocking.primary");
    }
    if (
      clearSecrets.sshPassword &&
      values.useSSH &&
      String(values.sshPassword ?? "") === ""
    ) {
      return t("connection.modal.secret.blocking.ssh");
    }
    if (
      clearSecrets.proxyPassword &&
      values.useProxy &&
      !values.useHttpTunnel &&
      String(values.proxyPassword ?? "") === ""
    ) {
      return t("connection.modal.secret.blocking.proxy");
    }
    if (
      clearSecrets.httpTunnelPassword &&
      values.useHttpTunnel &&
      String(values.httpTunnelPassword ?? "") === ""
    ) {
      return t("connection.modal.secret.blocking.httpTunnel");
    }
    if (
      clearSecrets.mysqlReplicaPassword &&
      isMySQLCompatibleType(values.type) &&
      values.mysqlTopology === "replica" &&
      String(values.mysqlReplicaPassword ?? "") === ""
    ) {
      return t("connection.modal.secret.blocking.mysqlReplica");
    }
    if (
      clearSecrets.mongoReplicaPassword &&
      values.type === "mongodb" &&
      values.mongoTopology === "replica" &&
      String(values.mongoReplicaPassword ?? "") === ""
    ) {
      return t("connection.modal.secret.blocking.mongoReplica");
    }
    if (
      clearSecrets.redisSentinelPassword &&
      values.type === "redis" &&
      values.redisTopology === "sentinel" &&
      String(values.redisSentinelPassword ?? "") === ""
    ) {
      return t("connection.modal.secret.blocking.redis_sentinel");
    }
    if (
      values.type === "mongodb" &&
      values.savePassword === false &&
      initialValues?.hasPrimaryPassword &&
      String(values.password ?? "") === ""
    ) {
      return t("connection.modal.secret.blocking.mongoPrimary");
    }
    return null;
  };
  const applyTestFailureFeedback = ({
    kind,
    reason,
    fallbackKey,
  }: {
    kind: TestFailureKind;
    reason?: unknown;
    fallbackKey: string;
  }) => {
    void message.destroy("connection-test-failure");
    setTestResult({
      type: "error",
      kind,
      reason: String(reason ?? ""),
      fallbackKey,
    });
  };

  const handleTest = async () => {
    if (testInFlightRef.current) return;
    testInFlightRef.current = true;
    try {
      await form.validateFields();
      const values = form.getFieldsValue(true);
      const unavailableReason = await resolveDriverUnavailableReason(
        values.type,
        values.driver,
      );
      if (unavailableReason) {
        applyTestFailureFeedback({
          kind: "driver_unavailable",
          reason: unavailableReason,
          fallbackKey: "connection.modal.test.fallback.driverUnavailable",
        });
        promptInstallDriver(
          resolveConnectionDriverType(values.type, values.driver) || values.type,
          unavailableReason,
        );
        return;
      }
      const blockingSecretClearMessage = getBlockingSecretClearMessage(values);
      if (blockingSecretClearMessage) {
        applyTestFailureFeedback({
          kind: "secret_blocked",
          reason: blockingSecretClearMessage,
          fallbackKey: "connection.modal.test.fallback.incompleteParams",
        });
        return;
      }
      setLoading(true);
      setTestResult(null);
      const config = await buildConfig(values, false);
      if (initialValues?.id) {
        config.id = initialValues.id;
      }
      const timeoutSecondsRaw = Number(values.timeout);
      const timeoutSeconds =
        Number.isFinite(timeoutSecondsRaw) && timeoutSecondsRaw > 0
          ? Math.min(timeoutSecondsRaw, MAX_TIMEOUT_SECONDS)
          : 30;
      const rpcTimeoutMs = (timeoutSeconds + 5) * 1000;

      // Use different API for Redis / JVM
      const isRedisType = values.type === "redis";
      const isJVMType = values.type === "jvm";
      const dbTestConfig =
        !isRedisType && !isJVMType ? buildRpcConnectionConfig(config as any) : config;
      const res = await withClientTimeout(
        isJVMType
          ? TestJVMConnection(config as any)
          : isRedisType
            ? RedisConnect(config as any)
            : TestConnection(dbTestConfig as any),
        rpcTimeoutMs,
        t("connection.modal.test.timeout", { seconds: timeoutSeconds }),
      );

      if (res.success) {
        void message.destroy("connection-test-failure");
        setTestResult({ type: "success", message: res.message });
        if (isRedisType) {
          const dbRes = await withClientTimeout(
            RedisGetDatabases(config as any),
            rpcTimeoutMs,
            t("connection.modal.test.redis_database_list_timeout", {
              seconds: timeoutSeconds,
            }),
          );
          if (dbRes.success) {
            const supportedDbs = extractRedisDatabaseList(dbRes.data);
            setRedisDbList(supportedDbs);
            form.setFieldValue(
              "includeRedisDatabases",
              normalizeRedisDatabaseSelection(
                form.getFieldValue("includeRedisDatabases"),
                supportedDbs,
              ),
            );
          } else {
            setRedisDbList(
              buildRedisDatabaseList(
                config.redisDB,
                form.getFieldValue("includeRedisDatabases"),
              ),
            );
            message.warning(
              t("connection.modal.test.redis_database_list_failure", {
                detail: normalizeConnectionSecretErrorMessage(
                  dbRes.message,
                  t("connection.modal.error.unknown"),
                ),
              }),
            );
          }
        } else if (!isJVMType) {
          // Other databases: fetch database list
          const dbRes = await withClientTimeout(
            DBGetDatabases(dbTestConfig as any),
            rpcTimeoutMs,
            t("connection.modal.test.databaseListTimeout", {
              seconds: timeoutSeconds,
            }),
          );
          if (dbRes.success) {
            const dbRows = Array.isArray(dbRes.data) ? dbRes.data : [];
            const dbs = dbRows
              .map((row: any) => row?.Database || row?.database)
              .filter(
                (name: any) => typeof name === "string" && name.trim() !== "",
              );
            setDbList(dbs);
            if (dbs.length === 0) {
              message.warning(
                values.type === "dameng"
                  ? t("connection.modal.test.noVisibleSchema")
                  : t("connection.modal.test.noVisibleDatabaseList"),
              );
            }
          } else {
            setDbList([]);
            message.warning(
              t("connection.modal.test.databaseListFailure", {
                detail: normalizeConnectionSecretErrorMessage(
                  dbRes.message,
                  t("connection.modal.error.unknown"),
                ),
              }),
            );
          }
        }
      } else {
        applyTestFailureFeedback({
          kind: "runtime",
          reason: res?.message,
          fallbackKey: "connection.modal.test.fallback.rejected",
        });
      }
    } catch (e: unknown) {
      if (e && typeof e === "object" && "errorFields" in e) {
        applyTestFailureFeedback({
          kind: "validation",
          fallbackKey: "connection.modal.test.fallback.validation",
        });
        return;
      }
      const reason =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : t("connection.modal.test.fallback.unknownException");
      applyTestFailureFeedback({
        kind: "runtime",
        reason,
        fallbackKey: "connection.modal.test.fallback.unknownException",
      });
    } finally {
      testInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleDiscoverMongoMembers = async () => {
    if (discoveringMembers || dbType !== "mongodb") {
      return;
    }
    try {
      await form.validateFields();
      const values = form.getFieldsValue(true);
      setDiscoveringMembers(true);
      const blockingSecretClearMessage = getBlockingSecretClearMessage(values);
      if (blockingSecretClearMessage) {
        message.error(blockingSecretClearMessage);
        return;
      }
      const config = await buildConfig(values, false);
      if (initialValues?.id) {
        config.id = initialValues.id;
      }
      const result = await MongoDiscoverMembers(config as any);
      if (!result.success) {
        message.error(
          normalizeConnectionSecretErrorMessage(
            result.message,
            t("connection.modal.mongo.discover.failure"),
          ),
        );
        return;
      }
      const data = (result.data as Record<string, any>) || {};
      const membersRaw = Array.isArray(data.members) ? data.members : [];
      const members: MongoMemberInfo[] = membersRaw
        .map((item: any) => ({
          host: String(item.host || "").trim(),
          role: String(item.role || item.state || "").trim(),
          state: String(item.state || item.role || "").trim(),
          stateCode: Number(item.stateCode || 0),
          healthy: !!item.healthy,
          isSelf: !!item.isSelf,
        }))
        .filter((item: MongoMemberInfo) => !!item.host);
      setMongoMembers(members);
      if (!form.getFieldValue("mongoReplicaSet") && data.replicaSet) {
        form.setFieldValue("mongoReplicaSet", String(data.replicaSet));
      }
      message.success(
        result.message ||
          t(
            members.length === 1
              ? "connection.modal.mongo.discover.successOne"
              : "connection.modal.mongo.discover.successMany",
            { count: members.length },
          ),
      );
    } catch (error: any) {
      message.error(
        normalizeConnectionSecretErrorMessage(
          error?.message || error,
          t("connection.modal.mongo.discover.failure"),
        ),
      );
    } finally {
      setDiscoveringMembers(false);
    }
  };

  const buildConfig = async (
    values: any,
    forPersist: boolean,
  ): Promise<ConnectionConfig> => {
    const mergedValues = { ...values };
    if (
      String(mergedValues.type || "")
        .trim()
        .toLowerCase() === "jvm"
    ) {
      if (
        hasUnsupportedJVMEditableModes({
          allowedModes: mergedValues.jvmAllowedModes,
          preferredMode: mergedValues.jvmPreferredMode,
        })
      ) {
        throw new Error(t("connection.modal.jvm.unsupportedMode.saveTest"));
      }
      if (
        hasUnsupportedJVMDiagnosticTransport(
          mergedValues.jvmDiagnosticTransport,
        )
      ) {
        throw new Error(
          t("connection.modal.jvm.unsupportedTransport.saveTest"),
        );
      }
      const existingDiagnostic = initialValues?.config?.jvm?.diagnostic;
      if (
        mergedValues.jvmDiagnosticEnabled === undefined &&
        existingDiagnostic?.enabled !== undefined
      ) {
        mergedValues.jvmDiagnosticEnabled = existingDiagnostic.enabled;
      }
      if (
        String(mergedValues.jvmDiagnosticTransport || "").trim() === "" &&
        existingDiagnostic?.transport
      ) {
        mergedValues.jvmDiagnosticTransport = existingDiagnostic.transport;
      }
      if (
        String(mergedValues.jvmDiagnosticBaseUrl || "").trim() === "" &&
        existingDiagnostic?.baseUrl
      ) {
        mergedValues.jvmDiagnosticBaseUrl = existingDiagnostic.baseUrl;
      }
      if (
        String(mergedValues.jvmDiagnosticTargetId || "").trim() === "" &&
        existingDiagnostic?.targetId
      ) {
        mergedValues.jvmDiagnosticTargetId = existingDiagnostic.targetId;
      }
      if (
        String(mergedValues.jvmDiagnosticApiKey || "").trim() === "" &&
        existingDiagnostic?.apiKey
      ) {
        mergedValues.jvmDiagnosticApiKey = existingDiagnostic.apiKey;
      }
      if (
        mergedValues.jvmDiagnosticAllowObserveCommands === undefined &&
        existingDiagnostic?.allowObserveCommands !== undefined
      ) {
        mergedValues.jvmDiagnosticAllowObserveCommands =
          existingDiagnostic.allowObserveCommands;
      }
      if (
        mergedValues.jvmDiagnosticAllowTraceCommands === undefined &&
        existingDiagnostic?.allowTraceCommands !== undefined
      ) {
        mergedValues.jvmDiagnosticAllowTraceCommands =
          existingDiagnostic.allowTraceCommands;
      }
      if (
        mergedValues.jvmDiagnosticAllowMutatingCommands === undefined &&
        existingDiagnostic?.allowMutatingCommands !== undefined
      ) {
        mergedValues.jvmDiagnosticAllowMutatingCommands =
          existingDiagnostic.allowMutatingCommands;
      }
      if (
        (mergedValues.jvmDiagnosticTimeoutSeconds === undefined ||
          mergedValues.jvmDiagnosticTimeoutSeconds === null ||
          mergedValues.jvmDiagnosticTimeoutSeconds === "") &&
        Number(existingDiagnostic?.timeoutSeconds) > 0
      ) {
        mergedValues.jvmDiagnosticTimeoutSeconds = Number(
          existingDiagnostic?.timeoutSeconds,
        );
      }
      const resolvedJvmAllowedModes = normalizeEditableJVMModes(
        mergedValues.jvmAllowedModes,
      );
      const resolvedJvmTimeout = Number(mergedValues.timeout || 30);
      const preferredJvmMode = String(mergedValues.jvmPreferredMode || "")
        .trim()
        .toLowerCase();
      const resolvedJvmPreferredMode =
        resolvedJvmAllowedModes.find((mode) => mode === preferredJvmMode) ||
        resolvedJvmAllowedModes[0];
      return buildJVMConnectionConfig({
        ...buildDefaultJVMConnectionValues(),
        ...mergedValues,
        jvmAllowedModes: resolvedJvmAllowedModes,
        jvmPreferredMode: resolvedJvmPreferredMode,
        jvmEndpointEnabled: resolvedJvmAllowedModes.includes("endpoint"),
        jvmAgentEnabled: resolvedJvmAllowedModes.includes("agent"),
        timeout: resolvedJvmTimeout,
        jvmEndpointTimeoutSeconds: resolvedJvmTimeout,
      });
    }
    const parsedUriValues = parseUriToValues(
      mergedValues.uri,
      mergedValues.type,
    );
    const isEmptyField = (value: unknown) =>
      value === undefined ||
      value === null ||
      value === "" ||
      value === 0 ||
      (Array.isArray(value) && value.length === 0);
    if (parsedUriValues) {
      Object.entries(parsedUriValues).forEach(([key, value]) => {
        if (
          key === "clickHouseProtocol" &&
          normalizeClickHouseProtocolValue((mergedValues as any)[key]) ===
            "auto" &&
          normalizeClickHouseProtocolValue(value) !== "auto"
        ) {
          (mergedValues as any)[key] = value;
          return;
        }
        if (isEmptyField((mergedValues as any)[key])) {
          (mergedValues as any)[key] = value;
        }
      });
    }

    const type = String(mergedValues.type || "").toLowerCase();
    const defaultPort = getDefaultPortByType(type);
    const selectedOceanBaseProtocol =
      type === "oceanbase"
        ? normalizeOceanBaseProtocolValue(mergedValues.oceanBaseProtocol)
        : "mysql";
    if (type === "clickhouse") {
      const requestedProtocol = normalizeClickHouseProtocolValue(
        mergedValues.clickHouseProtocol,
      );
      const hostSchemeValues = parseClickHouseHTTPUriToValues(
        mergedValues.host,
        Number(mergedValues.port || defaultPort),
      );
      if (hostSchemeValues) {
        mergedValues.host = hostSchemeValues.host;
        mergedValues.port = hostSchemeValues.port;
        if (requestedProtocol !== "native") {
          mergedValues.clickHouseProtocol = "http";
          mergedValues.useSSL = hostSchemeValues.useSSL;
          mergedValues.sslMode = hostSchemeValues.sslMode;
        } else {
          mergedValues.clickHouseProtocol = "native";
        }
        if (isEmptyField(mergedValues.user)) {
          mergedValues.user = hostSchemeValues.user;
        }
        if (isEmptyField(mergedValues.password)) {
          mergedValues.password = hostSchemeValues.password;
        }
        if (isEmptyField(mergedValues.database)) {
          mergedValues.database = hostSchemeValues.database;
        }
      }
    }
    const isFileDbType = isFileDatabaseType(type);
    const sslCapableType = supportsSSLForType(type);

    // Redis 默认不展示用户名字段；若 URI 可解析则以 URI 为准覆盖 user，
    // 同时清理历史默认值 root，避免 go-redis 发送 ACL AUTH(user, pass) 导致 WRONGPASS。
    if (type === "redis") {
      if (
        parsedUriValues &&
        Object.prototype.hasOwnProperty.call(parsedUriValues, "user")
      ) {
        mergedValues.user = String((parsedUriValues as any).user || "");
      } else if (String(mergedValues.user || "").trim() === "root") {
        mergedValues.user = "";
      }
    }
    const sslModeRaw = String(mergedValues.sslMode || "preferred")
      .trim()
      .toLowerCase();
    const sslMode: "preferred" | "required" | "skip-verify" | "disable" =
      sslModeRaw === "required"
        ? "required"
        : sslModeRaw === "skip-verify"
          ? "skip-verify"
          : sslModeRaw === "disable"
            ? "disable"
            : "preferred";
    const effectiveUseSSL = sslCapableType && !!mergedValues.useSSL;
    const sslCAPath = sslCapableType
      ? String(mergedValues.sslCAPath || "").trim()
      : "";
    const sslCertPath = sslCapableType
      ? String(mergedValues.sslCertPath || "").trim()
      : "";
    const sslKeyPath = sslCapableType
      ? String(mergedValues.sslKeyPath || "").trim()
      : "";
    if (type === "dameng" && effectiveUseSSL && (!sslCertPath || !sslKeyPath)) {
      throw new Error(t("connection.modal.validation.ssl.damengRequired"));
    }
    if (effectiveUseSSL && supportsSSLClientCertificateForType(type) && (!!sslCertPath !== !!sslKeyPath)) {
      throw new Error(t("connection.modal.validation.ssl.clientPairRequired"));
    }

    let primaryHost = "localhost";
    let primaryPort = defaultPort;
    if (isFileDbType) {
      // 文件型数据库（sqlite/duckdb）这里的 host 即数据库文件路径，不应参与 host:port 拼接与解析。
      primaryHost = normalizeFileDbPath(String(mergedValues.host || "").trim());
      primaryPort = 0;
    } else {
      const parsedPrimary = parseHostPort(
        toAddress(
          mergedValues.host || "localhost",
          Number(mergedValues.port || defaultPort),
          defaultPort,
        ),
        defaultPort,
      );
      primaryHost = parsedPrimary?.host || "localhost";
      primaryPort = parsedPrimary?.port || defaultPort;
    }

    let hosts: string[] = [];
    let topology: "single" | "replica" | "cluster" | "sentinel" | undefined;
    let replicaSet = "";
    let authSource = "";
    let readPreference = "";
    let mysqlReplicaUser = "";
    let mysqlReplicaPassword = "";
    let mongoSrvEnabled = false;
    let mongoAuthMechanism = "";
    let mongoReplicaUser = "";
    let mongoReplicaPassword = "";
    let redisSentinelMaster = "";
    let redisSentinelUser = "";
    let redisSentinelPassword = "";
    const savePassword =
      type === "mongodb" ? mergedValues.savePassword !== false : true;

    if (isMySQLCompatibleType(type) && selectedOceanBaseProtocol !== "oracle") {
      const replicas =
        mergedValues.mysqlTopology === "replica"
          ? normalizeAddressList(mergedValues.mysqlReplicaHosts, defaultPort)
          : [];
      const allHosts = normalizeAddressList(
        [`${primaryHost}:${primaryPort}`, ...replicas],
        defaultPort,
      );
      if (mergedValues.mysqlTopology === "replica" || allHosts.length > 1) {
        hosts = allHosts;
        topology = "replica";
        mysqlReplicaUser = String(mergedValues.mysqlReplicaUser || "").trim();
        mysqlReplicaPassword = String(mergedValues.mysqlReplicaPassword || "");
      } else {
        topology = "single";
      }
    }

    if (type === "kafka") {
      const brokers =
        mergedValues.kafkaTopology === "cluster"
          ? normalizeAddressList(mergedValues.kafkaHosts, defaultPort)
          : [];
      const allHosts = normalizeAddressList(
        [`${primaryHost}:${primaryPort}`, ...brokers],
        defaultPort,
      );
      if (mergedValues.kafkaTopology === "cluster" || allHosts.length > 1) {
        hosts = allHosts;
        topology = "cluster";
      } else {
        topology = "single";
      }
    }

    if (type === "mqtt") {
      const brokers =
        mergedValues.mqttTopology === "cluster"
          ? normalizeAddressList(mergedValues.mqttHosts, defaultPort)
          : [];
      const allHosts = normalizeAddressList(
        [`${primaryHost}:${primaryPort}`, ...brokers],
        defaultPort,
      );
      if (mergedValues.mqttTopology === "cluster" || allHosts.length > 1) {
        hosts = allHosts;
        topology = "cluster";
      } else {
        topology = "single";
      }
    }

    if (type === "rocketmq") {
      const nameservers =
        mergedValues.rocketmqTopology === "cluster"
          ? normalizeAddressList(mergedValues.rocketmqHosts, defaultPort)
          : [];
      const allHosts = normalizeAddressList(
        [`${primaryHost}:${primaryPort}`, ...nameservers],
        defaultPort,
      );
      if (mergedValues.rocketmqTopology === "cluster" || allHosts.length > 1) {
        hosts = allHosts;
        topology = "cluster";
      } else {
        topology = "single";
      }
    }

    if (type === "mongodb") {
      mongoSrvEnabled = !!mergedValues.mongoSrv;
      const extraHosts =
        mergedValues.mongoTopology === "replica"
          ? mongoSrvEnabled
            ? normalizeMongoSrvHostList(mergedValues.mongoHosts, defaultPort)
            : normalizeAddressList(mergedValues.mongoHosts, defaultPort)
          : [];
      const primarySeed = mongoSrvEnabled
        ? primaryHost
        : `${primaryHost}:${primaryPort}`;
      const allHosts = mongoSrvEnabled
        ? normalizeMongoSrvHostList([primarySeed, ...extraHosts], defaultPort)
        : normalizeAddressList([primarySeed, ...extraHosts], defaultPort);
      if (
        mergedValues.mongoTopology === "replica" ||
        allHosts.length > 1 ||
        mergedValues.mongoReplicaSet
      ) {
        hosts = allHosts;
        topology = "replica";
        mongoReplicaUser = String(mergedValues.mongoReplicaUser || "").trim();
        mongoReplicaPassword = String(mergedValues.mongoReplicaPassword || "");
      } else {
        topology = "single";
      }
      replicaSet = String(mergedValues.mongoReplicaSet || "").trim();
      authSource = String(
        mergedValues.mongoAuthSource || mergedValues.database || "admin",
      ).trim();
      readPreference = String(
        mergedValues.mongoReadPreference || "primary",
      ).trim();
      mongoAuthMechanism = String(mergedValues.mongoAuthMechanism || "")
        .trim()
        .toUpperCase();
    }

    if (type === "redis") {
      const redisDraft = resolveRedisConfigDraft(
        mergedValues,
        primaryHost,
        primaryPort,
        defaultPort,
      );
      primaryPort = redisDraft.primaryPort;
      hosts = redisDraft.hosts;
      topology = redisDraft.topology;
      redisSentinelMaster = redisDraft.redisSentinelMaster;
      redisSentinelUser = redisDraft.redisSentinelUser;
      redisSentinelPassword = redisDraft.redisSentinelPassword;
      mergedValues.redisDB = redisDraft.redisDB;
    }

    const sshConfig = mergedValues.useSSH
      ? {
          host: mergedValues.sshHost,
          port: Number(mergedValues.sshPort),
          user: mergedValues.sshUser,
          password: mergedValues.sshPassword || "",
          keyPath: mergedValues.sshKeyPath || "",
        }
      : { host: "", port: 22, user: "", password: "", keyPath: "" };
    const effectiveUseHttpTunnel =
      !isFileDbType && !!mergedValues.useHttpTunnel;
    const effectiveUseProxy =
      !isFileDbType && !!mergedValues.useProxy && !effectiveUseHttpTunnel;
    const proxyTypeRaw = String(
      mergedValues.proxyType || "socks5",
    ).toLowerCase();
    const proxyType: "socks5" | "http" =
      proxyTypeRaw === "http" ? "http" : "socks5";
    const proxyConfig: NonNullable<ConnectionConfig["proxy"]> =
      effectiveUseProxy
        ? {
            type: proxyType,
            host: String(mergedValues.proxyHost || "").trim(),
            port: Number(
              mergedValues.proxyPort || (proxyTypeRaw === "http" ? 8080 : 1080),
            ),
            user: String(mergedValues.proxyUser || "").trim(),
            password: mergedValues.proxyPassword || "",
          }
        : {
            type: "socks5",
            host: "",
            port: 1080,
            user: "",
            password: "",
          };
    const httpTunnelConfig: NonNullable<ConnectionConfig["httpTunnel"]> =
      effectiveUseHttpTunnel
        ? {
            host: String(mergedValues.httpTunnelHost || "").trim(),
            port: Number(mergedValues.httpTunnelPort || 8080),
            user: String(mergedValues.httpTunnelUser || "").trim(),
            password: mergedValues.httpTunnelPassword || "",
          }
        : {
            host: "",
            port: 8080,
            user: "",
            password: "",
          };
    if (effectiveUseHttpTunnel) {
      if (!httpTunnelConfig.host) {
        throw new Error(t("connection.modal.validation.httpTunnel.hostRequired"));
      }
      if (
        !Number.isFinite(httpTunnelConfig.port) ||
        httpTunnelConfig.port <= 0 ||
        httpTunnelConfig.port > 65535
      ) {
        throw new Error(t("connection.modal.validation.httpTunnel.portRange"));
      }
    }

    const keepPassword = !forPersist || savePassword;
    const normalizedConnectionParams = supportsConnectionParamsForType(type)
      ? type === "oceanbase"
        ? normalizeOceanBaseConnectionParamsText(
            mergedValues.connectionParams,
            selectedOceanBaseProtocol,
          )
        : normalizeConnectionParamsText(mergedValues.connectionParams)
      : "";

    return {
      type: mergedValues.type,
      host: primaryHost,
      port: Number(primaryPort || 0),
      user: mergedValues.user || "",
      password: keepPassword ? mergedValues.password || "" : "",
      savePassword: savePassword,
      database: mergedValues.database || "",
      useSSL: effectiveUseSSL,
      sslMode: effectiveUseSSL ? sslMode : "disable",
      sslCAPath: sslCAPath,
      sslCertPath: sslCertPath,
      sslKeyPath: sslKeyPath,
      useSSH: !!mergedValues.useSSH,
      ssh: sshConfig,
      useProxy: effectiveUseProxy,
      proxy: proxyConfig,
      useHttpTunnel: effectiveUseHttpTunnel,
      httpTunnel: httpTunnelConfig,
      driver: mergedValues.driver,
      dsn: mergedValues.dsn,
      connectionParams: normalizedConnectionParams,
      timeout: Number(mergedValues.timeout || 30),
      redisDB: Number.isFinite(Number(mergedValues.redisDB))
        ? Math.max(0, Math.trunc(Number(mergedValues.redisDB)))
        : 0,
      redisSentinelMaster: redisSentinelMaster,
      redisSentinelUser: redisSentinelUser,
      redisSentinelPassword: keepPassword ? redisSentinelPassword : "",
      uri: String(mergedValues.uri || "").trim(),
      clickHouseProtocol:
        type === "clickhouse"
          ? normalizeClickHouseProtocolValue(mergedValues.clickHouseProtocol)
          : undefined,
      oceanBaseProtocol:
        type === "oceanbase" ? selectedOceanBaseProtocol : undefined,
      hosts: hosts,
      topology: topology,
      mysqlReplicaUser: mysqlReplicaUser,
      mysqlReplicaPassword: keepPassword ? mysqlReplicaPassword : "",
      replicaSet: replicaSet,
      authSource: authSource,
      readPreference: readPreference,
      mongoSrv: mongoSrvEnabled,
      mongoAuthMechanism: mongoAuthMechanism,
      mongoReplicaUser: mongoReplicaUser,
      mongoReplicaPassword: keepPassword ? mongoReplicaPassword : "",
    };
  };

  const handleTypeSelect = (type: string) => {
    const normalized = normalizeDriverType(type);
    const snapshot = driverStatusMap[normalized];
    if (snapshot && !snapshot.connectable) {
      const driverName = snapshot.name || type;
      const reason =
        snapshot.message ||
        t("connection.modal.driver.unavailableFallback", {
          name: driverName,
        });
      setTypeSelectWarning({ driverName, reason });
      return;
    }
    setTypeSelectWarning(null);
    setDbType(type);
    form.setFieldsValue({
      type: type,
      clickHouseProtocol: type === "clickhouse" ? "auto" : undefined,
      oceanBaseProtocol: type === "oceanbase" ? "mysql" : undefined,
    });

    const defaultPort = getDefaultPortByType(type);
    if (type === "jvm") {
      const jvmDefaultValues = buildDefaultJVMConnectionValues();
      setUseSSL(false);
      setUseSSH(false);
      setUseProxy(false);
      setUseHttpTunnel(false);
      form.setFieldsValue({
        ...jvmDefaultValues,
        user: "",
        password: "",
        database: "",
        useSSL: false,
        sslMode: undefined,
        sslCAPath: undefined,
        sslCertPath: undefined,
        sslKeyPath: undefined,
        useSSH: false,
        sshHost: "",
        sshPort: 22,
        sshUser: "",
        sshPassword: "",
        sshKeyPath: "",
        useProxy: false,
        proxyType: "socks5",
        proxyHost: "",
        proxyPort: 1080,
        proxyUser: "",
        proxyPassword: "",
        useHttpTunnel: false,
        httpTunnelHost: "",
        httpTunnelPort: 8080,
        httpTunnelUser: "",
        httpTunnelPassword: "",
        timeout: 30,
        uri: "",
        connectionParams: "",
        includeDatabases: undefined,
        includeRedisDatabases: undefined,
        mysqlTopology: "single",
        rocketmqTopology: "single",
        mqttTopology: "single",
        kafkaTopology: "single",
        redisTopology: "single",
        mongoTopology: "single",
        mongoSrv: false,
        mongoReadPreference: "primary",
        mongoReplicaSet: "",
        mongoAuthSource: "",
        mongoAuthMechanism: "",
        savePassword: true,
        mysqlReplicaHosts: [],
        rocketmqHosts: [],
        mqttHosts: [],
        kafkaHosts: [],
        redisHosts: [],
        redisSentinelMaster: "",
        redisSentinelUser: "",
        redisSentinelPassword: "",
        mongoHosts: [],
        mysqlReplicaUser: "",
        mysqlReplicaPassword: "",
        mongoReplicaUser: "",
        mongoReplicaPassword: "",
        redisDB: 0,
        jvmEndpointTimeoutSeconds: 30,
        jvmJmxHost: "",
        jvmJmxPort: undefined,
        jvmJmxUsername: "",
        jvmJmxPassword: "",
        jvmAgentEnabled: false,
        jvmAgentBaseUrl: "",
        jvmAgentApiKey: "",
      });
    } else if (isFileDatabaseType(type)) {
      setUseSSL(false);
      setUseSSH(false);
      setUseProxy(false);
      setUseHttpTunnel(false);
      form.setFieldsValue({
        host: "",
        port: 0,
        user: "",
        password: "",
        database: "",
        useSSL: false,
        sslMode: "preferred",
        sslCAPath: "",
        sslCertPath: "",
        sslKeyPath: "",
        useSSH: false,
        sshHost: "",
        sshPort: 22,
        sshUser: "",
        sshPassword: "",
        sshKeyPath: "",
        useProxy: false,
        proxyType: "socks5",
        proxyHost: "",
        proxyPort: 1080,
        proxyUser: "",
        proxyPassword: "",
        useHttpTunnel: false,
        httpTunnelHost: "",
        httpTunnelPort: 8080,
        httpTunnelUser: "",
        httpTunnelPassword: "",
        mysqlTopology: "single",
        rocketmqTopology: "single",
        mqttTopology: "single",
        kafkaTopology: "single",
        redisTopology: "single",
        mongoTopology: "single",
        mongoSrv: false,
        mongoReadPreference: "primary",
        mongoReplicaSet: "",
        mongoAuthSource: "",
        mongoAuthMechanism: "",
        savePassword: true,
        mysqlReplicaHosts: [],
        rocketmqHosts: [],
        mqttHosts: [],
        kafkaHosts: [],
        redisHosts: [],
        redisSentinelMaster: "",
        redisSentinelUser: "",
        redisSentinelPassword: "",
        mongoHosts: [],
        mysqlReplicaUser: "",
        mysqlReplicaPassword: "",
        mongoReplicaUser: "",
        mongoReplicaPassword: "",
        redisDB: 0,
        connectionParams: "",
      });
    } else if (type !== "custom") {
      const defaultUser =
        type === "clickhouse" ? "default" : (type === "redis" || type === "elasticsearch" || type === "chroma" || type === "qdrant" || type === "rocketmq" || type === "mqtt" || type === "kafka" || type === "rabbitmq") ? "" : "root";
      const sslCapableType = supportsSSLForType(type);
      setUseSSL(false);
      setUseHttpTunnel(false);
      form.setFieldsValue({
        user: defaultUser,
        database: "",
        port: defaultPort,
        useSSL: sslCapableType ? false : undefined,
        sslMode: sslCapableType ? "preferred" : undefined,
        sslCAPath: sslCapableType ? "" : undefined,
        sslCertPath: sslCapableType ? "" : undefined,
        sslKeyPath: sslCapableType ? "" : undefined,
        useHttpTunnel: false,
        httpTunnelHost: "",
        httpTunnelPort: 8080,
        httpTunnelUser: "",
        httpTunnelPassword: "",
        mysqlTopology: "single",
        rocketmqTopology: "single",
        mqttTopology: "single",
        kafkaTopology: "single",
        redisTopology: "single",
        mongoTopology: "single",
        mongoSrv: false,
        mongoReadPreference: "primary",
        mongoReplicaSet: "",
        mongoAuthSource: "",
        mongoAuthMechanism: "",
        savePassword: true,
        mysqlReplicaHosts: [],
        rocketmqHosts: [],
        mqttHosts: [],
        kafkaHosts: [],
        redisHosts: [],
        redisSentinelMaster: "",
        redisSentinelUser: "",
        redisSentinelPassword: "",
        mongoHosts: [],
        mysqlReplicaUser: "",
        mysqlReplicaPassword: "",
        mongoReplicaUser: "",
        mongoReplicaPassword: "",
        redisDB: 0,
        connectionParams: "",
      });
    }

    setMongoMembers([]);
    setStep(2);

    if (!driverStatusLoaded || !snapshot) {
      void refreshDriverStatus();
    }
  };

  const isFileDb = isFileDatabaseType(dbType);
  const isCustom = dbType === "custom";
  const isRedis = dbType === "redis";
  const isJVM = dbType === "jvm";
  const connectionConfigLayout = resolveConnectionConfigLayout(dbType);
  const unsupportedJvmModeMessage =
    isJVM && hasUnsupportedJvmModeSelection
      ? t("connection.modal.jvm.unsupportedMode.banner")
      : "";
  const currentDriverType = resolveConnectionDriverType(dbType, customDriver);
  const hasCurrentDriverType =
    currentDriverType !== "" && currentDriverType !== "custom";
  const currentDriverSnapshot = driverStatusMap[currentDriverType];
  const currentDriverUnavailableReason =
    hasCurrentDriverType &&
    currentDriverSnapshot &&
    !currentDriverSnapshot.connectable
      ? currentDriverSnapshot.message ||
        t("connection.modal.driver.unavailableFallback", {
          name: currentDriverSnapshot.name || dbType,
        })
      : "";
  const currentDriverUpdateReason =
    hasCurrentDriverType &&
    currentDriverSnapshot?.connectable &&
    currentDriverSnapshot.needsUpdate
      ? currentDriverSnapshot.message ||
        currentDriverSnapshot.updateReason ||
        t("connection.modal.driver.updateFallback", {
          name: currentDriverSnapshot.name || dbType,
        })
      : "";
  const driverStatusChecking =
    hasCurrentDriverType && !driverStatusLoaded && step === 2;

  const dbTypeGroups = useMemo(
    () =>
      buildConnectionTypeGroups(t).map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          icon: getDbIcon(item.key, undefined, 36),
        })),
      })),
    [],
  );

  const dbTypes = getAllConnectionTypeCatalogItems();

  const renderStep1 = () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: "100%",
      }}
    >
      <div style={{ ...modalInnerSectionStyle, paddingBottom: 12 }}>
        <div
          style={{
            marginBottom: 12,
            color: darkMode ? "#f5f7ff" : "#162033",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {t("connection.modal.step1.sectionTitle")}
        </div>
        <div style={modalMutedTextStyle}>
          {t("connection.modal.step1.sectionDescription")}
        </div>
      </div>
      {typeSelectWarning && (
        <Alert
          type="warning"
          showIcon
          closable
          message={t("connection.modal.typeWarning.unavailable", {
            name: typeSelectWarning.driverName,
          })}
          description={
            <Space size={8}>
              <span>{typeSelectWarning.reason}</span>
              <Button
                type="link"
                size="small"
                onClick={() => onOpenDriverManager?.()}
              >
                {t("connection.modal.driver.installAction")}
              </Button>
            </Space>
          }
          onClose={() => setTypeSelectWarning(null)}
        />
      )}
      <div
        style={{
          ...modalInnerSectionStyle,
          display: "flex",
          flex: 1,
          minHeight: 0,
          padding: 12,
        }}
      >
        {/* 左侧分类导航 */}
        <div
          style={{
            width: 148,
            borderRight: `1px solid ${step1SidebarDividerColor}`,
            paddingRight: 10,
            flexShrink: 0,
            overflowY: "auto",
          }}
        >
          {dbTypeGroups.map((group, idx) => (
            <div
              key={group.label}
              onClick={() => setActiveGroup(idx)}
              style={{
                padding: "11px 12px",
                cursor: "pointer",
                borderRadius: 12,
                marginBottom: 6,
                background:
                  activeGroup === idx ? step1SidebarActiveBg : "transparent",
                color:
                  activeGroup === idx ? step1SidebarActiveColor : undefined,
                fontWeight: activeGroup === idx ? 700 : 500,
                transition: "all 0.2s",
                fontSize: 13,
              }}
            >
              {group.label}
            </div>
          ))}
        </div>
        {/* 右侧数据源卡片 */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            paddingLeft: 18,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          <Row gutter={[14, 14]}>
            {dbTypeGroups[activeGroup]?.items.map((item) => (
              <Col span={12} key={item.key}>
                <Card
                  hoverable
                  onClick={() => {
                    void handleTypeSelect(item.key);
                  }}
                  style={{
                    cursor: "pointer",
                    minHeight: 92,
                    borderRadius: 16,
                    border: darkMode
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "1px solid rgba(16,24,40,0.08)",
                    background: darkMode
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(255,255,255,0.80)",
                  }}
                  styles={{
                    body: {
                      padding: 14,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      height: "100%",
                    },
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      background: darkMode
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(22,119,255,0.08)",
                    }}
                  >
                    {item.icon}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text
                      strong
                      style={{
                        fontSize: 14,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "100%",
                        display: "block",
                      }}
                    >
                      {item.name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {getConnectionTypeHint(item.key, t)}
                    </Text>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => {
    const baseInfoSection = (
      <div style={modalInnerSectionStyle}>
        <div
          style={{
            marginBottom: 12,
            color: darkMode ? "#f5f7ff" : "#162033",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {t("connection.modal.config.basic.title")}
        </div>
        <div style={{ ...modalMutedTextStyle, marginBottom: 16 }}>
          {t("connection.modal.config.basic.description")}
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {renderConfigSectionCard({
            sectionKey: "identity",
            icon: <ApiOutlined />,
            badge: (
              <Tag>
                {getConnectionConfigLayoutKindLabel(connectionConfigLayout.kind)}
              </Tag>
            ),
            children: (
              <Form.Item
                name="name"
                label={t("connection.modal.field.name.label")}
                style={{ marginBottom: 0 }}
              >
                <Input
                  {...noAutoCapInputProps}
                  placeholder={
                    isJVM
                      ? t("connection.modal.field.name.placeholder.jvm")
                      : t("connection.modal.field.name.placeholder.default")
                  }
                />
              </Form.Item>
            ),
          })}

          {!isCustom &&
            !isJVM &&
            renderConfigSectionCard({
              sectionKey: "uri",
              icon: <LinkOutlined />,
              children: (
                <>
                  <Form.Item
                    name="uri"
                    label={t("connection.modal.uri.label")}
                    help={t("connection.modal.uri.help")}
                  >
                    <Input.TextArea
                      {...noAutoCapInputProps}
                      rows={3}
                      placeholder={getUriPlaceholder()}
                    />
                  </Form.Item>
                  {supportsConnectionParams && (
                    <Form.Item
                      name="connectionParams"
                      label={t("connection.modal.connectionParams.label")}
                      help={t("connection.modal.connectionParams.help")}
                    >
                      <Input.TextArea
                        {...noAutoCapInputProps}
                        rows={2}
                        placeholder={getConnectionParamsPlaceholder()}
                      />
                    </Form.Item>
                  )}
                  <Space
                    size={8}
                    style={{ marginBottom: uriFeedback ? 12 : 16 }}
                    wrap
                  >
                    <Button onClick={handleGenerateURI}>
                      {t("connection.modal.uri.action.generate")}
                    </Button>
                    <Button onClick={handleParseURI}>
                      {t("connection.modal.uri.action.parse")}
                    </Button>
                    <Button onClick={handleCopyURI}>
                      {t("connection.modal.uri.action.copy")}
                    </Button>
                  </Space>
                  {uriFeedback && (
                    <Alert
                      showIcon
                      closable
                      type={uriFeedback.type}
                      message={resolvedUriFeedbackMessage}
                      onClose={() => setUriFeedback(null)}
                      style={{ marginBottom: 16 }}
                    />
                  )}
                  {renderStoredSecretControls({
                    fieldName: "uri",
                    clearKey: "opaqueURI",
                    hasStoredSecret: initialValues?.hasOpaqueURI,
                    clearLabel: t("connection.modal.uri.stored.clear"),
                    description: t("connection.modal.uri.stored.description"),
                  })}
                </>
              ),
            })}

          {isCustom ? (
            <>
              {renderConfigSectionCard({
                sectionKey: "customDriver",
                icon: <CodeOutlined />,
                children: (
                  <Form.Item
                    name="driver"
                    label={t("connection.modal.field.driver.label")}
                    rules={[
                      {
                        required: true,
                        message: t("connection.modal.field.driver.required"),
                      },
                    ]}
                    help={getCustomConnectionDriverHelp()}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      {...noAutoCapInputProps}
                      placeholder={t("connection.modal.field.driver.placeholder")}
                    />
                  </Form.Item>
                ),
              })}
              {renderConfigSectionCard({
                sectionKey: "customDsn",
                icon: <FileTextOutlined />,
                children: (
                  <>
                    <Form.Item
                      name="dsn"
                      label={t("connection.modal.field.dsn.label")}
                      rules={[createCustomDsnRule()]}
                    >
                      <Input.TextArea
                        {...noAutoCapInputProps}
                        rows={4}
                        placeholder={t("connection.modal.field.dsn.placeholder")}
                      />
                    </Form.Item>
                    {renderStoredSecretControls({
                      fieldName: "dsn",
                      clearKey: "opaqueDSN",
                      hasStoredSecret: initialValues?.hasOpaqueDSN,
                      clearLabel: t("connection.modal.field.dsn.clearSaved"),
                      description: t(
                        "connection.modal.field.dsn.savedDescription",
                      ),
                    })}
                  </>
                ),
              })}
            </>
          ) : isJVM ? (
          <>
            {unsupportedJvmModeMessage && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message={t("connection.modal.jvm.unsupportedMode.alert")}
                description={unsupportedJvmModeMessage}
              />
            )}
            <div style={{ display: "grid", gap: 16 }}>
              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <GatewayOutlined />,
                  t("connection.modal.jvm.target.title"),
                  t("connection.modal.jvm.target.description"),
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 120px",
                    gap: 16,
                    alignItems: "start",
                  }}
                >
                  <Form.Item
                    name="host"
                    label={t("connection.modal.jvm.host.label")}
                    rules={[
                      {
                        required: true,
                        message: t("connection.modal.jvm.host.required"),
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      {...noAutoCapInputProps}
                      placeholder={t("connection.modal.example", {
                        value: "localhost",
                      })}
                    />
                  </Form.Item>
                  <Form.Item
                    name="port"
                    label={t("connection.modal.jvm.port.label")}
                    rules={[
                      {
                        required: true,
                        message: t("connection.modal.jvm.port.required"),
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber style={{ width: "100%" }} min={1} max={65535} />
                  </Form.Item>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 16,
                    marginTop: 16,
                  }}
                >
                  <div style={{ display: "grid", gap: 8 }}>
                    <Text strong>
                      {t("connection.modal.jvm.environment.title")}
                    </Text>
                    {renderChoiceCards({
                      fieldName: "jvmEnvironment",
                      value: String(jvmEnvironment),
                      minWidth: 120,
                      options: [
                        {
                          value: "dev",
                          label: t(
                            "connection.modal.jvm.environment.dev.label",
                          ),
                          description: t(
                            "connection.modal.jvm.environment.dev.description",
                          ),
                        },
                        {
                          value: "uat",
                          label: t(
                            "connection.modal.jvm.environment.staging.label",
                          ),
                          description: t(
                            "connection.modal.jvm.environment.staging.description",
                          ),
                        },
                        {
                          value: "prod",
                          label: t(
                            "connection.modal.jvm.environment.prod.label",
                          ),
                          description: t(
                            "connection.modal.jvm.environment.prod.description",
                          ),
                        },
                      ],
                    })}
                  </div>
                  <Form.Item
                    name="timeout"
                    label={t("connection.modal.network.timeout.label")}
                    rules={[
                      {
                        type: "number",
                        min: 1,
                        max: 300,
                        message: t("connection.modal.network.timeout.range"),
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber
                      style={{ width: "100%" }}
                      min={1}
                      max={300}
                      placeholder={t("connection.modal.example", {
                        value: "30",
                      })}
                    />
                  </Form.Item>
                  <Form.Item
                    name="jvmReadOnly"
                    label={t("connection.modal.jvm.securityPolicy.label")}
                    valuePropName="checked"
                    style={{ marginBottom: 0 }}
                  >
                    <Checkbox>{t("connection.modal.jvm.readonlyPreferred")}</Checkbox>
                  </Form.Item>
                </div>
              </div>

              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <ClusterOutlined />,
                  t("connection.modal.jvm.accessMode.title"),
                  t("connection.modal.jvm.accessMode.description"),
                )}
                <Form.Item
                  name="jvmAllowedModes"
                  hidden
                  rules={[
                    {
                      required: true,
                      message: t("connection.modal.jvm.accessMode.required"),
                    },
                  ]}
                >
                  <Select mode="multiple" />
                </Form.Item>
                <Form.Item
                  name="jvmPreferredMode"
                  hidden
                  rules={[
                    {
                      required: true,
                      message: t("connection.modal.jvm.preferredMode.required"),
                    },
                  ]}
                >
                  <Input {...noAutoCapInputProps} />
                </Form.Item>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 14,
                  }}
                >
                  {JVM_EDITABLE_MODES.map((mode) => {
                    const meta = resolveJVMModeMeta(mode);
                    const enabled = normalizedJvmAllowedModes.includes(mode);
                    const preferred = jvmPreferredMode === mode;
                    return (
                      <div
                        key={mode}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleJvmModeCardSelect(mode)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleJvmModeCardSelect(mode);
                          }
                        }}
                        aria-pressed={enabled}
                        style={{
                          textAlign: "left",
                          padding: 14,
                          borderRadius: 16,
                          border: enabled
                            ? darkMode
                              ? "1px solid rgba(255,214,102,0.36)"
                              : "1px solid rgba(22,119,255,0.34)"
                            : darkMode
                              ? "1px solid rgba(255,255,255,0.08)"
                              : "1px solid rgba(16,24,40,0.08)",
                          background: enabled
                            ? darkMode
                              ? "rgba(255,214,102,0.08)"
                              : "rgba(22,119,255,0.06)"
                            : darkMode
                              ? "rgba(255,255,255,0.03)"
                              : "rgba(16,24,40,0.03)",
                          boxShadow: preferred
                            ? darkMode
                              ? "0 0 0 2px rgba(255,214,102,0.12)"
                              : "0 0 0 2px rgba(22,119,255,0.10)"
                            : "none",
                          color: darkMode ? "#f5f7ff" : "#162033",
                          cursor: "pointer",
                          transition: "all 120ms ease",
                        }}
                      >
                        <Space size={8} wrap>
                          <Tag color={enabled ? "blue" : "default"}>
                            {meta.label}
                          </Tag>
                          {preferred ? (
                            <Tag color="green">
                              {t("connection.modal.jvm.tag.preferred")}
                            </Tag>
                          ) : null}
                          {!enabled ? (
                            <Tag>{t("connection.modal.jvm.tag.notEnabled")}</Tag>
                          ) : null}
                        </Space>
                        <div style={{ ...modalMutedTextStyle, marginTop: 8 }}>
                          {mode === "jmx"
                            ? t("connection.modal.jvm.mode.jmx.description")
                            : mode === "endpoint"
                              ? t(
                                  "connection.modal.jvm.mode.endpoint.description",
                                )
                              : t("connection.modal.jvm.mode.agent.description")}
                        </div>
                        <Button
                          size="small"
                          type={enabled ? "default" : "primary"}
                          disabled={enabled && normalizedJvmAllowedModes.length <= 1}
                          onClick={(event) => handleJvmModeToggle(mode, event)}
                          style={{ marginTop: 12, borderRadius: 999 }}
                        >
                          {enabled
                            ? t("connection.modal.jvm.mode.disable")
                            : t("connection.modal.jvm.mode.enablePreferred")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <div style={{ ...modalMutedTextStyle, marginTop: 12 }}>
                  {t("connection.modal.jvm.preferredSummary", {
                    mode: resolveJVMModeMeta(String(jvmPreferredMode || "jmx"))
                      .label,
                  })}
                </div>
              </div>

              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <ApiOutlined />,
                  "JMX",
                  t("connection.modal.jvm.jmx.description"),
                  <Tag color={normalizedJvmAllowedModes.includes("jmx") ? "green" : "default"}>
                    {normalizedJvmAllowedModes.includes("jmx")
                      ? t("connection.modal.jvm.tag.enabled")
                      : t("connection.modal.jvm.tag.notEnabled")}
                  </Tag>,
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 120px",
                    gap: 16,
                  }}
                >
                  <Form.Item
                    name="jvmJmxHost"
                    label={t("connection.modal.jvm.jmx.host.label")}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      {...noAutoCapInputProps}
                      disabled={!normalizedJvmAllowedModes.includes("jmx")}
                      placeholder={t("connection.modal.jvm.jmx.host.placeholder")}
                    />
                  </Form.Item>
                  <Form.Item
                    name="jvmJmxPort"
                    label={t("connection.modal.jvm.jmx.port.label")}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber
                      style={{ width: "100%" }}
                      min={1}
                      max={65535}
                      disabled={!normalizedJvmAllowedModes.includes("jmx")}
                      placeholder={t("connection.modal.jvm.jmx.port.placeholder")}
                    />
                  </Form.Item>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 16,
                    marginTop: 16,
                  }}
                >
                  <Form.Item
                    name="jvmJmxUsername"
                    label={t("connection.modal.jvm.jmx.username.label")}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      {...noAutoCapInputProps}
                      disabled={!normalizedJvmAllowedModes.includes("jmx")}
                      placeholder={t(
                        "connection.modal.jvm.jmx.username.placeholder",
                      )}
                    />
                  </Form.Item>
                  <Form.Item
                    name="jvmJmxPassword"
                    label={t("connection.modal.jvm.jmx.password.label")}
                    style={{ marginBottom: 0 }}
                  >
                    <Input.Password
                      {...noAutoCapInputProps}
                      disabled={!normalizedJvmAllowedModes.includes("jmx")}
                      placeholder={t(
                        "connection.modal.jvm.jmx.password.placeholder",
                      )}
                    />
                  </Form.Item>
                </div>
              </div>

              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <CodeOutlined />,
                  "Endpoint",
                  t("connection.modal.jvm.endpoint.description"),
                  <Tag
                    color={
                      normalizedJvmAllowedModes.includes("endpoint")
                        ? "green"
                        : "default"
                    }
                  >
                    {normalizedJvmAllowedModes.includes("endpoint")
                      ? t("connection.modal.jvm.tag.enabled")
                      : t("connection.modal.jvm.tag.notEnabled")}
                  </Tag>,
                )}
                <Form.Item
                  name="jvmEndpointBaseUrl"
                  label={t("connection.modal.jvm.endpoint.address.label")}
                  rules={[
                    {
                      required: jvmPreferredMode === "endpoint",
                      message: t(
                        "connection.modal.jvm.endpoint.address.required",
                      ),
                    },
                  ]}
                  help={t("connection.modal.jvm.endpoint.address.help")}
                >
                  <Input
                    {...noAutoCapInputProps}
                    disabled={!normalizedJvmAllowedModes.includes("endpoint")}
                    placeholder={t(
                      "connection.modal.jvm.endpoint.address.placeholder",
                    )}
                  />
                </Form.Item>
                <Form.Item
                  name="jvmEndpointApiKey"
                  label={t("connection.modal.jvm.endpoint.apiKey.label")}
                  style={{ marginBottom: 0 }}
                >
                  <Input.Password
                    {...noAutoCapInputProps}
                    disabled={!normalizedJvmAllowedModes.includes("endpoint")}
                    placeholder={t(
                      "connection.modal.jvm.endpoint.apiKey.placeholder",
                    )}
                  />
                </Form.Item>
              </div>

              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <ThunderboltOutlined />,
                  "Agent",
                  t("connection.modal.jvm.agent.description"),
                  <Tag color={normalizedJvmAllowedModes.includes("agent") ? "green" : "default"}>
                    {normalizedJvmAllowedModes.includes("agent")
                      ? t("connection.modal.jvm.tag.enabled")
                      : t("connection.modal.jvm.tag.notEnabled")}
                  </Tag>,
                )}
                <Form.Item
                  name="jvmAgentBaseUrl"
                  label={t("connection.modal.jvm.agent.address.label")}
                  rules={[
                    {
                      required: jvmPreferredMode === "agent",
                      message: t("connection.modal.jvm.agent.address.required"),
                    },
                  ]}
                  help={t("connection.modal.jvm.agent.address.help")}
                >
                  <Input
                    {...noAutoCapInputProps}
                    disabled={!normalizedJvmAllowedModes.includes("agent")}
                    placeholder={t(
                      "connection.modal.jvm.agent.address.placeholder",
                    )}
                  />
                </Form.Item>
                <Form.Item
                  name="jvmAgentApiKey"
                  label={t("connection.modal.jvm.agent.apiKey.label")}
                  style={{ marginBottom: 0 }}
                >
                  <Input.Password
                    {...noAutoCapInputProps}
                    disabled={!normalizedJvmAllowedModes.includes("agent")}
                    placeholder={t(
                      "connection.modal.jvm.agent.apiKey.placeholder",
                    )}
                  />
                </Form.Item>
              </div>

              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <SafetyCertificateOutlined />,
                  t("connection.modal.jvm.diagnostic.title"),
                  t("connection.modal.jvm.diagnostic.description"),
                  <Form.Item
                    name="jvmDiagnosticEnabled"
                    valuePropName="checked"
                    style={{ marginBottom: 0 }}
                  >
                    <Switch
                      checkedChildren={t("connection.modal.jvm.switch.on")}
                      unCheckedChildren={t("connection.modal.jvm.switch.off")}
                    />
                  </Form.Item>,
                )}
                {jvmDiagnosticEnabled ? (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "220px minmax(0, 1fr)",
                        gap: 16,
                      }}
                    >
                      <div style={{ display: "grid", gap: 8 }}>
                        <Text strong>
                          {t("connection.modal.jvm.diagnostic.transport.label")}
                        </Text>
                        {renderChoiceCards({
                          fieldName: "jvmDiagnosticTransport",
                          value: String(jvmDiagnosticTransport),
                          options: [
                            {
                              value: "agent-bridge",
                              label: t(
                                "connection.modal.jvm.diagnostic.transport.agent_bridge",
                              ),
                              description: t(
                                "connection.modal.jvm.diagnostic.transport.agentBridge.description",
                              ),
                            },
                            {
                              value: "arthas-tunnel",
                              label: t(
                                "connection.modal.jvm.diagnostic.transport.arthas_tunnel",
                              ),
                              description: t(
                                "connection.modal.jvm.diagnostic.transport.arthasTunnel.description",
                              ),
                            },
                          ],
                        })}
                      </div>
                      <Form.Item
                        name="jvmDiagnosticBaseUrl"
                        label={
                          jvmDiagnosticTransport === "arthas-tunnel"
                            ? t(
                                "connection.modal.jvm.diagnostic.arthasTunnelAddress.label",
                              )
                            : t(
                                "connection.modal.jvm.diagnostic.bridgeAddress.label",
                              )
                        }
                        rules={[
                          {
                            required: true,
                            message:
                              jvmDiagnosticTransport === "arthas-tunnel"
                                ? t(
                                    "connection.modal.jvm.diagnostic.arthasTunnelAddress.required",
                                  )
                                : t(
                                    "connection.modal.jvm.diagnostic.bridgeAddress.required",
                                  ),
                          },
                        ]}
                        help={
                          jvmDiagnosticTransport === "arthas-tunnel"
                            ? t(
                                "connection.modal.jvm.diagnostic.arthasTunnelAddress.help",
                              )
                            : t(
                                "connection.modal.jvm.diagnostic.bridgeAddress.help",
                              )
                        }
                      >
                        <Input
                          {...noAutoCapInputProps}
                          placeholder={
                            jvmDiagnosticTransport === "arthas-tunnel"
                              ? "http://127.0.0.1:7777"
                              : "http://127.0.0.1:19091/gonavi/diag"
                          }
                        />
                      </Form.Item>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) 220px",
                        gap: 16,
                      }}
                    >
                      <Form.Item
                        name="jvmDiagnosticTargetId"
                        label={
                          jvmDiagnosticTransport === "arthas-tunnel"
                            ? t(
                                "connection.modal.jvm.diagnostic.targetId.agentId.label",
                              )
                            : t(
                                "connection.modal.jvm.diagnostic.targetId.label",
                              )
                        }
                        rules={
                          jvmDiagnosticTransport === "arthas-tunnel"
                            ? [
                                {
                                  required: true,
                                  message: t(
                                    "connection.modal.jvm.diagnostic.targetId.required",
                                  ),
                                },
                              ]
                            : undefined
                        }
                        help={
                          jvmDiagnosticTransport === "arthas-tunnel"
                            ? t(
                                "connection.modal.jvm.diagnostic.targetId.arthasHelp",
                              )
                            : t(
                                "connection.modal.jvm.diagnostic.targetId.bridgeHelp",
                              )
                        }
                      >
                        <Input
                          {...noAutoCapInputProps}
                          placeholder={
                            jvmDiagnosticTransport === "arthas-tunnel"
                              ? t("connection.modal.example", {
                                  value: "orders-app_A1B2C3D4E5",
                                })
                              : t("connection.modal.example", {
                                  value: "orders-prod-01",
                                })
                          }
                        />
                      </Form.Item>
                      <Form.Item
                        name="jvmDiagnosticTimeoutSeconds"
                        label={t(
                          "connection.modal.jvm.diagnostic.timeout.label",
                        )}
                        rules={[
                          {
                            type: "number",
                            min: 1,
                            max: 300,
                            message: t(
                              "connection.modal.jvm.diagnostic.timeout.range",
                            ),
                          },
                        ]}
                      >
                        <InputNumber style={{ width: "100%" }} min={1} max={300} />
                      </Form.Item>
                    </div>
                    <Form.Item
                      name="jvmDiagnosticApiKey"
                      label={t("connection.modal.jvm.diagnostic.apiKey.label")}
                    >
                      <Input.Password
                        {...noAutoCapInputProps}
                        placeholder={t(
                          "connection.modal.jvm.diagnostic.apiKey.placeholder",
                        )}
                      />
                    </Form.Item>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 10,
                      }}
                    >
                      {[
                        {
                          name: "jvmDiagnosticAllowObserveCommands",
                          label: t(
                            "connection.modal.jvm.diagnostic.command.observe.label",
                          ),
                          description: t(
                            "connection.modal.jvm.diagnostic.command.observe.description",
                          ),
                        },
                        {
                          name: "jvmDiagnosticAllowTraceCommands",
                          label: t(
                            "connection.modal.jvm.diagnostic.command.trace.label",
                          ),
                          description: t(
                            "connection.modal.jvm.diagnostic.command.trace.description",
                          ),
                        },
                        {
                          name: "jvmDiagnosticAllowMutatingCommands",
                          label: t(
                            "connection.modal.jvm.diagnostic.command.mutating.label",
                          ),
                          description: t(
                            "connection.modal.jvm.diagnostic.command.mutating.description",
                          ),
                        },
                      ].map((item) => (
                        <div
                          key={item.name}
                          style={{
                            padding: 12,
                            borderRadius: 14,
                            background: darkMode
                              ? "rgba(255,255,255,0.04)"
                              : "rgba(16,24,40,0.04)",
                          }}
                        >
                          <Form.Item
                            name={item.name}
                            valuePropName="checked"
                            style={{ marginBottom: 6 }}
                          >
                            <Checkbox>{item.label}</Checkbox>
                          </Form.Item>
                          <div style={modalMutedTextStyle}>
                            {item.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      ...modalMutedTextStyle,
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: darkMode
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(16,24,40,0.04)",
                    }}
                  >
                    {t("connection.modal.jvm.diagnostic.disabledHint")}
                  </div>
                )}
              </div>
            </div>
          </>
          ) : (
            <>
              {renderConfigSectionCard({
                sectionKey: isFileDb ? "fileTarget" : "target",
                icon: isFileDb ? <FileTextOutlined /> : <GatewayOutlined />,
                children: (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) 120px",
                      gap: 16,
                      alignItems: "start",
                    }}
                  >
                    <Form.Item
                      name="host"
                      label={
                        isFileDb
                          ? t("connection.modal.field.filePath.label")
                          : t("connection.modal.field.host.label")
                      }
                      rules={[
                        createUriAwareRequiredRule(
                          t("connection.modal.field.addressPath.required"),
                        ),
                      ]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        {...noAutoCapInputProps}
                        placeholder={
                          isFileDb
                            ? dbType === "duckdb"
                              ? "/path/to/db.duckdb"
                              : "/path/to/db.sqlite"
                            : "localhost"
                        }
                      />
                    </Form.Item>
                    {isFileDb ? (
                      <Form.Item label=" " style={{ marginBottom: 0 }}>
                        <Button
                          style={{ width: "100%" }}
                          onClick={handleSelectDatabaseFile}
                          loading={selectingDbFile}
                        >
                          {t("connection.modal.action.browse")}
                        </Button>
                      </Form.Item>
                    ) : (
                      <Form.Item
                        name="port"
                        label={t("connection.modal.field.port.label")}
                        rules={[
                          createUriAwareRequiredRule(
                            t("connection.modal.field.port.required"),
                            (value) => Number(value) > 0,
                          ),
                        ]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber style={{ width: "100%" }} />
                      </Form.Item>
                    )}
                  </div>
                ),
              })}

              {dbType === "clickhouse" &&
                renderConfigSectionCard({
                  sectionKey: "connectionMode",
                  icon: <ClusterOutlined />,
                  children: (
                    <Form.Item
                      name="clickHouseProtocol"
                      label={t("connection.modal.field.protocol.label")}
                      help={t("connection.modal.field.clickHouseProtocol.help")}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        options={CLICKHOUSE_PROTOCOL_OPTIONS.map((option) => ({
                          ...option,
                          label: option.labelKey
                            ? t(option.labelKey)
                            : option.label,
                        }))}
                        onChange={() => clearConnectionTestResultForChoice()}
                      />
                    </Form.Item>
                  ),
                })}

              {dbType === "oceanbase" &&
                renderConfigSectionCard({
                  sectionKey: "oceanBaseProtocol",
                  icon: <ClusterOutlined />,
                  children: (
                    <Form.Item
                      name="oceanBaseProtocol"
                      label={t("connection.modal.field.oceanBaseProtocol.label")}
                      help={
                        <span>
                          {t(
                            "connection.modal.field.oceanBaseProtocol.help.primary",
                          )}
                          <br />
                          {t(
                            "connection.modal.field.oceanBaseProtocol.help.connectionAttributes",
                            {
                              attributes:
                                "connectionAttributes=key1:value1,key2:value2",
                            },
                          )}
                        </span>
                      }
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        options={OCEANBASE_PROTOCOL_OPTIONS}
                        onChange={() => {
                          form.setFieldsValue({ mysqlTopology: "single" });
                          clearConnectionTestResultForChoice();
                        }}
                      />
                    </Form.Item>
                  ),
                })}

              {(dbType === "postgres" ||
                dbType === "kingbase" ||
                dbType === "highgo" ||
                dbType === "vastbase" ||
                dbType === "opengauss" ||
                dbType === "gaussdb") &&
                renderConfigSectionCard({
                  sectionKey: "service",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="database"
                      label={t("connection.modal.field.defaultDatabase.label")}
                      help={t("connection.modal.field.defaultDatabase.help")}
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        {...noAutoCapInputProps}
                        placeholder={t(
                          "connection.modal.field.defaultDatabase.placeholder",
                        )}
                      />
                    </Form.Item>
                  ),
                })}

              {dbType === "kafka" &&
                renderConfigSectionCard({
                  sectionKey: "service",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="database"
                      label={t("connection.modal.messageQueue.kafka.defaultTopic.label")}
                      help={t("connection.modal.messageQueue.kafka.defaultTopic.help")}
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        {...noAutoCapInputProps}
                        placeholder={t(
                          "connection.modal.messageQueue.kafka.defaultTopic.placeholder",
                        )}
                      />
                    </Form.Item>
                  ),
                })}

              {dbType === "rocketmq" &&
                renderConfigSectionCard({
                  sectionKey: "service",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="database"
                      label={t("connection.modal.messageQueue.rocketmq.defaultTopic.label")}
                      help={t("connection.modal.messageQueue.rocketmq.defaultTopic.help")}
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        {...noAutoCapInputProps}
                        placeholder={t(
                          "connection.modal.messageQueue.rocketmq.defaultTopic.placeholder",
                        )}
                      />
                    </Form.Item>
                  ),
                })}

              {dbType === "mqtt" &&
                renderConfigSectionCard({
                  sectionKey: "service",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="database"
                      label={t("connection.modal.messageQueue.mqtt.defaultTopicFilter.label")}
                      help={t("connection.modal.messageQueue.mqtt.defaultTopicFilter.help")}
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        {...noAutoCapInputProps}
                        placeholder={t(
                          "connection.modal.messageQueue.mqtt.defaultTopicFilter.placeholder",
                        )}
                      />
                    </Form.Item>
                  ),
                })}

              {dbType === "rabbitmq" &&
                renderConfigSectionCard({
                  sectionKey: "service",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="database"
                      label={t("connection.modal.messageQueue.rabbitmq.defaultVirtualHost.label")}
                      help={t("connection.modal.messageQueue.rabbitmq.defaultVirtualHost.help")}
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        {...noAutoCapInputProps}
                        placeholder={t(
                          "connection.modal.messageQueue.rabbitmq.defaultVirtualHost.placeholder",
                        )}
                      />
                    </Form.Item>
                  ),
                })}

              {(dbType === "oracle" || isOceanBaseOracle) &&
                renderConfigSectionCard({
                  sectionKey: "service",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="database"
                      label={
                        isOceanBaseOracle
                          ? t(
                              "connection.modal.field.oceanBaseServiceName.label",
                            )
                          : t("connection.modal.field.serviceName.label")
                      }
                      rules={
                        isOceanBaseOracle
                          ? []
                          : [
                              createUriAwareRequiredRule(
                                t("connection.modal.field.serviceName.required"),
                              ),
                            ]
                      }
                      help={
                        isOceanBaseOracle
                          ? t(
                              "connection.modal.field.oceanBaseServiceName.help",
                            )
                          : t("connection.modal.field.serviceName.help")
                      }
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        {...noAutoCapInputProps}
                        placeholder={t(
                          "connection.modal.field.serviceName.placeholder",
                        )}
                      />
                    </Form.Item>
                  ),
                })}

              {isMySQLLike &&
                renderConfigSectionCard({
                  sectionKey: "connectionMode",
                  icon: <ClusterOutlined />,
                  children: renderChoiceCards({
                    fieldName: "mysqlTopology",
                    value: String(mysqlTopology),
                    options: [
                      {
                        value: "single",
                        label: t("connection.modal.topology.single.label"),
                        description: t(
                          "connection.modal.topology.mysql.single.description",
                        ),
                      },
                      {
                        value: "replica",
                        label: t(
                          "connection.modal.topology.mysql.replica.label",
                        ),
                        description: t(
                          "connection.modal.topology.mysql.replica.description",
                        ),
                      },
                    ],
                  }),
                })}

              {isKafka &&
                renderConfigSectionCard({
                  sectionKey: "connectionMode",
                  icon: <ClusterOutlined />,
                  children: renderChoiceCards({
                    fieldName: "kafkaTopology",
                    value: String(kafkaTopology),
                    options: [
                      {
                        value: "single",
                        label: t("connection.modal.messageQueue.kafka.topology.single.label"),
                        description: t(
                          "connection.modal.messageQueue.kafka.topology.single.description",
                        ),
                      },
                      {
                        value: "cluster",
                        label: t("connection.modal.messageQueue.topology.cluster.label"),
                        description: t(
                          "connection.modal.messageQueue.kafka.topology.cluster.description",
                        ),
                      },
                    ],
                  }),
                })}

              {isRocketMQ &&
                renderConfigSectionCard({
                  sectionKey: "connectionMode",
                  icon: <ClusterOutlined />,
                  children: renderChoiceCards({
                    fieldName: "rocketmqTopology",
                    value: String(rocketmqTopology),
                    options: [
                      {
                        value: "single",
                        label: t("connection.modal.messageQueue.rocketmq.topology.single.label"),
                        description: t(
                          "connection.modal.messageQueue.rocketmq.topology.single.description",
                        ),
                      },
                      {
                        value: "cluster",
                        label: t("connection.modal.messageQueue.topology.cluster.label"),
                        description: t(
                          "connection.modal.messageQueue.rocketmq.topology.cluster.description",
                        ),
                      },
                    ],
                  }),
                })}

              {isMQTT &&
                renderConfigSectionCard({
                  sectionKey: "connectionMode",
                  icon: <ClusterOutlined />,
                  children: renderChoiceCards({
                    fieldName: "mqttTopology",
                    value: String(mqttTopology),
                    options: [
                      {
                        value: "single",
                        label: t("connection.modal.messageQueue.mqtt.topology.single.label"),
                        description: t(
                          "connection.modal.messageQueue.mqtt.topology.single.description",
                        ),
                      },
                      {
                        value: "cluster",
                        label: t("connection.modal.messageQueue.topology.cluster.label"),
                        description: t(
                          "connection.modal.messageQueue.mqtt.topology.cluster.description",
                        ),
                      },
                    ],
                  }),
                })}

              {isKafka &&
                kafkaTopology === "cluster" &&
                renderConfigSectionCard({
                  sectionKey: "replica",
                  icon: <ClusterOutlined />,
                  children: (
                    <Form.Item
                      name="kafkaHosts"
                      label={t("connection.modal.messageQueue.kafka.extraBrokers.label")}
                      help={t("connection.modal.messageQueue.kafka.extraBrokers.help")}
                    >
                      <Select
                        mode="tags"
                        placeholder={t(
                          "connection.modal.messageQueue.kafka.extraBrokers.placeholder",
                        )}
                        tokenSeparators={[",", ";", " "]}
                      />
                    </Form.Item>
                  ),
                })}

              {isRocketMQ &&
                rocketmqTopology === "cluster" &&
                renderConfigSectionCard({
                  sectionKey: "replica",
                  icon: <ClusterOutlined />,
                  children: (
                    <Form.Item
                      name="rocketmqHosts"
                      label={t("connection.modal.messageQueue.rocketmq.extraNameServers.label")}
                      help={t("connection.modal.messageQueue.rocketmq.extraNameServers.help")}
                    >
                      <Select
                        mode="tags"
                        placeholder={t(
                          "connection.modal.messageQueue.rocketmq.extraNameServers.placeholder",
                        )}
                        tokenSeparators={[",", ";", " "]}
                      />
                    </Form.Item>
                  ),
                })}

              {isMQTT &&
                mqttTopology === "cluster" &&
                renderConfigSectionCard({
                  sectionKey: "replica",
                  icon: <ClusterOutlined />,
                  children: (
                    <Form.Item
                      name="mqttHosts"
                      label={t("connection.modal.messageQueue.mqtt.extraBrokers.label")}
                      help={t("connection.modal.messageQueue.mqtt.extraBrokers.help")}
                    >
                      <Select
                        mode="tags"
                        placeholder={t(
                          "connection.modal.messageQueue.mqtt.extraBrokers.placeholder",
                        )}
                        tokenSeparators={[",", ";", " "]}
                      />
                    </Form.Item>
                  ),
                })}

              {isMySQLLike &&
                mysqlTopology === "replica" &&
                renderConfigSectionCard({
                  sectionKey: "replica",
                  icon: <ClusterOutlined />,
                  children: (
                    <>
                      <Form.Item
                        name="mysqlReplicaHosts"
                        label={t(
                          "connection.modal.field.mysqlReplicaHosts.label",
                        )}
                        help={t(
                          "connection.modal.field.mysqlReplicaHosts.help",
                        )}
                      >
                        <Select
                          mode="tags"
                          placeholder={t(
                            "connection.modal.field.mysqlReplicaHosts.placeholder",
                          )}
                          tokenSeparators={[",", ";", " "]}
                        />
                      </Form.Item>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 16,
                        }}
                      >
                        <Form.Item
                          name="mysqlReplicaUser"
                          label={t(
                            "connection.modal.field.mysqlReplicaUser.label",
                          )}
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder={t(
                              "connection.modal.field.mysqlReplicaUser.placeholder",
                            )}
                          />
                        </Form.Item>
                        <Form.Item
                          name="mysqlReplicaPassword"
                          label={t(
                            "connection.modal.field.mysqlReplicaPassword.label",
                          )}
                          style={{ marginBottom: 0 }}
                        >
                          <Input.Password
                            {...noAutoCapInputProps}
                            placeholder={getStoredSecretPlaceholder({
                              hasStoredSecret:
                                initialValues?.hasMySQLReplicaPassword,
                              emptyPlaceholder: t(
                                "connection.modal.field.mysqlReplicaPassword.placeholder",
                              ),
                              retainedLabel: t(
                                "connection.modal.field.mysqlReplicaPassword.retained",
                              ),
                            })}
                          />
                        </Form.Item>
                      </div>
                      {renderStoredSecretControls({
                        fieldName: "mysqlReplicaPassword",
                        clearKey: "mysqlReplicaPassword",
                        hasStoredSecret: initialValues?.hasMySQLReplicaPassword,
                        clearLabel: t(
                          "connection.modal.field.mysqlReplicaPassword.clear",
                        ),
                        description: t(
                          "connection.modal.field.mysqlReplicaPassword.savedDescription",
                        ),
                      })}
                    </>
                  ),
                })}

              {dbType === "mongodb" &&
                renderConfigSectionCard({
                  sectionKey: "connectionMode",
                  icon: <ClusterOutlined />,
                  children: renderChoiceCards({
                    fieldName: "mongoTopology",
                    value: String(mongoTopology),
                    options: [
                      {
                        value: "single",
                        label: t("connection.modal.topology.single.label"),
                        description: t(
                          "connection.modal.topology.mongodb.single.description",
                        ),
                      },
                      {
                        value: "replica",
                        label: t(
                          "connection.modal.topology.mongodb.replica.label",
                        ),
                        description: t(
                          "connection.modal.topology.mongodb.replica.description",
                        ),
                      },
                    ],
                  }),
                })}

              {dbType === "mongodb" &&
                renderConfigSectionCard({
                  sectionKey: "mongoDiscovery",
                  icon: <ApiOutlined />,
                  children: (
                    <>
                      <Form.Item name="mongoSrv" hidden valuePropName="checked">
                        <Checkbox />
                      </Form.Item>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 10,
                        }}
                      >
                        {[
                          {
                            value: false,
                            label: t(
                              "connection.modal.mongo.discovery.standard.label",
                            ),
                            description: t(
                              "connection.modal.mongo.discovery.standard.description",
                            ),
                          },
                          {
                            value: true,
                            label: t(
                              "connection.modal.mongo.discovery.srv.label",
                            ),
                            description: t(
                              "connection.modal.mongo.discovery.srv.description",
                            ),
                          },
                        ].map((option) => {
                          const active = mongoSrv === option.value;
                          return (
                            <button
                              key={String(option.value)}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                setChoiceFieldValue("mongoSrv", option.value)
                              }
                              style={{
                                textAlign: "left",
                                padding: "12px 14px",
                                borderRadius: 14,
                                border: active
                                  ? darkMode
                                    ? "1px solid rgba(255,214,102,0.42)"
                                    : "1px solid rgba(22,119,255,0.36)"
                                  : darkMode
                                    ? "1px solid rgba(255,255,255,0.08)"
                                    : "1px solid rgba(16,24,40,0.08)",
                                background: active
                                  ? darkMode
                                    ? "rgba(255,214,102,0.10)"
                                    : "rgba(22,119,255,0.07)"
                                  : darkMode
                                    ? "rgba(255,255,255,0.03)"
                                    : "rgba(16,24,40,0.03)",
                                color: darkMode ? "#f5f7ff" : "#162033",
                                cursor: "pointer",
                              }}
                            >
                              <Space size={8} wrap>
                                <Text strong>{option.label}</Text>
                                {active ? (
                                  <Tag color="blue">
                                    {t("connection.modal.network.currentEditing")}
                                  </Tag>
                                ) : null}
                              </Space>
                              <div
                                style={{
                                  ...modalMutedTextStyle,
                                  marginTop: 6,
                                }}
                              >
                                {option.description}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {mongoSrv && useSSH && (
                        <Alert
                          type="warning"
                          showIcon
                          style={{ marginTop: 12 }}
                          message={t(
                            "connection.modal.mongo.discovery.srvSshWarning",
                          )}
                        />
                      )}
                    </>
                  ),
                })}

              {dbType === "mongodb" &&
                mongoTopology === "replica" &&
                renderConfigSectionCard({
                  sectionKey: "replica",
                  icon: <ClusterOutlined />,
                  children: (
                    <>
                      <Form.Item
                        name="mongoHosts"
                        label={
                          mongoSrv
                            ? t("connection.modal.field.mongoSrvHosts.label")
                            : t("connection.modal.field.mongoHosts.label")
                        }
                        help={
                          mongoSrv
                            ? t("connection.modal.field.mongoSrvHosts.help")
                            : t("connection.modal.field.mongoHosts.help")
                        }
                      >
                        <Select
                          mode="tags"
                          placeholder={
                            mongoSrv
                              ? t(
                                  "connection.modal.field.mongoSrvHosts.placeholder",
                                )
                              : t(
                                  "connection.modal.field.mongoHosts.placeholder",
                                )
                          }
                          tokenSeparators={[",", ";", " "]}
                        />
                      </Form.Item>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 16,
                        }}
                      >
                        <Form.Item
                          name="mongoReplicaSet"
                          label={t(
                            "connection.modal.field.mongoReplicaSet.label",
                          )}
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder={t(
                              "connection.modal.field.mongoReplicaSet.placeholder",
                            )}
                          />
                        </Form.Item>
                        <Form.Item
                          name="mongoReplicaUser"
                          label={t(
                            "connection.modal.field.mongoReplicaUser.label",
                          )}
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder={t(
                              "connection.modal.field.mongoReplicaUser.placeholder",
                            )}
                          />
                        </Form.Item>
                      </div>
                      <Form.Item
                        name="mongoReplicaPassword"
                        label={t(
                          "connection.modal.field.mongoReplicaPassword.label",
                        )}
                        style={{ marginTop: 16, marginBottom: 0 }}
                      >
                        <Input.Password
                          {...noAutoCapInputProps}
                          placeholder={getStoredSecretPlaceholder({
                            hasStoredSecret:
                              initialValues?.hasMongoReplicaPassword,
                            emptyPlaceholder: t(
                              "connection.modal.field.mongoReplicaPassword.placeholder",
                            ),
                            retainedLabel: t(
                              "connection.modal.field.mongoReplicaPassword.retained",
                            ),
                          })}
                        />
                      </Form.Item>
                      {renderStoredSecretControls({
                        fieldName: "mongoReplicaPassword",
                        clearKey: "mongoReplicaPassword",
                        hasStoredSecret: initialValues?.hasMongoReplicaPassword,
                        clearLabel: t(
                          "connection.modal.field.mongoReplicaPassword.clear",
                        ),
                        description: t(
                          "connection.modal.field.mongoReplicaPassword.savedDescription",
                        ),
                      })}
                      <Space
                        size={8}
                        style={{ marginTop: 12, marginBottom: 12 }}
                      >
                        <Button
                          onClick={handleDiscoverMongoMembers}
                          loading={discoveringMembers}
                        >
                          {t("connection.modal.mongo.discoverMembers")}
                        </Button>
                      </Space>
                      {mongoMembers.length > 0 && (
                        <Table
                          size="small"
                          rowKey={(record) => record.host}
                          pagination={false}
                          dataSource={mongoMembers}
                          style={{ marginBottom: 12 }}
                          columns={[
                            {
                              title: t("connection.modal.field.host.label"),
                              dataIndex: "host",
                              width: "48%",
                            },
                            {
                              title: t("connection.modal.mongo.member.role"),
                              dataIndex: "role",
                              width: "32%",
                              render: (
                                value: string,
                                record: MongoMemberInfo,
                              ) => (
                                <Tag
                                  color={record.isSelf ? "blue" : "default"}
                                >
                                  {value ||
                                    record.state ||
                                    t("common.unknown")}
                                </Tag>
                              ),
                            },
                            {
                              title: t("connection.modal.mongo.member.health"),
                              dataIndex: "healthy",
                              width: "20%",
                              render: (value: boolean) => (
                                <Tag color={value ? "success" : "error"}>
                                  {value
                                    ? t("connection.modal.mongo.member.healthy")
                                    : t(
                                        "connection.modal.mongo.member.unhealthy",
                                      )}
                                </Tag>
                              ),
                            },
                          ]}
                        />
                      )}
                    </>
                  ),
                })}

              {dbType === "mongodb" &&
                renderConfigSectionCard({
                  sectionKey: "mongoPolicy",
                  icon: <ThunderboltOutlined />,
                  children: (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 16,
                      }}
                    >
                      <Form.Item
                        name="mongoAuthSource"
                        label={t(
                          "connection.modal.field.mongoAuthSource.label",
                        )}
                        style={{ marginBottom: 0 }}
                      >
                        <Input
                          {...noAutoCapInputProps}
                          placeholder={t(
                            "connection.modal.field.mongoAuthSource.placeholder",
                          )}
                        />
                      </Form.Item>
                      <div style={{ display: "grid", gap: 8 }}>
                        <Text strong>
                          {t("connection.modal.mongo.readPreference.label")}
                        </Text>
                        {renderChoiceCards({
                          fieldName: "mongoReadPreference",
                          value: String(mongoReadPreference),
                          minWidth: 130,
                          options: [
                            {
                              value: "primary",
                              label: "primary",
                              description: t(
                                "connection.modal.mongo.readPreference.primary.description",
                              ),
                            },
                            {
                              value: "primaryPreferred",
                              label: "primaryPreferred",
                              description: t(
                                "connection.modal.mongo.readPreference.primaryPreferred.description",
                              ),
                            },
                            {
                              value: "secondary",
                              label: "secondary",
                              description: t(
                                "connection.modal.mongo.readPreference.secondary.description",
                              ),
                            },
                            {
                              value: "secondaryPreferred",
                              label: "secondaryPreferred",
                              description: t(
                                "connection.modal.mongo.readPreference.secondaryPreferred.description",
                              ),
                            },
                            {
                              value: "nearest",
                              label: "nearest",
                              description: t(
                                "connection.modal.mongo.readPreference.nearest.description",
                              ),
                            },
                          ],
                        })}
                      </div>
                    </div>
                  ),
                })}

              {isRedis &&
                renderConfigSectionCard({
                  sectionKey: "connectionMode",
                  icon: <ClusterOutlined />,
                  children: (
                    <>
                      {renderChoiceCards({
                        fieldName: "redisTopology",
                        value: String(redisTopology),
                        options: [
                          {
                            value: "single",
                            label: t("connection.modal.topology.single.label"),
                            description: t(
                              "connection.modal.topology.redis.single.description",
                            ),
                          },
                          {
                            value: "cluster",
                            label: t(
                              "connection.modal.topology.redis.cluster.label",
                            ),
                            description: t(
                              "connection.modal.topology.redis.cluster.description",
                            ),
                          },
                        ],
                      })}
                      {redisTopology === "cluster" && (
                        <Form.Item
                          name="redisHosts"
                          label={t("connection.modal.field.redisHosts.label")}
                          help={t("connection.modal.field.redisHosts.help")}
                          style={{ marginTop: 16, marginBottom: 0 }}
                        >
                          <Select
                            mode="tags"
                            placeholder={t(
                              "connection.modal.field.redisHosts.placeholder",
                            )}
                            tokenSeparators={[",", ";", " "]}
                          />
                        </Form.Item>
                      )}
                    </>
                  ),
                })}

              {isRedis &&
                renderConfigSectionCard({
                  sectionKey: "credentials",
                  icon: <SafetyCertificateOutlined />,
                  children: (
                    <>
                      <Form.Item
                        name="password"
                        label={t("connection.modal.field.redisPassword.label")}
                      >
                        <Input.Password
                          {...noAutoCapInputProps}
                          visibilityToggle={{
                            visible: primaryPasswordVisible,
                            onVisibleChange: setPrimaryPasswordVisible,
                          }}
                          placeholder={getStoredSecretPlaceholder({
                            hasStoredSecret: initialValues?.hasPrimaryPassword,
                            emptyPlaceholder: t(
                              "connection.modal.field.redisPassword.placeholder",
                            ),
                            retainedLabel: t(
                              "connection.modal.field.redisPassword.retained",
                            ),
                          })}
                        />
                      </Form.Item>
                    </>
                  ),
                })}

              {isRedis &&
                renderConfigSectionCard({
                  sectionKey: "databaseScope",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="includeRedisDatabases"
                      label={t(
                        "connection.modal.field.displayDatabases.label",
                      )}
                      help={t("connection.modal.field.displayDatabases.help")}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        mode="multiple"
                        placeholder={t(
                          "connection.modal.field.displayRedisDatabases.placeholder",
                        )}
                        allowClear
                      >
                        {redisDbList.map((db) => (
                          <Select.Option key={db} value={db}>
                            db{db}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  ),
                })}

              {!isFileDb &&
                !isRedis &&
                renderConfigSectionCard({
                  sectionKey: "credentials",
                  icon: <SafetyCertificateOutlined />,
                  children: (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            dbType === "mongodb"
                              ? "minmax(0, 1fr) minmax(0, 1fr) 180px"
                              : "repeat(2, minmax(0, 1fr))",
                          gap: 16,
                        }}
                      >
                        <Form.Item
                          name="user"
                          label={t("connection.modal.field.username.label")}
                          rules={
                            PRIMARY_USERNAME_OPTIONAL_TYPES.has(dbType)
                              ? []
                              : [
                                  createUriAwareRequiredRule(
                                    t(
                                      "connection.modal.field.username.required",
                                    ),
                                  ),
                                ]
                          }
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder={
                              PRIMARY_USERNAME_OPTIONAL_TYPES.has(dbType)
                                ? t("connection.modal.field.username.optional_placeholder")
                                : undefined
                            }
                          />
                        </Form.Item>
                        <Form.Item
                          name="password"
                          label={t("connection.modal.field.password.label")}
                          style={{ marginBottom: 0 }}
                        >
                          <Input.Password
                            {...noAutoCapInputProps}
                            visibilityToggle={{
                              visible: primaryPasswordVisible,
                              onVisibleChange: setPrimaryPasswordVisible,
                            }}
                            placeholder={getStoredSecretPlaceholder({
                              hasStoredSecret:
                                initialValues?.hasPrimaryPassword,
                              emptyPlaceholder: t(
                                "connection.modal.field.password.placeholder",
                              ),
                              retainedLabel: t(
                                "connection.modal.field.password.retained",
                              ),
                            })}
                          />
                        </Form.Item>
                        {dbType === "mongodb" && (
                          <div style={{ display: "grid", gap: 8 }}>
                            <Text strong>
                              {t(
                                "connection.modal.mongo.authMechanism.label",
                              )}
                            </Text>
                            {renderChoiceCards({
                              fieldName: "mongoAuthMechanism",
                              value: String(mongoAuthMechanism),
                              minWidth: 150,
                              options: [
                                {
                                  value: "",
                                  label: t(
                                    "connection.modal.mongo.authMechanism.auto.label",
                                  ),
                                  description: t(
                                    "connection.modal.mongo.authMechanism.auto.description",
                                  ),
                                },
                                {
                                  value: "NONE",
                                  label: t(
                                    "connection.modal.mongo.authMechanism.none.label",
                                  ),
                                  description: t(
                                    "connection.modal.mongo.authMechanism.none.description",
                                  ),
                                },
                                {
                                  value: "SCRAM-SHA-1",
                                  label: "SCRAM-SHA-1",
                                  description: t(
                                    "connection.modal.mongo.authMechanism.scramSha1.description",
                                  ),
                                },
                                {
                                  value: "SCRAM-SHA-256",
                                  label: "SCRAM-SHA-256",
                                  description: t(
                                    "connection.modal.mongo.authMechanism.scramSha256.description",
                                  ),
                                },
                                {
                                  value: "MONGODB-AWS",
                                  label: "MONGODB-AWS",
                                  description: t(
                                    "connection.modal.mongo.authMechanism.aws.description",
                                  ),
                                },
                              ],
                            })}
                          </div>
                        )}
                      </div>
                      {dbType === "mongodb" && (
                        <Form.Item
                          name="savePassword"
                          valuePropName="checked"
                          style={{ marginTop: 12, marginBottom: 0 }}
                        >
                          <Checkbox>
                            {t("connection.modal.field.savePassword")}
                          </Checkbox>
                        </Form.Item>
                      )}
                    </>
                  ),
                })}

              {!isFileDb &&
                !isRedis &&
                !isKafka &&
                renderConfigSectionCard({
                  sectionKey: "databaseScope",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="includeDatabases"
                      label={t(
                        "connection.modal.field.displayDatabases.label",
                      )}
                      help={t("connection.modal.field.displayDatabases.help")}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        mode="multiple"
                        placeholder={t(
                          "connection.modal.field.displayDatabases.placeholder",
                        )}
                        allowClear
                      >
                        {dbList.map((db) => (
                          <Select.Option key={db} value={db}>
                            {db}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  ),
                })}
            </>
          )}
        </div>
      </div>
    );

    const networkSecuritySection =
      !isFileDb && !isJVM
        ? (() => {
            const effectiveUseSSL = useSSL || !!form.getFieldValue("useSSL");
            const effectiveUseSSH = useSSH || !!form.getFieldValue("useSSH");
            const effectiveUseHttpTunnel =
              useHttpTunnel ||
              !!form.getFieldValue("useHttpTunnel");
            const effectiveUseProxy =
              !effectiveUseHttpTunnel &&
              (useProxy || !!form.getFieldValue("useProxy"));
            const networkItems: Array<{
              key: "ssl" | "ssh" | "proxy" | "httpTunnel";
              title: string;
              description: string;
              enabled: boolean;
            }> = [
              ...(isSSLType
                ? [
                    {
                      key: "ssl" as const,
                      title: t("connection.modal.network.ssl_tls"),
                      description: t(
                        "connection.modal.network.ssl.description",
                      ),
                      enabled: effectiveUseSSL,
                    },
                  ]
                : []),
              {
                key: "ssh",
                title: t("connection.modal.network.ssh.title"),
                description: t("connection.modal.network.ssh.description"),
                enabled: effectiveUseSSH,
              },
              {
                key: "proxy",
                title: t("connection.modal.network.proxy.title"),
                description: t("connection.modal.network.proxy.description"),
                enabled: effectiveUseProxy,
              },
              {
                key: "httpTunnel",
                title: t("connection.modal.network.httpTunnel.title"),
                description: t(
                  "connection.modal.network.httpTunnel.description",
                ),
                enabled: effectiveUseHttpTunnel,
              },
            ];
            const resolvedNetworkConfig =
              activeNetworkConfig === "ssl" && !effectiveUseSSL
                ? networkItems.find((item) => item.enabled)?.key ||
                  (networkItems.some((item) => item.key === activeNetworkConfig)
                    ? activeNetworkConfig
                    : networkItems[0]?.key || "ssh")
                : networkItems.some((item) => item.key === activeNetworkConfig)
                  ? activeNetworkConfig
                  : networkItems[0]?.key || "ssh";
            const renderNetworkPanel = () => {
              if (resolvedNetworkConfig === "ssl") {
                return (
                  <div style={{ ...modalInnerSectionStyle, padding: 14 }}>
                    <div
                      style={{
                        marginBottom: 8,
                        color: darkMode ? "#f5f7ff" : "#162033",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {t("connection.modal.network.ssl_tls")}
                    </div>
                    <div style={{ ...modalMutedTextStyle, marginBottom: 14 }}>
                      {t("connection.modal.network.ssl.panelDescription")}
                    </div>
                    {!effectiveUseSSL ? (
                      <div
                        style={{
                          ...modalMutedTextStyle,
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: darkMode
                            ? "rgba(255,255,255,0.03)"
                            : "rgba(16,24,40,0.04)",
                        }}
                      >
                        <div>{t("connection.modal.network.ssl.disabledHint")}</div>
                        <div style={{ marginTop: 8 }}>{sslHintText}</div>
                      </div>
                    ) : (
                      <div style={tunnelSectionStyle}>
                        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                          <Text strong>
                            {t("connection.modal.network.ssl.mode")}
                          </Text>
                          {renderChoiceCards({
                            fieldName: "sslMode",
                            value: String(sslMode),
                            options: [
                              {
                                value: "preferred",
                                label: t(
                                  "connection.modal.network.ssl_mode.preferred",
                                ),
                                description: t(
                                  "connection.modal.network.ssl.preferred.description",
                                ),
                              },
                              {
                                value: "required",
                                label: t(
                                  "connection.modal.network.ssl_mode.required",
                                ),
                                description: t(
                                  "connection.modal.network.ssl.required.description",
                                ),
                              },
                              {
                                value: "skip-verify",
                                label: t(
                                  "connection.modal.network.ssl_mode.skip_verify",
                                ),
                                description: t(
                                  "connection.modal.network.ssl.skipVerify.description",
                                ),
                              },
                            ],
                          })}
                        </div>
                        {(supportsSSLCAPath || supportsSSLClientCertificate) && (
                          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                            {supportsSSLCAPath && (
                              <Form.Item
                                label={
                                  dbType === "sqlserver"
                                    ? t(
                                        "connection.modal.network.ssl.serverCaPath",
                                      )
                                    : t(
                                        "connection.modal.network.ssl.caPath",
                                      )
                                }
                                style={{ marginBottom: 0 }}
                              >
                                <Space.Compact style={{ width: "100%" }}>
                                  <Form.Item name="sslCAPath" noStyle>
                                    <Input
                                      {...noAutoCapInputProps}
                                      placeholder={t(
                                        "connection.modal.example",
                                        { value: "C:\\certs\\ca.pem" },
                                      )}
                                    />
                                  </Form.Item>
                                  <Button
                                    onClick={() => handleSelectCertificateFile("sslCAPath", "ca")}
                                    loading={selectingCertificateField === "sslCAPath"}
                                  >
                                    {t("connection.modal.action.browse")}
                                  </Button>
                                </Space.Compact>
                              </Form.Item>
                            )}
                            {supportsSSLClientCertificate && (
                              <>
                                <Form.Item
                                  label={
                                    dbType === "dameng"
                                      ? t(
                                          "connection.modal.network.ssl.damengCertPath",
                                        )
                                      : t(
                                          "connection.modal.network.ssl.certPath",
                                        )
                                  }
                                  rules={[
                                    {
                                      required: dbType === "dameng",
                                      message: t(
                                        "connection.modal.network.ssl.certRequired",
                                      ),
                                    },
                                  ]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Space.Compact style={{ width: "100%" }}>
                                    <Form.Item name="sslCertPath" noStyle>
                                      <Input
                                        {...noAutoCapInputProps}
                                        placeholder={t(
                                          "connection.modal.example",
                                          {
                                            value:
                                              "C:\\certs\\client-cert.pem",
                                          },
                                        )}
                                      />
                                    </Form.Item>
                                    <Button
                                      onClick={() => handleSelectCertificateFile("sslCertPath", "client-cert")}
                                      loading={selectingCertificateField === "sslCertPath"}
                                    >
                                      {t("connection.modal.action.browse")}
                                    </Button>
                                  </Space.Compact>
                                </Form.Item>
                                <Form.Item
                                  label={
                                    dbType === "dameng"
                                      ? t(
                                          "connection.modal.network.ssl.damengKeyPath",
                                        )
                                      : t(
                                          "connection.modal.network.ssl.keyPath",
                                        )
                                  }
                                  rules={[
                                    {
                                      required: dbType === "dameng",
                                      message: t(
                                        "connection.modal.network.ssl.keyRequired",
                                      ),
                                    },
                                  ]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Space.Compact style={{ width: "100%" }}>
                                    <Form.Item name="sslKeyPath" noStyle>
                                      <Input
                                        {...noAutoCapInputProps}
                                        placeholder={t(
                                          "connection.modal.example",
                                          {
                                            value:
                                              "C:\\certs\\client-key.pem",
                                          },
                                        )}
                                      />
                                    </Form.Item>
                                    <Button
                                      onClick={() => handleSelectCertificateFile("sslKeyPath", "client-key")}
                                      loading={selectingCertificateField === "sslKeyPath"}
                                    >
                                      {t("connection.modal.action.browse")}
                                    </Button>
                                  </Space.Compact>
                                </Form.Item>
                              </>
                            )}
                          </div>
                        )}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {sslHintText}
                        </Text>
                      </div>
                    )}
                  </div>
                );
              }
              if (resolvedNetworkConfig === "ssh") {
                return (
                  <div style={{ ...modalInnerSectionStyle, padding: 14 }}>
                    <div
                      style={{
                        marginBottom: 8,
                        color: darkMode ? "#f5f7ff" : "#162033",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {t("connection.modal.network.ssh.title")}
                    </div>
                    <div style={{ ...modalMutedTextStyle, marginBottom: 14 }}>
                      {t("connection.modal.network.ssh.panelDescription")}
                    </div>
                  {!effectiveUseSSH ? (
                      <div
                        style={{
                          ...modalMutedTextStyle,
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: darkMode
                            ? "rgba(255,255,255,0.03)"
                            : "rgba(16,24,40,0.04)",
                        }}
                      >
                        {t("connection.modal.network.ssh.disabledHint")}
                      </div>
                    ) : (
                      <div style={tunnelSectionStyle}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) 120px",
                            gap: 16,
                          }}
                        >
                          <Form.Item
                            name="sshHost"
                            label={t("connection.modal.network.ssh.host")}
                            rules={[
                              {
                                required: useSSH,
                                message: t(
                                  "connection.modal.network.ssh.hostRequired",
                                ),
                              },
                            ]}
                            style={{ flex: 1 }}
                          >
                            <Input
                              {...noAutoCapInputProps}
                              placeholder={t("connection.modal.example.or", {
                                first: "ssh.example.com",
                                second: "192.168.1.100",
                              })}
                            />
                          </Form.Item>
                          <Form.Item
                            name="sshPort"
                            label={t("connection.modal.field.port.label")}
                            rules={[
                              {
                                required: useSSH,
                                message: t(
                                  "connection.modal.network.ssh.portRequired",
                                ),
                              },
                            ]}
                            style={{ width: 100 }}
                          >
                            <InputNumber style={{ width: "100%" }} />
                          </Form.Item>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 16,
                          }}
                        >
                          <Form.Item
                            name="sshUser"
                            label={t("connection.modal.network.ssh.user")}
                            rules={[
                              {
                                required: useSSH,
                                message: t(
                                  "connection.modal.network.ssh.userRequired",
                                ),
                              },
                            ]}
                            style={{ flex: 1 }}
                          >
                            <Input
                              {...noAutoCapInputProps}
                              placeholder={t("connection.modal.example", {
                                value: "root",
                              })}
                            />
                          </Form.Item>
                          <Form.Item
                            name="sshPassword"
                            label={t("connection.modal.network.ssh.password")}
                            style={{ flex: 1 }}
                          >
                            <Input.Password
                              {...noAutoCapInputProps}
                              placeholder={getStoredSecretPlaceholder({
                                hasStoredSecret: initialValues?.hasSSHPassword,
                                emptyPlaceholder: t(
                                  "connection.modal.field.password.placeholder",
                                ),
                                retainedLabel: t(
                                  "connection.modal.network.ssh.retained",
                                ),
                              })}
                            />
                          </Form.Item>
                        </div>
                      <Form.Item
                        label={t("connection.modal.network.ssh.keyPath")}
                          help={t("connection.modal.example", {
                            value: "/Users/name/.ssh/id_rsa",
                          })}
                      >
                          <Space.Compact style={{ width: "100%" }}>
                            <Form.Item name="sshKeyPath" noStyle>
                              <Input
                                {...noAutoCapInputProps}
                                placeholder={t(
                                  "connection.modal.network.ssh.keyPathPlaceholder",
                                )}
                              />
                            </Form.Item>
                            <Button
                              onClick={handleSelectSSHKeyFile}
                              loading={selectingSSHKey}
                            >
                              {t("connection.modal.action.browse")}
                            </Button>
                          </Space.Compact>
                        </Form.Item>
                        {renderStoredSecretControls({
                          fieldName: "sshPassword",
                          clearKey: "sshPassword",
                          hasStoredSecret: initialValues?.hasSSHPassword,
                          clearLabel: t(
                            "connection.modal.network.ssh.clearPassword",
                          ),
                          description: t(
                            "connection.modal.network.ssh.savedDescription",
                          ),
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              if (resolvedNetworkConfig === "proxy") {
                return (
                  <div style={{ ...modalInnerSectionStyle, padding: 14 }}>
                    <div
                      style={{
                        marginBottom: 8,
                        color: darkMode ? "#f5f7ff" : "#162033",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {t("connection.modal.network.proxy.title")}
                    </div>
                    <div style={{ ...modalMutedTextStyle, marginBottom: 14 }}>
                      {t("connection.modal.network.proxy.panelDescription")}
                    </div>
                    {!effectiveUseProxy ? (
                      <div
                        style={{
                          ...modalMutedTextStyle,
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: darkMode
                            ? "rgba(255,255,255,0.03)"
                            : "rgba(16,24,40,0.04)",
                        }}
                      >
                        {t("connection.modal.network.proxy.disabledHint")}
                      </div>
                    ) : (
                      <div style={tunnelSectionStyle}>
                        <Form.Item
                          name="proxyHost"
                          label={t("connection.modal.network.proxy.host")}
                          rules={[
                            {
                              required: useProxy,
                              message: t(
                                "connection.modal.network.proxy.hostRequired",
                              ),
                            },
                          ]}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder={t("connection.modal.example.or", {
                              first: "127.0.0.1",
                              second: "proxy.company.com",
                            })}
                          />
                        </Form.Item>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) 120px",
                            gap: 16,
                          }}
                        >
                          <div style={{ display: "grid", gap: 8 }}>
                            <Text strong>
                              {t("connection.modal.network.proxy.type")}
                            </Text>
                            {renderChoiceCards({
                              fieldName: "proxyType",
                              value: String(proxyType),
                              minWidth: 150,
                              options: [
                                {
                                  value: "socks5",
                                  label: "SOCKS5",
                                  description: t(
                                    "connection.modal.network.proxy.socks5.description",
                                  ),
                                },
                                {
                                  value: "http",
                                  label: "HTTP CONNECT",
                                  description: t(
                                    "connection.modal.network.proxy.http.description",
                                  ),
                                },
                              ],
                            })}
                          </div>
                          <Form.Item
                            name="proxyPort"
                            label={t("connection.modal.field.port.label")}
                            rules={[
                              {
                                required: useProxy,
                                message: t(
                                  "connection.modal.network.proxy.portRequired",
                                ),
                              },
                            ]}
                            style={{ marginBottom: 0 }}
                          >
                            <InputNumber
                              style={{ width: "100%" }}
                              min={1}
                              max={65535}
                            />
                          </Form.Item>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 16,
                          }}
                        >
                          <Form.Item
                            name="proxyUser"
                            label={t("connection.modal.network.proxy.user")}
                            style={{ flex: 1 }}
                          >
                            <Input
                              {...noAutoCapInputProps}
                              placeholder={t(
                                "connection.modal.network.proxy.noAuth",
                              )}
                            />
                          </Form.Item>
                          <Form.Item
                            name="proxyPassword"
                            label={t(
                              "connection.modal.network.proxy.password",
                            )}
                            style={{ flex: 1 }}
                          >
                            <Input.Password
                              {...noAutoCapInputProps}
                              placeholder={getStoredSecretPlaceholder({
                                hasStoredSecret:
                                  initialValues?.hasProxyPassword,
                                emptyPlaceholder: t(
                                  "connection.modal.network.proxy.noAuth",
                                ),
                                retainedLabel: t(
                                  "connection.modal.network.proxy.retained",
                                ),
                              })}
                            />
                          </Form.Item>
                        </div>
                        {renderStoredSecretControls({
                          fieldName: "proxyPassword",
                          clearKey: "proxyPassword",
                          hasStoredSecret: initialValues?.hasProxyPassword,
                          clearLabel: t(
                            "connection.modal.network.proxy.clearPassword",
                          ),
                          description: t(
                            "connection.modal.network.proxy.savedDescription",
                          ),
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div style={{ ...modalInnerSectionStyle, padding: 14 }}>
                  <div
                    style={{
                      marginBottom: 8,
                      color: darkMode ? "#f5f7ff" : "#162033",
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    {t("connection.modal.network.httpTunnel.title")}
                  </div>
                  <div style={{ ...modalMutedTextStyle, marginBottom: 14 }}>
                    {t(
                      "connection.modal.network.httpTunnel.panelDescription",
                    )}
                  </div>
                  {!effectiveUseHttpTunnel ? (
                    <div
                      style={{
                        ...modalMutedTextStyle,
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: darkMode
                          ? "rgba(255,255,255,0.03)"
                          : "rgba(16,24,40,0.04)",
                      }}
                    >
                      {t("connection.modal.network.httpTunnel.disabledHint")}
                    </div>
                  ) : (
                    <div style={tunnelSectionStyle}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) 120px",
                          gap: 16,
                        }}
                      >
                        <Form.Item
                          name="httpTunnelHost"
                          label={t(
                            "connection.modal.network.httpTunnel.host",
                          )}
                          rules={[
                            {
                              required: useHttpTunnel,
                              message: t(
                                "connection.modal.network.httpTunnel.hostRequired",
                              ),
                            },
                          ]}
                          style={{ flex: 1 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder={t("connection.modal.example.or", {
                              first: "tunnel.company.com",
                              second: "127.0.0.1",
                            })}
                          />
                        </Form.Item>
                        <Form.Item
                          name="httpTunnelPort"
                          label={t("connection.modal.field.port.label")}
                          rules={[
                            {
                              required: useHttpTunnel,
                              message: t(
                                "connection.modal.network.httpTunnel.portRequired",
                              ),
                            },
                          ]}
                          style={{ width: 120 }}
                        >
                          <InputNumber
                            style={{ width: "100%" }}
                            min={1}
                            max={65535}
                          />
                        </Form.Item>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 16,
                        }}
                      >
                        <Form.Item
                          name="httpTunnelUser"
                          label={t(
                            "connection.modal.network.httpTunnel.user",
                          )}
                          style={{ flex: 1 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder={t(
                              "connection.modal.network.proxy.noAuth",
                            )}
                          />
                        </Form.Item>
                        <Form.Item
                          name="httpTunnelPassword"
                          label={t(
                            "connection.modal.network.httpTunnel.password",
                          )}
                          style={{ flex: 1 }}
                        >
                          <Input.Password
                            {...noAutoCapInputProps}
                            placeholder={getStoredSecretPlaceholder({
                              hasStoredSecret:
                                initialValues?.hasHttpTunnelPassword,
                              emptyPlaceholder: t(
                                "connection.modal.network.proxy.noAuth",
                              ),
                              retainedLabel: t(
                                "connection.modal.network.httpTunnel.retained",
                              ),
                            })}
                          />
                        </Form.Item>
                      </div>
                      {renderStoredSecretControls({
                        fieldName: "httpTunnelPassword",
                        clearKey: "httpTunnelPassword",
                        hasStoredSecret: initialValues?.hasHttpTunnelPassword,
                        clearLabel: t(
                          "connection.modal.network.httpTunnel.clearPassword",
                        ),
                        description: t(
                          "connection.modal.network.httpTunnel.savedDescription",
                        ),
                      })}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t(
                          "connection.modal.network.httpTunnel.exclusiveHint",
                        )}
                      </Text>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div style={modalInnerSectionStyle}>
                <div
                  style={{
                    marginBottom: 12,
                    color: darkMode ? "#f5f7ff" : "#162033",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {t("connection.modal.network.title")}
                </div>
                <div style={{ ...modalMutedTextStyle, marginBottom: 16 }}>
                  {t("connection.modal.network.description")}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  {networkItems.map((item) => {
                    const active = item.key === resolvedNetworkConfig;
                    const activeColor = darkMode ? "#ffd666" : "#1677ff";
                    return (
                      <div
                        key={item.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveNetworkConfig(item.key)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setActiveNetworkConfig(item.key);
                          }
                        }}
                        style={{
                          ...getConnectionOptionCardStyle(item.enabled),
                          borderColor: active
                            ? darkMode
                              ? "rgba(255,214,102,0.46)"
                              : "rgba(24,144,255,0.36)"
                            : "transparent",
                          background: active
                            ? darkMode
                              ? "linear-gradient(180deg, rgba(255,214,102,0.14) 0%, rgba(255,214,102,0.08) 100%)"
                              : "linear-gradient(180deg, rgba(24,144,255,0.12) 0%, rgba(24,144,255,0.06) 100%)"
                            : getConnectionOptionCardStyle(item.enabled)
                                .background,
                          boxShadow: active
                            ? darkMode
                              ? "0 0 0 1px rgba(255,214,102,0.18) inset, 0 12px 26px rgba(0,0,0,0.16)"
                              : "0 0 0 1px rgba(24,144,255,0.14) inset, 0 12px 22px rgba(24,144,255,0.10)"
                            : "none",
                          cursor: "pointer",
                          outline: "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              marginTop: 8,
                              borderRadius: 999,
                              background: active ? activeColor : "transparent",
                              border: active
                                ? "none"
                                : darkMode
                                  ? "1px solid rgba(255,255,255,0.12)"
                                  : "1px solid rgba(16,24,40,0.12)",
                              flexShrink: 0,
                            }}
                          />
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              minWidth: 0,
                              flex: 1,
                            }}
                          >
                            <Form.Item
                              name={
                                item.key === "ssl"
                                  ? "useSSL"
                                  : item.key === "ssh"
                                    ? "useSSH"
                                    : item.key === "proxy"
                                      ? "useProxy"
                                      : "useHttpTunnel"
                              }
                              valuePropName="checked"
                              noStyle
                            >
                              <Checkbox />
                            </Form.Item>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: darkMode ? "#f5f7ff" : "#162033",
                                  }}
                                >
                                  {item.title}
                                </span>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  {active && (
                                    <span
                                      style={{
                                        padding: "2px 8px",
                                        borderRadius: 999,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: activeColor,
                                        background: darkMode
                                          ? "rgba(255,214,102,0.16)"
                                          : "rgba(24,144,255,0.12)",
                                      }}
                                    >
                                      {t(
                                        "connection.modal.network.currentEditing",
                                      )}
                                    </span>
                                  )}
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: item.enabled
                                        ? activeColor
                                        : darkMode
                                          ? "rgba(255,255,255,0.38)"
                                          : "rgba(16,24,40,0.36)",
                                    }}
                                  >
                                    {item.enabled
                                      ? t("connection.modal.network.enabled")
                                      : t(
                                          "connection.modal.network.notEnabled",
                                        )}
                                  </span>
                                </div>
                              </div>
                              <div
                                style={{
                                  marginTop: 4,
                                  ...modalMutedTextStyle,
                                  color: active
                                    ? darkMode
                                      ? "rgba(255,255,255,0.72)"
                                      : "rgba(22,32,51,0.68)"
                                    : modalMutedTextStyle.color,
                                }}
                              >
                                {item.description}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginBottom: 16 }}>{renderNetworkPanel()}</div>
                <div style={{ ...modalInnerSectionStyle, padding: 12 }}>
                  <div
                    style={{
                      marginBottom: 10,
                      color: darkMode ? "#f5f7ff" : "#162033",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {t("connection.modal.network.advanced.title")}
                  </div>
                  <Form.Item
                    name="timeout"
                    label={t("connection.modal.network.timeout.label")}
                    help={t("connection.modal.network.timeout.help")}
                    rules={[
                      {
                        type: "number",
                        min: 1,
                        max: 300,
                        message: t("connection.modal.network.timeout.range"),
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber
                      style={{ width: "100%" }}
                      min={1}
                      max={300}
                      placeholder={t("connection.modal.example", {
                        value: "30",
                      })}
                    />
                  </Form.Item>
                </div>
              </div>
            );
          })()
        : null;

    return (
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          type: "mysql",
          host: "localhost",
          port: 3306,
          database: "",
          user: "root",
          useSSL: false,
          sslMode: "preferred",
          sslCAPath: "",
          sslCertPath: "",
          sslKeyPath: "",
          useSSH: false,
          sshPort: 22,
          useProxy: false,
          proxyType: "socks5",
          proxyPort: 1080,
          useHttpTunnel: false,
          httpTunnelPort: 8080,
          timeout: 30,
          uri: "",
          connectionParams: "",
          oceanBaseProtocol: "mysql",
          mysqlTopology: "single",
          rocketmqTopology: "single",
          mqttTopology: "single",
          kafkaTopology: "single",
          redisTopology: "single",
          mongoTopology: "single",
          mongoSrv: false,
          mongoReadPreference: "primary",
          mongoAuthMechanism: "",
          savePassword: true,
          mysqlReplicaHosts: [],
          rocketmqHosts: [],
          mqttHosts: [],
          kafkaHosts: [],
          redisHosts: [],
          redisSentinelMaster: "",
          redisSentinelUser: "",
          redisSentinelPassword: "",
          mongoHosts: [],
          mysqlReplicaUser: "",
          mysqlReplicaPassword: "",
          mongoReplicaUser: "",
          mongoReplicaPassword: "",
          redisDB: 0,
          jvmReadOnly: true,
          jvmAllowedModes: ["jmx"],
          jvmPreferredMode: "jmx",
          jvmEnvironment: "dev",
          jvmEndpointEnabled: false,
          jvmEndpointBaseUrl: "",
          jvmEndpointApiKey: "",
          jvmAgentEnabled: false,
          jvmAgentBaseUrl: "",
          jvmAgentApiKey: "",
          jvmDiagnosticEnabled: false,
          jvmDiagnosticTransport: "agent-bridge",
          jvmDiagnosticBaseUrl: "",
          jvmDiagnosticTargetId: "",
          jvmDiagnosticApiKey: "",
          jvmDiagnosticAllowObserveCommands: true,
          jvmDiagnosticAllowTraceCommands: false,
          jvmDiagnosticAllowMutatingCommands: false,
          jvmDiagnosticTimeoutSeconds: 15,
          jvmEndpointTimeoutSeconds: 30,
          jvmJmxHost: "",
          jvmJmxPort: undefined,
          jvmJmxUsername: "",
          jvmJmxPassword: "",
        }}
        onValuesChange={(changed) => {
          if (testResult) {
            setTestResult(null);
            setTestErrorLogOpen(false);
          }
          if (
            changed.uri !== undefined ||
            changed.connectionParams !== undefined ||
            changed.type !== undefined ||
            changed.oceanBaseProtocol !== undefined
          ) {
            setUriFeedback(null);
          }
          if (changed.useSSL !== undefined) {
            setUseSSL(changed.useSSL);
            if (changed.useSSL) setActiveNetworkConfig("ssl");
          }
          if (changed.useSSH !== undefined) {
            setUseSSH(changed.useSSH);
            if (changed.useSSH) setActiveNetworkConfig("ssh");
          }
          if (changed.useProxy !== undefined) {
            const enabledProxy = !!changed.useProxy;
            setUseProxy(enabledProxy);
            if (enabledProxy) setActiveNetworkConfig("proxy");
            if (enabledProxy && form.getFieldValue("useHttpTunnel")) {
              form.setFieldValue("useHttpTunnel", false);
              setUseHttpTunnel(false);
            }
          }
          if (changed.proxyType !== undefined) {
            const nextType = String(
              changed.proxyType || "socks5",
            ).toLowerCase();
            if (nextType === "http") {
              const currentPort = Number(form.getFieldValue("proxyPort") || 0);
              if (!currentPort || currentPort === 1080) {
                form.setFieldValue("proxyPort", 8080);
              }
            } else {
              const currentPort = Number(form.getFieldValue("proxyPort") || 0);
              if (!currentPort || currentPort === 8080) {
                form.setFieldValue("proxyPort", 1080);
              }
            }
          }
          if (changed.useHttpTunnel !== undefined) {
            const enabledHttpTunnel = !!changed.useHttpTunnel;
            setUseHttpTunnel(enabledHttpTunnel);
            if (enabledHttpTunnel) setActiveNetworkConfig("httpTunnel");
            if (enabledHttpTunnel && form.getFieldValue("useProxy")) {
              form.setFieldValue("useProxy", false);
              setUseProxy(false);
            }
            if (enabledHttpTunnel) {
              const currentPort = Number(
                form.getFieldValue("httpTunnelPort") || 0,
              );
              if (!currentPort || currentPort <= 0) {
                form.setFieldValue("httpTunnelPort", 8080);
              }
            }
          }
          if (changed.type !== undefined) setDbType(changed.type);
          if (changed.jvmAllowedModes !== undefined) {
            const resolvedModes = normalizeEditableJVMModes(
              changed.jvmAllowedModes,
            );
            const currentPreferredMode = String(
              form.getFieldValue("jvmPreferredMode") || "",
            )
              .trim()
              .toLowerCase();
            const resolvedPreferredMode =
              resolvedModes.find((mode) => mode === currentPreferredMode) ||
              resolvedModes[0];
            form.setFieldValue("jvmAllowedModes", resolvedModes);
            form.setFieldValue("jvmPreferredMode", resolvedPreferredMode);
            form.setFieldValue(
              "jvmEndpointEnabled",
              resolvedModes.includes("endpoint"),
            );
            form.setFieldValue(
              "jvmAgentEnabled",
              resolvedModes.includes("agent"),
            );
          }
          if (changed.redisTopology !== undefined) {
            const nextRedisTopology = String(
              changed.redisTopology || "single",
            ).toLowerCase();
            const currentRedisPort = Number(form.getFieldValue("port") || 0);
            if (
              nextRedisTopology === "sentinel" &&
              (!currentRedisPort || currentRedisPort === 6379)
            ) {
              form.setFieldValue("port", 26379);
            } else if (
              nextRedisTopology !== "sentinel" &&
              currentRedisPort === 26379
            ) {
              form.setFieldValue("port", 6379);
            }
            const supportedDbs = buildRedisDatabaseList(
              form.getFieldValue("redisDB"),
              form.getFieldValue("includeRedisDatabases"),
            );
            setRedisDbList(supportedDbs);
            form.setFieldValue(
              "includeRedisDatabases",
              normalizeRedisDatabaseSelection(
                form.getFieldValue("includeRedisDatabases"),
                supportedDbs,
              ),
            );
          }
          if (
            changed.type !== undefined ||
            changed.host !== undefined ||
            changed.port !== undefined ||
            changed.mongoHosts !== undefined ||
            changed.mongoTopology !== undefined ||
            changed.mongoSrv !== undefined
          ) {
            setMongoMembers([]);
          }
        }}
      >
        <Form.Item name="type" hidden>
          <Input {...noAutoCapInputProps} />
        </Form.Item>
        {currentDriverUnavailableReason && (
          <Alert
            showIcon
            type="warning"
            style={{ marginBottom: 12 }}
            message={t("connection.modal.driver.unavailableTitle", {
              name: currentDriverSnapshot?.name || dbType,
            })}
            description={
              <Space size={8}>
                <span>{currentDriverUnavailableReason}</span>
                <Button
                  type="link"
                  size="small"
                  onClick={() => onOpenDriverManager?.()}
                >
                  {t("connection.modal.driver.installAction")}
                </Button>
              </Space>
            }
          />
        )}
        {currentDriverUpdateReason && (
          <Alert
            showIcon
            type="warning"
            style={{ marginBottom: 12 }}
            message={t("connection.modal.driver.updateFallback", {
              name: currentDriverSnapshot?.name || dbType,
            })}
            description={
              <Space size={8}>
                <span>{currentDriverUpdateReason}</span>
                <Button
                  type="link"
                  size="small"
                  onClick={() => onOpenDriverManager?.()}
                >
                  {t("connection.modal.driver.reinstallAction")}
                </Button>
              </Space>
            }
          />
        )}
        {(() => {
          const sectionItems: Array<{
            key: "basic" | "network" | "appearance";
            title: string;
            description: string;
            icon: React.ReactNode;
          }> = [
            {
              key: "basic",
              title: t("connection.modal.config.basic.title"),
              description: isJVM
                ? t("connection.modal.config.basic.jvmNavDescription")
                : t("connection.modal.config.basic.navDescription"),
              icon: <DatabaseOutlined />,
            },
            ...(!isCustom && !isFileDb && !isJVM
              ? [
                  {
                    key: "network" as const,
                    title: t("connection.modal.network.title"),
                    description: t(
                      "connection.modal.network.navDescription",
                    ),
                    icon: <CloudOutlined />,
                  },
                ]
              : []),
            {
              key: "appearance",
              title: t("connection.modal.appearance.title"),
              description: t("connection.modal.appearance.description"),
              icon: <BgColorsOutlined />,
            },
          ];
          const resolvedSection = sectionItems.some(
            (item) => item.key === activeConfigSection,
          )
            ? activeConfigSection
            : sectionItems[0]?.key || "basic";

          const effectiveIconType = customIconType || dbType;
          const effectiveIconColor =
            customIconColor || getDbDefaultColor(effectiveIconType);

          const appearanceSection = (
            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ ...modalInnerSectionStyle, padding: 16 }}>
                <div
                  style={{
                    marginBottom: 12,
                    fontSize: 13,
                    fontWeight: 700,
                    color: darkMode ? "#f5f7ff" : "#162033",
                  }}
                >
                  {t("connection.modal.appearance.icon")}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {DB_ICON_TYPES.map((iconKey) => {
                    const isActive = effectiveIconType === iconKey;
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        title={getDbIconLabel(iconKey, t)}
                        onClick={() =>
                          setCustomIconType(
                            iconKey === dbType ? undefined : iconKey,
                          )
                        }
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 10,
                          display: "grid",
                          placeItems: "center",
                          border: `2px solid ${isActive ? effectiveIconColor : darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
                          background: isActive
                            ? darkMode
                              ? "rgba(255,255,255,0.08)"
                              : "rgba(24,144,255,0.06)"
                            : "transparent",
                          cursor: "pointer",
                          transition: "all 120ms ease",
                        }}
                      >
                        {getDbIcon(
                          iconKey,
                          isActive ? effectiveIconColor : undefined,
                          22,
                        )}
                      </button>
                    );
                  })}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: darkMode
                      ? "rgba(255,255,255,0.45)"
                      : "rgba(0,0,0,0.35)",
                  }}
                >
                  {t("connection.modal.appearance.current", {
                    name: getDbIconLabel(effectiveIconType, t),
                  })}
                </div>
              </div>
              <div style={{ ...modalInnerSectionStyle, padding: 16 }}>
                <div
                  style={{
                    marginBottom: 12,
                    fontSize: 13,
                    fontWeight: 700,
                    color: darkMode ? "#f5f7ff" : "#162033",
                  }}
                >
                  {t("connection.modal.appearance.color")}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  {PRESET_ICON_COLORS.map((presetColor) => {
                    const isActive = effectiveIconColor === presetColor;
                    return (
                      <button
                        key={presetColor}
                        type="button"
                        onClick={() =>
                          setCustomIconColor(
                            presetColor === getDbDefaultColor(effectiveIconType)
                              ? undefined
                              : presetColor,
                          )
                        }
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: presetColor,
                          border: isActive
                            ? `2.5px solid ${darkMode ? "#fff" : "#162033"}`
                            : "2px solid transparent",
                          cursor: "pointer",
                          transition: "all 120ms ease",
                          boxShadow: isActive
                            ? `0 0 0 2px ${presetColor}40`
                            : "none",
                        }}
                      />
                    );
                  })}
                  <input
                    type="color"
                    value={effectiveIconColor}
                    onChange={(e) =>
                      setCustomIconColor(
                        e.target.value === getDbDefaultColor(effectiveIconType)
                          ? undefined
                          : e.target.value,
                      )
                    }
                    title={t("connection.modal.appearance.customColor")}
                    style={{
                      width: 28,
                      height: 28,
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      borderRadius: 6,
                      background: "transparent",
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  ...modalInnerSectionStyle,
                  padding: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: darkMode ? "#f5f7ff" : "#162033",
                  }}
                >
                  {t("connection.modal.appearance.preview")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {getDbIcon(effectiveIconType, effectiveIconColor, 24)}
                  <span
                    style={{
                      fontSize: 14,
                      color: darkMode ? "#e0e0e0" : "#333",
                    }}
                  >
                    {form.getFieldValue("name") ||
                      t("connection.modal.appearance.previewName")}
                  </span>
                </div>
                {(customIconType || customIconColor) && (
                  <Button
                    size="small"
                    type="link"
                    onClick={() => {
                      setCustomIconType(undefined);
                      setCustomIconColor(undefined);
                    }}
                  >
                    {t("connection.modal.appearance.reset")}
                  </Button>
                )}
              </div>
            </div>
          );

          const currentSectionContent =
            resolvedSection === "basic"
              ? baseInfoSection
              : resolvedSection === "appearance"
                ? appearanceSection
                : networkSecuritySection;

          if (sectionItems.length <= 1) {
            return currentSectionContent;
          }

          return (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "220px minmax(0, 1fr)",
                gap: 18,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  ...modalInnerSectionStyle,
                  padding: 12,
                  position: "sticky",
                  top: 0,
                }}
              >
                <div
                  style={{
                    marginBottom: 12,
                    color: darkMode ? "#f5f7ff" : "#162033",
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                  }}
                >
                  {t("connection.modal.config.sections")}
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {sectionItems.map((item) => {
                    const active = item.key === resolvedSection;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveConfigSection(item.key)}
                        style={{
                          textAlign: "left",
                          padding: "12px 12px 12px 14px",
                          borderRadius: 14,
                          border: `1px solid ${
                            active
                              ? darkMode
                                ? "rgba(255,214,102,0.3)"
                                : "rgba(24,144,255,0.24)"
                              : darkMode
                                ? "rgba(255,255,255,0.045)"
                                : "rgba(16,24,40,0.055)"
                          }`,
                          background: active
                            ? darkMode
                              ? "linear-gradient(180deg, rgba(255,214,102,0.12) 0%, rgba(255,214,102,0.06) 100%)"
                              : "linear-gradient(180deg, rgba(24,144,255,0.10) 0%, rgba(24,144,255,0.05) 100%)"
                            : darkMode
                              ? "rgba(255,255,255,0.02)"
                              : "rgba(255,255,255,0.7)",
                          color: active
                            ? darkMode
                              ? "#f5f7ff"
                              : "#162033"
                            : darkMode
                              ? "rgba(255,255,255,0.76)"
                              : "#3f4b5e",
                          cursor: "pointer",
                          transition: "all 120ms ease",
                          boxShadow: active
                            ? darkMode
                              ? "0 10px 24px rgba(0,0,0,0.18)"
                              : "0 10px 22px rgba(24,144,255,0.08)"
                            : "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 10,
                              display: "grid",
                              placeItems: "center",
                              flexShrink: 0,
                              background: active
                                ? darkMode
                                  ? "rgba(255,214,102,0.16)"
                                  : "rgba(24,144,255,0.14)"
                                : darkMode
                                  ? "rgba(255,255,255,0.05)"
                                  : "rgba(16,24,40,0.05)",
                              color: active
                                ? darkMode
                                  ? "#ffd666"
                                  : "#1677ff"
                                : darkMode
                                  ? "rgba(255,255,255,0.55)"
                                  : "#627089",
                            }}
                          >
                            {item.icon}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <span style={{ fontSize: 14, fontWeight: 700 }}>
                                {item.title}
                              </span>
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 999,
                                  background: active
                                    ? darkMode
                                      ? "#ffd666"
                                      : "#1677ff"
                                    : "transparent",
                                  border: active
                                    ? "none"
                                    : darkMode
                                      ? "1px solid rgba(255,255,255,0.12)"
                                      : "1px solid rgba(16,24,40,0.12)",
                                }}
                              />
                            </div>
                            <div
                              style={{
                                marginTop: 5,
                                fontSize: 12,
                                lineHeight: 1.55,
                                color: active
                                  ? darkMode
                                    ? "rgba(255,255,255,0.68)"
                                    : "rgba(22,32,51,0.68)"
                                  : darkMode
                                    ? "rgba(255,255,255,0.42)"
                                    : "rgba(63,75,94,0.62)",
                              }}
                            >
                              {item.description}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ minWidth: 0 }}>{currentSectionContent}</div>
            </div>
          );
        })()}
      </Form>
    );
  };

  const getFooter = () => {
    if (step === 1) {
      return [
        <Button key="cancel" onClick={onClose}>
          {t("common.action.cancel")}
        </Button>,
      ];
    }
    const isTestSuccess = testResult?.type === "success";
    const hasTestError = !!testResult && !isTestSuccess;
    const testFailureSummary = hasTestError
      ? summarizeConnectionTestFailureMessage(
          resolvedTestResultMessage,
          t("connection.status.failure"),
        )
      : "";
    const operationBlocked =
      !!currentDriverUnavailableReason ||
      driverStatusChecking ||
      !!unsupportedJvmModeMessage;
    return (
      <div
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "4px 2px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          {!initialValues && (
            <Button key="back" onClick={() => setStep(1)}>
              {t("common.action.back")}
            </Button>
          )}
          {testResult ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 24,
                padding: "0 10px",
                borderRadius: 999,
                border: isTestSuccess
                  ? "1px solid rgba(82, 196, 26, 0.35)"
                  : "1px solid rgba(255, 77, 79, 0.35)",
                background: isTestSuccess
                  ? "rgba(82, 196, 26, 0.10)"
                  : "rgba(255, 77, 79, 0.10)",
                color: isTestSuccess ? "#389e0d" : "#cf1322",
                fontSize: 12,
                lineHeight: "22px",
                whiteSpace: "nowrap",
                boxSizing: "border-box",
              }}
            >
              {isTestSuccess ? <CheckCircleFilled /> : <CloseCircleFilled />}
              <span>
                {isTestSuccess
                  ? t("connection.status.success")
                  : t("connection.status.failure")}
              </span>
            </span>
          ) : null}
          {hasTestError && (
            <span
              data-connection-test-error-summary="true"
              title={testFailureSummary}
              style={{
                minWidth: 0,
                flex: 1,
                color: "#cf1322",
                fontSize: 12,
                lineHeight: "20px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {testFailureSummary}
            </span>
          )}
          {hasTestError && (
            <Button
              size="small"
              icon={<FileTextOutlined />}
              style={{
                height: 24,
                borderRadius: 999,
                padding: "0 10px",
                borderColor: "#ffccc7",
                background: "#fff2f0",
                color: "#cf1322",
              }}
              onClick={() => setTestErrorLogOpen(true)}
            >
              {t("connection.action.viewDetails")}
            </Button>
          )}
        </div>
        <Space size={8} style={{ flexShrink: 0 }}>
          <Button
            key="test"
            loading={loading}
            disabled={operationBlocked}
            onClick={requestTest}
          >
            {t("connection.action.test")}
          </Button>
          <Button key="cancel" onClick={onClose}>
            {t("common.action.cancel")}
          </Button>
          <Button
            key="submit"
            type="primary"
            loading={loading}
            disabled={operationBlocked}
            onClick={handleOk}
          >
            {t("common.action.save")}
          </Button>
        </Space>
      </div>
    );
  };

  const getTitle = () => {
    if (step === 1) {
      return renderConnectionModalTitle(
        <AppstoreOutlined />,
        t("connection.modal.title.step1"),
        t("connection.modal.description.step1"),
      );
    }
    const typeName = dbTypes.find((t) => t.key === dbType)?.name || dbType;
    return initialValues
      ? renderConnectionModalTitle(
          <EditOutlined />,
          t("connection.modal.title.edit"),
          t("connection.modal.description.edit", { type: typeName }),
        )
      : renderConnectionModalTitle(
          <LinkOutlined />,
          t("connection.modal.title.create", { type: typeName }),
          t("connection.modal.description.create"),
        );
  };

  const modalBodyStyle = {
    padding: "12px 24px 18px",
    height: CONNECTION_MODAL_BODY_HEIGHT,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
  };

  return (
    <>
      <Modal
        title={getTitle()}
        open={open}
        onCancel={onClose}
        footer={getFooter()}
        centered
        wrapClassName="connection-modal-wrap"
        width={CONNECTION_MODAL_WIDTH}
        zIndex={10001}
        destroyOnHidden
        maskClosable={false}
        styles={{
          content: modalShellStyle,
          header: {
            background: "transparent",
            borderBottom: "none",
            paddingBottom: 8,
          },
          body: modalBodyStyle,
          footer: {
            background: "transparent",
            borderTop: "none",
            paddingTop: 10,
          },
        }}
      >
        {step === 1 ? renderStep1() : renderStep2()}
      </Modal>
      <Modal
        title={renderConnectionModalTitle(
          <FileTextOutlined />,
          t("connection.modal.failureDialog.title"),
          t("connection.modal.failureDialog.description"),
        )}
        open={testErrorLogOpen}
        onCancel={() => setTestErrorLogOpen(false)}
        centered
        width={760}
        zIndex={10002}
        destroyOnHidden
        styles={{
          content: modalShellStyle,
          header: {
            background: "transparent",
            borderBottom: "none",
            paddingBottom: 8,
          },
          body: { paddingTop: 8 },
          footer: {
            background: "transparent",
            borderTop: "none",
            paddingTop: 10,
          },
        }}
        footer={[
          <Button key="close" onClick={() => setTestErrorLogOpen(false)}>
            {t("common.action.close")}
          </Button>,
        ]}
      >
        <pre
          style={{
            margin: 0,
            maxHeight: "50vh",
            overflowY: "auto",
            padding: 12,
            borderRadius: 6,
            background: "#fff2f0",
            border: "1px solid #ffccc7",
            color: "#a8071a",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            lineHeight: "20px",
            fontSize: 13,
            fontFamily: "var(--gn-font-mono)",
          }}
        >
          {String(
            resolvedTestResultMessage ||
              t("connection.modal.failureDialog.emptyLog"),
          )}
        </pre>
      </Modal>
    </>
  );
};

export default ConnectionModal;
