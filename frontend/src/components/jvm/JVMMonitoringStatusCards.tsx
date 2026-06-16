import React from "react";
import { Card, Col, Row, Space, Statistic, Tag, Typography } from "antd";

import { t, type SupportedLanguage } from "../../i18n";
import type { JVMMonitoringPoint, JVMMonitoringSessionState } from "../../types";
import {
  formatBytes,
  formatCompactNumber,
  formatDurationMs,
  resolveThreadStateLabel,
} from "../../utils/jvmMonitoringPresentation";

const { Text } = Typography;

type JVMMonitoringStatusCardsProps = {
  latestPoint?: JVMMonitoringPoint;
  session?: JVMMonitoringSessionState;
  darkMode: boolean;
  language?: SupportedLanguage;
};

const cardStyle = (darkMode: boolean): React.CSSProperties => ({
  borderRadius: 12,
  background: darkMode ? "#1f1f1f" : "#ffffff",
  boxShadow: "0 1px 2px rgba(5, 5, 5, 0.06)",
});

const JVMMonitoringStatusCards: React.FC<JVMMonitoringStatusCardsProps> = ({
  latestPoint,
  session,
  darkMode,
  language,
}) => {
  const tr = (key: string, params?: Record<string, string | number>) =>
    t(key, params, language);
  const runnableCount = latestPoint?.threadStateCounts?.RUNNABLE || 0;
  const heapMeta =
    latestPoint?.heapCommittedBytes && latestPoint.heapCommittedBytes > 0
      ? tr("jvm_monitoring_status_cards.meta.heap_committed", {
          value: formatBytes(latestPoint.heapCommittedBytes),
        })
      : tr("jvm_monitoring_status_cards.meta.waiting_samples");
  const gcMeta =
    typeof latestPoint?.gcDeltaTimeMs === "number" && latestPoint.gcDeltaTimeMs >= 0
      ? `Δ ${formatDurationMs(latestPoint.gcDeltaTimeMs)}`
      : typeof latestPoint?.gcCollectionTimeMs === "number"
        ? tr("jvm_monitoring_status_cards.meta.gc_total_time", {
            value: formatDurationMs(latestPoint.gcCollectionTimeMs),
          })
        : tr("jvm_monitoring_status_cards.meta.waiting_samples");
  const threadMeta =
    latestPoint?.peakThreadCount && latestPoint.peakThreadCount > 0
      ? tr("jvm_monitoring_status_cards.meta.thread_peak", {
          value: formatCompactNumber(latestPoint.peakThreadCount, language),
        })
      : tr("jvm_monitoring_status_cards.meta.waiting_samples");
  const classMeta =
    typeof latestPoint?.classLoadDelta === "number"
      ? `Δ ${formatCompactNumber(latestPoint.classLoadDelta, language)}`
      : tr("jvm_monitoring_status_cards.meta.waiting_samples");
  const runnableLabel = resolveThreadStateLabel("RUNNABLE", language);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} xl={6}>
        <Card
          variant="borderless"
          style={cardStyle(darkMode)}
          title={tr("jvm_monitoring_status_cards.title.heap")}
        >
          <Statistic value={formatBytes(latestPoint?.heapUsedBytes)} />
          <Text type="secondary">{heapMeta}</Text>
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card
          variant="borderless"
          style={cardStyle(darkMode)}
          title={tr("jvm_monitoring_status_cards.title.gc_pressure")}
        >
          <Statistic
            value={formatCompactNumber(
              latestPoint?.gcDeltaCount ?? latestPoint?.gcCollectionCount,
              language,
            )}
          />
          <Text type="secondary">{gcMeta}</Text>
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card
          variant="borderless"
          style={cardStyle(darkMode)}
          title={tr("jvm_monitoring_status_cards.title.threads")}
        >
          <Statistic value={formatCompactNumber(latestPoint?.threadCount, language)} />
          <Space size={8} wrap>
            <Text type="secondary">{threadMeta}</Text>
            {runnableCount > 0 ? <Tag color="blue">{runnableLabel} {runnableCount}</Tag> : null}
          </Space>
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card
          variant="borderless"
          style={cardStyle(darkMode)}
          title={tr("jvm_monitoring_status_cards.title.classes")}
        >
          <Statistic
            value={formatCompactNumber(latestPoint?.loadedClassCount, language)}
          />
          <Space size={8} wrap>
            <Text type="secondary">{classMeta}</Text>
            {session?.running ? (
              <Tag color="green">
                {tr("jvm_monitoring_status_cards.status.sampling")}
              </Tag>
            ) : (
              <Tag>{tr("jvm_monitoring_status_cards.status.stopped")}</Tag>
            )}
          </Space>
        </Card>
      </Col>
    </Row>
  );
};

export default JVMMonitoringStatusCards;
