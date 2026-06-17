import React, { useMemo } from "react";
import { Alert, Descriptions, Modal, Space, Tag, Typography } from "antd";

import type { JVMChangePreview } from "../../types";
import { t as translate } from "../../i18n";
import { useOptionalI18n } from "../../i18n/provider";
import {
  formatJVMRiskLevelText,
  formatJVMValueForDisplay,
} from "../../utils/jvmResourcePresentation";

const { Text } = Typography;
const DESCRIPTION_STYLES = { label: { width: 120 } } as const;

type JVMChangePreviewModalProps = {
  open: boolean;
  preview: JVMChangePreview | null;
  applying?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const riskColorMap: Record<string, string> = {
  low: "green",
  medium: "orange",
  high: "red",
};

const previewBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 8,
  background: "rgba(0, 0, 0, 0.04)",
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 280,
};

const JVMChangePreviewModal: React.FC<JVMChangePreviewModalProps> = ({
  open,
  preview,
  applying = false,
  onCancel,
  onConfirm,
}) => {
  const i18n = useOptionalI18n();
  const i18nLanguage = i18n?.language;
  const tr = (key: string, params?: Parameters<typeof translate>[1]) =>
    translate(key, params, i18nLanguage);

  const summary = useMemo(() => {
    if (!preview) {
      return tr("jvm_change_preview_modal.status.no_preview");
    }
    return preview.summary || tr("jvm_change_preview_modal.status.generated");
  }, [i18nLanguage, preview]);
  const riskLevelText = formatJVMRiskLevelText(
    preview?.riskLevel,
    i18nLanguage,
  );

  return (
    <Modal
      title={tr("jvm_change_preview_modal.title")}
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      okText={tr("jvm_change_preview_modal.action.confirm_execute")}
      cancelText={tr("jvm_change_preview_modal.action.close")}
      okButtonProps={{ disabled: !preview?.allowed, loading: applying }}
      width={880}
      destroyOnHidden
    >
      {!preview ? (
        <Alert
          type="info"
          showIcon
          message={tr("jvm_change_preview_modal.status.no_preview")}
        />
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions column={1} size="small" styles={DESCRIPTION_STYLES}>
            <Descriptions.Item
              label={tr("jvm_change_preview_modal.section.summary")}
            >
              <Space size={8} wrap>
                <Text>{summary}</Text>
                <Tag color={riskColorMap[preview.riskLevel] || "default"}>
                  {tr("jvm_change_preview_modal.risk.label", {
                    level: riskLevelText,
                  })}
                </Tag>
                {preview.requiresConfirmation ? (
                  <Tag color="gold">
                    {tr(
                      "jvm_change_preview_modal.permission.requires_confirmation",
                    )}
                  </Tag>
                ) : null}
                {preview.allowed ? (
                  <Tag color="green">
                    {tr("jvm_change_preview_modal.permission.allowed")}
                  </Tag>
                ) : (
                  <Tag color="red">
                    {tr("jvm_change_preview_modal.permission.forbidden")}
                  </Tag>
                )}
              </Space>
            </Descriptions.Item>
            {preview.blockingReason ? (
              <Descriptions.Item
                label={tr("jvm_change_preview_modal.blocking.label")}
              >
                <Text type="danger" style={{ whiteSpace: "pre-wrap" }}>
                  {preview.blockingReason}
                </Text>
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          {!preview.allowed && preview.blockingReason ? (
            <Alert
              type="error"
              showIcon
              message={tr("jvm_change_preview_modal.blocking.alert_message")}
              description={
                <span style={{ whiteSpace: "pre-wrap" }}>
                  {preview.blockingReason}
                </span>
              }
            />
          ) : (
            <Alert type="info" showIcon message={summary} />
          )}

          <div>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {tr("jvm_change_preview_modal.section.before")}
            </Text>
            <Descriptions
              column={1}
              size="small"
              styles={DESCRIPTION_STYLES}
              style={{ marginBottom: 12 }}
            >
              <Descriptions.Item
                label={tr("jvm_change_preview_modal.field.resource_id")}
              >
                {preview.before?.resourceId || "-"}
              </Descriptions.Item>
              <Descriptions.Item
                label={tr("jvm_change_preview_modal.field.version")}
              >
                {preview.before?.version || "-"}
              </Descriptions.Item>
              <Descriptions.Item
                label={tr("jvm_change_preview_modal.field.format")}
              >
                {preview.before?.format || "-"}
              </Descriptions.Item>
            </Descriptions>
            <pre style={previewBlockStyle}>
              {formatJVMValueForDisplay(preview.before)}
            </pre>
          </div>

          <div>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {tr("jvm_change_preview_modal.section.after")}
            </Text>
            <Descriptions
              column={1}
              size="small"
              styles={DESCRIPTION_STYLES}
              style={{ marginBottom: 12 }}
            >
              <Descriptions.Item
                label={tr("jvm_change_preview_modal.field.resource_id")}
              >
                {preview.after?.resourceId || "-"}
              </Descriptions.Item>
              <Descriptions.Item
                label={tr("jvm_change_preview_modal.field.version")}
              >
                {preview.after?.version || "-"}
              </Descriptions.Item>
              <Descriptions.Item
                label={tr("jvm_change_preview_modal.field.format")}
              >
                {preview.after?.format || "-"}
              </Descriptions.Item>
            </Descriptions>
            <pre style={previewBlockStyle}>
              {formatJVMValueForDisplay(preview.after)}
            </pre>
          </div>
        </Space>
      )}
    </Modal>
  );
};

export default JVMChangePreviewModal;
