import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Card,
  Descriptions,
  Empty,
  Skeleton,
  Space,
  Tag,
  Typography,
} from "antd";

import { useStore } from "../store";
import { JVMProbeCapabilities } from "../../wailsjs/go/app/App";
import { buildRpcConnectionConfig } from "../utils/connectionRpcConfig";
import { resolveJVMModeMeta } from "../utils/jvmRuntimePresentation";
import type { JVMCapability, TabData } from "../types";
import JVMModeBadge from "./jvm/JVMModeBadge";
import {
  getJVMWorkspaceCardStyle,
  JVMWorkspaceHero,
  JVMWorkspaceShell,
} from "./jvm/JVMWorkspaceLayout";
import { useI18n } from "../i18n/provider";

const { Text } = Typography;
const DESCRIPTION_STYLES = { label: { width: 120 } } as const;

type JVMOverviewProps = {
  tab: TabData;
};

const JVMOverview: React.FC<JVMOverviewProps> = ({ tab }) => {
  const { language, t } = useI18n();
  const connection = useStore((state) =>
    state.connections.find((item) => item.id === tab.connectionId),
  );
  const theme = useStore((state) => state.theme);
  const darkMode = theme === "dark";
  const providerMode =
    tab.providerMode || connection?.config.jvm?.preferredMode || "jmx";
  const readOnly = connection?.config.jvm?.readOnly !== false;
  const allowedModes = connection?.config.jvm?.allowedModes || [];
  const [capabilities, setCapabilities] = useState<JVMCapability[]>([]);
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  const [capabilityError, setCapabilityError] = useState("");

  const endpointSummary = useMemo(() => {
    if (!connection?.config.jvm?.endpoint) {
      return "";
    }
    const endpoint = connection.config.jvm.endpoint;
    if (!endpoint.enabled && !endpoint.baseUrl) {
      return "";
    }
    return endpoint.baseUrl || t("jvm_overview.value.enabled");
  }, [connection, t]);

  const agentSummary = useMemo(() => {
    if (!connection?.config.jvm?.agent) {
      return "";
    }
    const agent = connection.config.jvm.agent;
    if (!agent.enabled && !agent.baseUrl) {
      return "";
    }
    return agent.baseUrl || t("jvm_overview.value.enabled");
  }, [connection, t]);

  const allowedModeSummary = useMemo(() => {
    const items = allowedModes.length > 0 ? allowedModes : ["jmx"];
    const delimiter =
      language.startsWith("zh") || language === "ja-JP" ? "、" : ", ";
    return items.map((item) => resolveJVMModeMeta(item).label).join(delimiter);
  }, [allowedModes, language]);

  useEffect(() => {
    if (!connection) {
      setCapabilities([]);
      setCapabilityError(t("jvm_overview.connection_missing.message"));
      setCapabilityLoading(false);
      return;
    }

    let cancelled = false;
    const loadCapabilities = async () => {
      setCapabilityLoading(true);
      setCapabilityError("");
      try {
        const result = await JVMProbeCapabilities(
          buildRpcConnectionConfig(connection.config, { database: "" }) as any,
        );
        if (cancelled) {
          return;
        }
        if (result?.success === false) {
          setCapabilities([]);
          setCapabilityError(
            String(
              result?.message || t("jvm_overview.error.capability_load_failed"),
            ),
          );
          return;
        }
        setCapabilities(
          Array.isArray(result?.data) ? (result.data as JVMCapability[]) : [],
        );
      } catch (error: any) {
        if (!cancelled) {
          setCapabilities([]);
          setCapabilityError(
            error?.message || t("jvm_overview.error.capability_load_failed"),
          );
        }
      } finally {
        if (!cancelled) {
          setCapabilityLoading(false);
        }
      }
    };

    void loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, [connection, t]);

  if (!connection) {
    return (
      <Empty
        description={t("jvm_overview.connection_missing.message")}
        style={{ marginTop: 64 }}
      />
    );
  }

  const jmxHost = connection.config.jvm?.jmx?.host || connection.config.host;
  const jmxPort = connection.config.jvm?.jmx?.port || connection.config.port;

  const cardStyle = getJVMWorkspaceCardStyle(darkMode);

  return (
    <JVMWorkspaceShell darkMode={darkMode}>
      <JVMWorkspaceHero
        darkMode={darkMode}
        eyebrow={t("jvm_overview.eyebrow")}
        title={t("jvm_overview.title")}
        description={
          <>
            <Text strong>{connection.name}</Text>
            <Text type="secondary">
              {" "}
              · {connection.config.host}:{connection.config.port}
            </Text>
          </>
        }
        badges={
          <>
            <JVMModeBadge mode={providerMode} />
            <Tag color={readOnly ? "blue" : "red"}>
              {readOnly
                ? t("jvm_overview.badge.read_only")
                : t("jvm_overview.badge.writable")}
            </Tag>
            <Tag>{connection.config.jvm?.environment || "dev"}</Tag>
          </>
        }
      />

      <Card
        title={t("jvm_overview.card.connection_summary")}
        variant="borderless"
        style={cardStyle}
      >
        <Descriptions column={1} size="small" styles={DESCRIPTION_STYLES}>
          <Descriptions.Item label={t("jvm_overview.field.current_mode")}>
            {resolveJVMModeMeta(providerMode).label}
          </Descriptions.Item>
          <Descriptions.Item label={t("jvm_overview.field.allowed_modes")}>
            {allowedModeSummary}
          </Descriptions.Item>
          <Descriptions.Item label={t("jvm_overview.field.jmx_address")}>
            {`${jmxHost}:${jmxPort}`}
          </Descriptions.Item>
          <Descriptions.Item label={t("jvm_overview.field.endpoint")}>
            {endpointSummary || t("jvm_overview.value.not_configured")}
          </Descriptions.Item>
          <Descriptions.Item label={t("jvm_overview.field.agent")}>
            {agentSummary || t("jvm_overview.value.not_configured")}
          </Descriptions.Item>
          <Descriptions.Item label={t("jvm_overview.field.resource_browse")}>
            {t("jvm_overview.value.resource_browse_lazy_load")}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title={t("jvm_overview.card.mode_capability")}
        variant="borderless"
        style={cardStyle}
      >
        {capabilityLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : capabilityError ? (
          <Alert
            type="error"
            showIcon
            message={t("jvm_overview.error.capability_load_failed")}
            description={
              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {capabilityError}
              </span>
            }
          />
        ) : capabilities.length === 0 ? (
          <Empty description={t("jvm_overview.empty.capabilities")} />
        ) : (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {capabilities.map((capability) => (
              <div
                key={capability.mode}
                style={{
                  border: "1px solid rgba(5, 5, 5, 0.08)",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <Space size={8} wrap>
                  <JVMModeBadge mode={capability.mode} />
                  <Tag color={capability.canBrowse ? "green" : "default"}>
                    {capability.canBrowse
                      ? t("jvm_overview.capability.can_browse")
                      : t("jvm_overview.capability.cannot_browse")}
                  </Tag>
                  <Tag color={capability.canWrite ? "red" : "blue"}>
                    {capability.canWrite
                      ? t("jvm_overview.capability.writable")
                      : t("jvm_overview.capability.read_only")}
                  </Tag>
                  <Tag color={capability.canPreview ? "gold" : "default"}>
                    {capability.canPreview
                      ? t("jvm_overview.capability.preview_supported")
                      : t("jvm_overview.capability.preview_unsupported")}
                  </Tag>
                </Space>
                {capability.reason ? (
                  <Text
                    type="secondary"
                    style={{
                      display: "block",
                      marginTop: 8,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {capability.reason}
                  </Text>
                ) : null}
              </div>
            ))}
          </Space>
        )}
      </Card>
    </JVMWorkspaceShell>
  );
};

export default JVMOverview;
