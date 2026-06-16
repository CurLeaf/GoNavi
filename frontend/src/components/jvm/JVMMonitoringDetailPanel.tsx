import React from "react";
import { Alert, Card, Descriptions, Empty, List, Space, Tag, Typography } from "antd";

import { t, type SupportedLanguage } from "../../i18n";
import type { JVMMonitoringPoint, JVMMonitoringSessionState } from "../../types";
import {
  buildMonitoringAvailabilityText,
  extractThreadStateRows,
  formatBytes,
  formatCompactNumber,
  formatPercent,
  formatRecentGCLabel,
} from "../../utils/jvmMonitoringPresentation";

const { Paragraph, Text } = Typography;

type JVMMonitoringDetailPanelProps = {
  session: JVMMonitoringSessionState;
  latestPoint?: JVMMonitoringPoint;
  darkMode: boolean;
  language?: SupportedLanguage;
};

const buildCardStyle = (darkMode: boolean): React.CSSProperties => ({
  borderRadius: 12,
  background: darkMode ? "#1f1f1f" : "#ffffff",
  boxShadow: "0 1px 2px rgba(5, 5, 5, 0.06)",
});

const buildProcessMemoryMissingHint = (
  session: JVMMonitoringSessionState,
  language?: SupportedLanguage,
): string | null => {
  if (!(session.missingMetrics || []).includes("memory.rss")) {
    return null;
  }

  if (session.providerMode === "jmx") {
    return t("jvm_monitoring_detail_panel.memory_missing.jmx", undefined, language);
  }

  return t("jvm_monitoring_detail_panel.memory_missing.default", undefined, language);
};

const JVMMonitoringDetailPanel: React.FC<JVMMonitoringDetailPanelProps> = ({
  session,
  latestPoint,
  darkMode,
  language,
}) => {
  const tr = (key: string, params?: Record<string, string | number>) =>
    t(key, params, language);
  const threadRows = extractThreadStateRows(latestPoint, language);
  const recentGcEvents = session.recentGcEvents || [];
  const missingMetrics = session.missingMetrics || [];
  const processMemoryMissingHint = buildProcessMemoryMissingHint(session, language);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        variant="borderless"
        title={tr("jvm_monitoring_detail_panel.title.troubleshooting_metrics")}
        style={buildCardStyle(darkMode)}
      >
        <Descriptions column={1} size="small">
          <Descriptions.Item label={tr("jvm_monitoring_detail_panel.field.process_cpu")}>
            {formatPercent(latestPoint?.processCpuLoad)}
          </Descriptions.Item>
          <Descriptions.Item label={tr("jvm_monitoring_detail_panel.field.system_cpu")}>
            {formatPercent(latestPoint?.systemCpuLoad)}
          </Descriptions.Item>
          <Descriptions.Item
            label={tr("jvm_monitoring_detail_panel.field.process_physical_memory")}
          >
            {formatBytes(latestPoint?.processRssBytes)}
          </Descriptions.Item>
          <Descriptions.Item
            label={tr("jvm_monitoring_detail_panel.field.process_virtual_memory")}
          >
            {formatBytes(latestPoint?.committedVirtualMemoryBytes)}
          </Descriptions.Item>
        </Descriptions>
        {processMemoryMissingHint ? (
          <Alert
            type="info"
            showIcon
            message={tr("jvm_monitoring_detail_panel.memory_missing.title")}
            description={processMemoryMissingHint}
            style={{ marginTop: 12 }}
          />
        ) : null}
      </Card>

      <Card
        variant="borderless"
        title={tr("jvm_monitoring_detail_panel.title.thread_state_distribution")}
        style={buildCardStyle(darkMode)}
      >
        {threadRows.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={tr("jvm_monitoring_detail_panel.empty.thread_states")}
          />
        ) : (
          <Space wrap size={[8, 8]}>
            {threadRows.map((item) => (
              <Tag key={item.state} color="blue">
                {item.label} {formatCompactNumber(item.count, language)}
              </Tag>
            ))}
          </Space>
        )}
      </Card>

      <Card
        variant="borderless"
        title={tr("jvm_monitoring_detail_panel.title.recent_gc_details")}
        style={buildCardStyle(darkMode)}
      >
        {recentGcEvents.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              missingMetrics.includes("gc.events")
                ? tr("jvm_monitoring_detail_panel.empty.gc_events_unavailable")
                : tr("jvm_monitoring_detail_panel.empty.recent_gc_events")
            }
          />
        ) : (
          <List
            dataSource={recentGcEvents}
            renderItem={(event) => (
              <List.Item>
                <List.Item.Meta
                  title={formatRecentGCLabel(event, language)}
                  description={
                    <Space size={12} wrap>
                      {typeof event.beforeUsedBytes === "number" ? (
                        <Text type="secondary">
                          {tr("jvm_monitoring_detail_panel.gc.before")}{" "}
                          {formatBytes(event.beforeUsedBytes)}
                        </Text>
                      ) : null}
                      {typeof event.afterUsedBytes === "number" ? (
                        <Text type="secondary">
                          {tr("jvm_monitoring_detail_panel.gc.after")}{" "}
                          {formatBytes(event.afterUsedBytes)}
                        </Text>
                      ) : null}
                      {event.action ? <Tag>{event.action}</Tag> : null}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Card
        variant="borderless"
        title={tr("jvm_monitoring_detail_panel.title.capabilities_and_degradation")}
        style={buildCardStyle(darkMode)}
      >
        <Paragraph type="secondary" style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>
          {buildMonitoringAvailabilityText(session, language)}
        </Paragraph>
        <Space size={[8, 8]} wrap>
          {(session.missingMetrics || []).map((metric) => (
            <Tag key={metric} color="warning">
              {metric}
            </Tag>
          ))}
          {(session.providerWarnings || []).map((warning, index) => (
            <Tag key={`${warning}-${index}`} color="default">
              {warning}
            </Tag>
          ))}
        </Space>
      </Card>
    </Space>
  );
};

export default JVMMonitoringDetailPanel;
