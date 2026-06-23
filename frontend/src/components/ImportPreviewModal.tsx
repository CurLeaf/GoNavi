import Modal from './common/ResizableDraggableModal';
import React, { useState, useEffect } from "react";
import { Table, Alert, Progress, Button, Space } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import {
  PreviewImportFile,
  ImportDataWithProgress,
} from "../../wailsjs/go/app/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { useStore } from "../store";
import { t as defaultTranslate } from "../i18n";
import { useOptionalI18n } from "../i18n/provider";
import { buildRpcConnectionConfig } from "../utils/connectionRpcConfig";
interface ImportPreviewModalProps {
  visible: boolean;
  filePath: string;
  connectionId: string;
  dbName: string;
  tableName: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface PreviewData {
  columns: string[];
  totalRows: number;
  previewRows: any[];
}

interface ImportProgress {
  current: number;
  total: number;
  success: number;
  errors: number;
  totalRowsKnown?: boolean;
}

const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
  visible,
  filePath,
  connectionId,
  dbName,
  tableName,
  onClose,
  onSuccess,
}) => {
  const i18n = useOptionalI18n();
  const t = i18n?.t ?? defaultTranslate;
  const connections = useStore((state) => state.connections);
  const [loading, setLoading] = useState(true);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<any>(null);

  useEffect(() => {
    if (visible && filePath) {
      loadPreview();
    }
  }, [visible, filePath]);

  useEffect(() => {
    if (importing) {
      const unsubscribe = EventsOn(
        "import:progress",
        (data: ImportProgress) => {
          setProgress((prev) => {
            const fallbackTotal = prev?.total || previewData?.totalRows || 0;
            const nextTotal =
              typeof data.total === "number" && data.total > 0
                ? data.total
                : fallbackTotal;
            return {
              current: data.current ?? prev?.current ?? 0,
              total: nextTotal,
              success: data.success ?? prev?.success ?? 0,
              errors: data.errors ?? prev?.errors ?? 0,
              totalRowsKnown: data.totalRowsKnown ?? nextTotal > 0,
            };
          });
        },
      );
      return () => {
        unsubscribe?.();
        EventsOff("import:progress");
      };
    }
  }, [importing, previewData?.totalRows]);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await PreviewImportFile(filePath);
      if (res.success && res.data) {
        setPreviewData({
          columns: res.data.columns || [],
          totalRows: res.data.totalRows || 0,
          previewRows: res.data.previewRows || [],
        });
      } else {
        setError(res.message || t("import_preview.error.preview_failed"));
      }
    } catch (e: any) {
      setError(
        t("import_preview.error.preview_failed_detail", {
          detail: String(e?.message || e),
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!previewData) return;

    setImporting(true);
    setProgress({
      current: 0,
      total: previewData.totalRows,
      success: 0,
      errors: 0,
    });
    setImportResult(null);

    try {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) {
        setError(t("import_preview.error.connection_config_not_found"));
        setImporting(false);
        return;
      }

      const config = {
        ...conn.config,
        port: Number(conn.config.port),
        password: conn.config.password || "",
        database: conn.config.database || "",
        useSSH: conn.config.useSSH || false,
        ssh: conn.config.ssh || {
          host: "",
          port: 22,
          user: "",
          password: "",
          keyPath: "",
        },
      };

      const res = await ImportDataWithProgress(
        buildRpcConnectionConfig(config) as any,
        dbName,
        tableName,
        filePath,
      );

      if (res.success && res.data) {
        setImportResult(res.data);
        if (res.data.failed === 0) {
          onSuccess();
        }
      } else {
        setError(res.message || t("import_preview.error.import_failed"));
      }
    } catch (e: any) {
      setError(
        t("import_preview.error.import_failed_detail", {
          detail: String(e?.message || e),
        }),
      );
    } finally {
      setImporting(false);
    }
  };

  const columns =
    previewData?.columns.map((col) => ({
      title: col,
      dataIndex: col,
      key: col,
      ellipsis: true,
      width: 150,
    })) || [];

  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <Modal
      title={t("import_preview.title")}
      open={visible}
      onCancel={onClose}
      width={900}
      footer={
        importResult ? (
          <Space>
            <Button onClick={onClose}>{t("common.close")}</Button>
          </Space>
        ) : importing ? null : (
          <Space>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button
              type="primary"
              onClick={handleImport}
              disabled={!previewData || loading}
            >
              {t("import_preview.action.start")}
            </Button>
          </Space>
        )
      }
    >
      {error && (
        <Alert
          type="error"
          message={error}
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: 40 }}>
          {t("import_preview.status.loading_preview")}
        </div>
      )}

      {!loading && previewData && !importing && !importResult && (
        <>
          <Alert
            type="info"
            message={t("import_preview.preview.summary", {
              rows: previewData.totalRows,
              columns: previewData.columns.length,
            })}
            description={t("import_preview.preview.description")}
            style={{ marginBottom: 16 }}
            showIcon
          />
          <div style={{ marginBottom: 8, fontWeight: 600 }}>
            {t("import_preview.preview.field_list")}
          </div>
          <div
            style={{
              marginBottom: 16,
              padding: 8,
              background: "#f5f5f5",
              borderRadius: 4,
            }}
          >
            {previewData.columns.join(", ")}
          </div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>
            {t("import_preview.preview.table_title")}
          </div>
          <Table
            dataSource={previewData.previewRows}
            columns={columns}
            pagination={false}
            scroll={{ x: "max-content" }}
            size="small"
            bordered
          />
        </>
      )}

      {importing && progress && (
        <div style={{ padding: "40px 20px" }}>
          <div
            style={{
              marginBottom: 16,
              fontSize: 16,
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {t("import_preview.status.importing")}
          </div>
          <Progress percent={progressPercent} status="active" />
          <div style={{ marginTop: 16, textAlign: "center", color: "#666" }}>
            {t("import_preview.progress.processed_rows", {
              current: progress.current,
              total: progress.total,
            })}
            <span style={{ marginLeft: 16, color: "#52c41a" }}>
              <CheckCircleOutlined />{" "}
              {t("import_preview.progress.success_count", {
                count: progress.success,
              })}
            </span>
            {progress.errors > 0 && (
              <span style={{ marginLeft: 16, color: "#ff4d4f" }}>
                <CloseCircleOutlined />{" "}
                {t("import_preview.progress.error_count", {
                  count: progress.errors,
                })}
              </span>
            )}
          </div>
        </div>
      )}

      {importResult && (
        <div style={{ padding: 20 }}>
          <Alert
            type={importResult.failed === 0 ? "success" : "warning"}
            message={t("import_preview.result.completed")}
            description={
              <div>
                <div>
                  {t("import_preview.result.success_rows", {
                    count: importResult.success,
                  })}
                </div>
                {importResult.failed > 0 && (
                  <div>
                    {t("import_preview.result.failed_rows", {
                      count: importResult.failed,
                    })}
                  </div>
                )}
              </div>
            }
            showIcon
            style={{ marginBottom: 16 }}
          />
          {importResult.errorLogs && importResult.errorLogs.length > 0 && (
            <>
              <div
                style={{ marginBottom: 8, fontWeight: 600, color: "#ff4d4f" }}
              >
                {t("import_preview.result.error_logs")}
              </div>
              <div
                style={{
                  maxHeight: 300,
                  overflow: "auto",
                  background: "#fff1f0",
                  border: "1px solid #ffccc7",
                  borderRadius: 4,
                  padding: 12,
                  fontSize: 12,
                  fontFamily: "var(--gn-font-mono)",
                }}
              >
                {importResult.errorLogs.map((log: string, idx: number) => (
                  <div key={idx} style={{ marginBottom: 4 }}>
                    {log}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ImportPreviewModal;
