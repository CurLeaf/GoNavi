import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";

import { useI18n } from "../i18n/provider";
import { useStore } from "../store";
import type { JVMAuditRecord, TabData } from "../types";
import {
  formatJVMAuditResultLabel,
  formatJVMActionDisplayText,
  resolveJVMAuditResultColor,
} from "../utils/jvmResourcePresentation";
import JVMModeBadge from "./jvm/JVMModeBadge";
import {
  getJVMWorkspaceCardStyle,
  JVMWorkspaceHero,
  JVMWorkspaceShell,
} from "./jvm/JVMWorkspaceLayout";

const { Text } = Typography;

type JVMAuditViewerProps = {
  tab: TabData;
};

const LIMIT_OPTIONS = [20, 50, 100, 200];

const normalizeAuditRecords = (value: any): JVMAuditRecord[] => {
  if (Array.isArray(value)) {
    return value as JVMAuditRecord[];
  }
  if (Array.isArray(value?.data)) {
    return value.data as JVMAuditRecord[];
  }
  return [];
};

const filterAuditRecordsByMode = (
  records: JVMAuditRecord[],
  providerMode?: string,
): JVMAuditRecord[] => {
  const normalizedMode = String(providerMode || "")
    .trim()
    .toLowerCase();
  if (!normalizedMode) {
    return records;
  }
  return records.filter(
    (record) =>
      String(record.providerMode || "")
        .trim()
        .toLowerCase() === normalizedMode,
  );
};

const formatTimestamp = (timestamp: number, language?: string): string => {
  if (!timestamp) {
    return "-";
  }
  const normalized = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return String(timestamp);
  }
  return date.toLocaleString(language || "zh-CN", { hour12: false });
};

const JVMAuditViewer: React.FC<JVMAuditViewerProps> = ({ tab }) => {
  const { t, language } = useI18n();
  const connection = useStore((state) =>
    state.connections.find((item) => item.id === tab.connectionId),
  );
  const theme = useStore((state) => state.theme);
  const darkMode = theme === "dark";
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<JVMAuditRecord[]>([]);
  const [error, setError] = useState("");

  const formatLoadFailedError = (detail?: unknown): string => {
    const normalizedDetail = String(detail || "").trim();
    return t("jvm_audit.error.load_failed", {
      separator: normalizedDetail ? ": " : "",
      detail: normalizedDetail,
    });
  };

  const columns = useMemo<ColumnsType<JVMAuditRecord>>(
    () => [
      {
        title: t("jvm_audit.column.time"),
        dataIndex: "timestamp",
        key: "timestamp",
        width: 180,
        render: (value: number) => formatTimestamp(value, language),
      },
      {
        title: t("jvm_audit.column.mode"),
        dataIndex: "providerMode",
        key: "providerMode",
        width: 120,
        render: (value: string) => (
          <JVMModeBadge mode={value || tab.providerMode || "jmx"} />
        ),
      },
      {
        title: t("jvm_audit.column.action"),
        dataIndex: "action",
        key: "action",
        width: 160,
        render: (value: string) =>
          formatJVMActionDisplayText(value, language) || "-",
      },
      {
        title: t("jvm_audit.column.resource"),
        dataIndex: "resourceId",
        key: "resourceId",
        ellipsis: true,
        render: (value: string) => value || "-",
      },
      {
        title: t("jvm_audit.column.reason"),
        dataIndex: "reason",
        key: "reason",
        ellipsis: true,
        render: (value: string) => value || "-",
      },
      {
        title: t("jvm_audit.column.source"),
        dataIndex: "source",
        key: "source",
        width: 120,
        render: (value?: string) => {
          const normalized = String(value || "")
            .trim()
            .toLowerCase();
          if (normalized === "ai-plan") {
            return <Tag color="purple">{t("jvm_audit.source.ai_plan")}</Tag>;
          }
          return <Tag>{t("jvm_audit.source.manual")}</Tag>;
        },
      },
      {
        title: t("jvm_audit.column.result"),
        dataIndex: "result",
        key: "result",
        width: 140,
        render: (value: string) => (
          <Tag color={resolveJVMAuditResultColor(value)}>
            {formatJVMAuditResultLabel(value, language)}
          </Tag>
        ),
      },
    ],
    [language, tab.providerMode, t],
  );

  const loadRecords = async () => {
    if (!connection) {
      setLoading(false);
      setRecords([]);
      setError(t("jvm_audit.error.connection_missing"));
      return;
    }

    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMListAuditRecords !== "function") {
      setLoading(false);
      setRecords([]);
      setError(t("jvm_audit.error.backend_unavailable"));
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMListAuditRecords(connection.id, limit);
      if (result?.success === false) {
        setRecords([]);
        setError(formatLoadFailedError(result?.message));
        return;
      }
      setRecords(
        filterAuditRecordsByMode(
          normalizeAuditRecords(result),
          tab.providerMode,
        ),
      );
    } catch (err: any) {
      setRecords([]);
      setError(
        formatLoadFailedError(
          err?.message || (typeof err === "string" ? err : ""),
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, [connection, limit, tab.connectionId, tab.providerMode, t]);

  if (!connection) {
    return (
      <Empty
        description={t("jvm_audit.error.connection_missing")}
        style={{ marginTop: 64 }}
      />
    );
  }

  const activeMode =
    tab.providerMode || connection.config.jvm?.preferredMode || "jmx";
  const cardStyle = getJVMWorkspaceCardStyle(darkMode);

  return (
    <JVMWorkspaceShell darkMode={darkMode}>
      <JVMWorkspaceHero
        darkMode={darkMode}
        eyebrow={t("jvm_audit.eyebrow")}
        title={t("jvm_audit.title")}
        description={
          <>
            <Text strong>{connection.name}</Text>
            <Text type="secondary"> · {connection.id}</Text>
            <Text type="secondary">
              {" · "}
              {t("jvm_audit.description.current_range", { limit })}
            </Text>
          </>
        }
        badges={<JVMModeBadge mode={activeMode} />}
        actions={
          <>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => void loadRecords()}
            >
              {t("jvm_audit.action.refresh")}
            </Button>
            <Select
              size="small"
              value={limit}
              onChange={setLimit}
              options={LIMIT_OPTIONS.map((item) => ({
                value: item,
                label: t("jvm_audit.option.last_records", { limit: item }),
              }))}
              style={{ width: 132 }}
            />
          </>
        }
      />

      <Card
        title={t("jvm_audit.card.records")}
        variant="borderless"
        style={cardStyle}
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {error ? <Alert type="error" showIcon message={error} /> : null}
          <Table<JVMAuditRecord>
            rowKey={(record) =>
              `${record.timestamp}-${record.resourceId}-${record.action}`
            }
            loading={loading}
            columns={columns}
            dataSource={records}
            pagination={false}
            locale={{
              emptyText: error
                ? t("jvm_audit.empty.load_failed")
                : t("jvm_audit.empty.no_records"),
            }}
            scroll={{ x: 960 }}
            size="small"
          />
        </Space>
      </Card>
    </JVMWorkspaceShell>
  );
};

export default JVMAuditViewer;
