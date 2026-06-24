import React from "react";
import { Empty, List, Tag, Typography } from "antd";

import type {
  JVMDiagnosticAuditRecord,
  JVMDiagnosticSessionHandle,
} from "../../types";
import {
  formatJVMDiagnosticCommandTypeLabel,
  formatJVMDiagnosticRiskLabel,
  formatJVMDiagnosticSourceLabel,
  formatJVMDiagnosticPhaseLabel,
  formatJVMDiagnosticTransportLabel,
} from "../../utils/jvmDiagnosticPresentation";
import { useI18n } from "../../i18n/provider";
const { Text } = Typography;

type JVMDiagnosticHistoryProps = {
  session?: JVMDiagnosticSessionHandle | null;
  records?: JVMDiagnosticAuditRecord[];
  showSession?: boolean;
  maxHeight?: number;
};

const JVMDiagnosticHistory: React.FC<JVMDiagnosticHistoryProps> = ({
  session,
  records = [],
  showSession = true,
  maxHeight = 360,
}) => {
  const { t } = useI18n();

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {showSession ? (
        <div style={{ display: "grid", gap: 4 }}>
          <Text strong>{t("jvm_diagnostic.history.current_session")}</Text>
          {session ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tag color="blue">{session.sessionId}</Tag>
              <Tag>{formatJVMDiagnosticTransportLabel(session.transport, t)}</Tag>
            </div>
          ) : (
            <Empty
              description={t("jvm_diagnostic.history.no_session")}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        <Text strong>{t("jvm_diagnostic.history.recent_records")}</Text>
        {records.length ? (
          <div style={{ maxHeight, overflow: "auto", paddingRight: 4 }}>
            <List
              size="small"
              dataSource={records}
              renderItem={(record) => (
                <List.Item
                  key={`${record.sessionId || "record"}-${record.commandId || record.command}-${record.timestamp}`}
                >
                  <div style={{ display: "grid", gap: 4, width: "100%" }}>
                    <Text
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontFamily: "var(--gn-font-mono)",
                      }}
                    >
                      {record.command}
                    </Text>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {record.status ? (
                        <Tag color="green">{formatJVMDiagnosticPhaseLabel(record.status, t)}</Tag>
                      ) : null}
                      {record.riskLevel ? (
                        <Tag color="gold">{formatJVMDiagnosticRiskLabel(record.riskLevel, t)}</Tag>
                      ) : null}
                      {record.commandType ? (
                        <Tag color="blue">{formatJVMDiagnosticCommandTypeLabel(record.commandType, t)}</Tag>
                      ) : null}
                      {record.source ? <Tag>{formatJVMDiagnosticSourceLabel(record.source, t)}</Tag> : null}
                    </div>
                    <Text type="secondary">
                      {record.reason || t("jvm_diagnostic.history.reason_missing")}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
          </div>
        ) : (
          <Empty description={t("jvm_diagnostic.history.no_records")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    </div>
  );
};

export default JVMDiagnosticHistory;
