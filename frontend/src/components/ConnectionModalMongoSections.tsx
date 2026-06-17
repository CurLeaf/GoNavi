import React from "react";
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  ApiOutlined,
  ClusterOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

import type { MongoMemberInfo, SavedConnection } from "../types";
import {
  getStoredSecretPlaceholder,
  type ConnectionConfigSectionKey,
} from "../utils/connectionModalPresentation";
import { useI18n } from "../i18n/provider";
import { noAutoCapInputProps } from "../utils/inputAutoCap";

const { Text } = Typography;

type ChoiceCardOption = {
  value: string;
  label: string;
  description?: string;
};

type RenderChoiceCards = (params: {
  fieldName: string;
  value: string;
  options: ChoiceCardOption[];
  minWidth?: number;
  onSelect?: (value: string) => void;
}) => React.ReactNode;

type RenderConfigSectionCard = (params: {
  sectionKey: ConnectionConfigSectionKey;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) => React.ReactNode;

type RenderStoredSecretControls = (params: {
  fieldName: string;
  clearKey: "mongoReplicaPassword";
  hasStoredSecret?: boolean;
  clearLabel: string;
  description: string;
}) => React.ReactNode;

interface ConnectionModalMongoSectionsProps {
  mongoTopology: string;
  mongoSrv: boolean;
  useSSH: boolean;
  darkMode: boolean;
  modalMutedTextStyle: React.CSSProperties;
  mongoReadPreference: string;
  mongoMembers: MongoMemberInfo[];
  discoveringMembers: boolean;
  initialValues?: SavedConnection | null;
  renderChoiceCards: RenderChoiceCards;
  renderConfigSectionCard: RenderConfigSectionCard;
  renderStoredSecretControls: RenderStoredSecretControls;
  setChoiceFieldValue: (fieldName: string, value: string | boolean) => void;
  handleDiscoverMongoMembers: () => void;
}

const ConnectionModalMongoSections: React.FC<ConnectionModalMongoSectionsProps> = ({
  mongoTopology,
  mongoSrv,
  useSSH,
  darkMode,
  modalMutedTextStyle,
  mongoReadPreference,
  mongoMembers,
  discoveringMembers,
  initialValues,
  renderChoiceCards,
  renderConfigSectionCard,
  renderStoredSecretControls,
  setChoiceFieldValue,
  handleDiscoverMongoMembers,
}) => {
  const { t } = useI18n();

  return (
    <>
      {renderConfigSectionCard({
        sectionKey: "connectionMode",
        icon: <ClusterOutlined />,
        children: renderChoiceCards({
          fieldName: "mongoTopology",
          value: String(mongoTopology),
          options: [
            {
              value: "single",
              label: t("connection.modal.mongodb.topology.single.label"),
              description: t("connection.modal.topology.mongodb_single_description"),
            },
            {
              value: "replica",
              label: t("connection.modal.mongodb.topology.replica.label"),
              description: t("connection.modal.topology.mongodb_replica_description"),
            },
          ],
        }),
      })}

      {renderConfigSectionCard({
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
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              {[
                {
                  value: false,
                  label: t("connection.modal.mongodb.discovery.standard.label"),
                  description: t("connection.modal.mongodb.discovery.standard.description"),
                },
                {
                  value: true,
                  label: t("connection.modal.mongodb.discovery.srv.label"),
                  description: t("connection.modal.mongodb.discovery.srv.description"),
                },
              ].map((option) => {
                const active = mongoSrv === option.value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setChoiceFieldValue("mongoSrv", option.value)}
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
                          {t("connection.modal.mongodb.discovery.current")}
                        </Tag>
                      ) : null}
                    </Space>
                    <div style={{ ...modalMutedTextStyle, marginTop: 6 }}>
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
                message={t("connection.modal.mongodb.discovery.srv_ssh_warning")}
              />
            )}
          </>
        ),
      })}

      {mongoTopology === "replica" &&
        renderConfigSectionCard({
          sectionKey: "replica",
          icon: <ClusterOutlined />,
          children: (
            <>
              <Form.Item
                name="mongoHosts"
                label={t(
                  mongoSrv
                    ? "connection.modal.mongodb.replica.hosts.srv.label"
                    : "connection.modal.mongodb.replica.hosts.standard.label",
                )}
                help={t(
                  mongoSrv
                    ? "connection.modal.mongodb.replica.hosts.srv.help"
                    : "connection.modal.mongodb.replica.hosts.standard.help",
                )}
              >
                <Select
                  mode="tags"
                  placeholder={t(
                    mongoSrv
                      ? "connection.modal.mongodb.replica.hosts.srv.placeholder"
                      : "connection.modal.mongodb.replica.hosts.standard.placeholder",
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
                  name="mongoReplicaSet"
                  label={t("connection.modal.mongodb.replica.set.label")}
                  style={{ marginBottom: 0 }}
                >
                  <Input
                    {...noAutoCapInputProps}
                    placeholder={t("connection.modal.mongodb.replica.set.placeholder")}
                  />
                </Form.Item>
                <Form.Item
                  name="mongoReplicaUser"
                  label={t("connection.modal.mongodb.replica.user.label")}
                  style={{ marginBottom: 0 }}
                >
                  <Input
                    {...noAutoCapInputProps}
                    placeholder={t("connection.modal.mongodb.replica.user.placeholder")}
                  />
                </Form.Item>
              </div>
              <Form.Item
                name="mongoReplicaPassword"
                label={t("connection.modal.mongodb.replica.password.label")}
                style={{ marginTop: 16, marginBottom: 0 }}
              >
                <Input.Password
                  {...noAutoCapInputProps}
                  placeholder={getStoredSecretPlaceholder({
                    hasStoredSecret: initialValues?.hasMongoReplicaPassword,
                    emptyPlaceholder: t(
                      "connection.modal.mongodb.replica.password.placeholder.empty",
                    ),
                    retainedLabel: t(
                      "connection.modal.mongodb.replica.password.placeholder.retained",
                    ),
                  })}
                />
              </Form.Item>
              {renderStoredSecretControls({
                fieldName: "mongoReplicaPassword",
                clearKey: "mongoReplicaPassword",
                hasStoredSecret: initialValues?.hasMongoReplicaPassword,
                clearLabel: t("connection.modal.mongodb.replica.password.clear"),
                description: t("connection.modal.mongodb.replica.password.description"),
              })}
              <Space size={8} style={{ marginTop: 12, marginBottom: 12 }}>
                <Button
                  onClick={handleDiscoverMongoMembers}
                  loading={discoveringMembers}
                >
                  {t("connection.modal.action.discover_members")}
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
                    { title: "Host", dataIndex: "host", width: "48%" },
                    {
                      title: t("connection.modal.mongodb.members.role"),
                      dataIndex: "role",
                      width: "32%",
                      render: (value: string, record: MongoMemberInfo) => (
                        <Tag color={record.isSelf ? "blue" : "default"}>
                          {value || "UNKNOWN"}
                        </Tag>
                      ),
                    },
                    {
                      title: t("connection.modal.mongodb.members.health"),
                      dataIndex: "healthy",
                      width: "20%",
                      render: (value: boolean) => (
                        <Tag color={value ? "success" : "error"}>
                          {t(
                            value
                              ? "connection.modal.mongodb.members.health.ok"
                              : "connection.modal.mongodb.members.health.error",
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

      {renderConfigSectionCard({
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
              label={t("connection.modal.mongodb.policy.auth_source.label")}
              style={{ marginBottom: 0 }}
            >
              <Input
                {...noAutoCapInputProps}
                placeholder={t("connection.modal.mongodb.policy.auth_source.placeholder")}
              />
            </Form.Item>
            <div style={{ display: "grid", gap: 8 }}>
              <Text strong>{t("connection.modal.mongodb.read_preference")}</Text>
              {renderChoiceCards({
                fieldName: "mongoReadPreference",
                value: String(mongoReadPreference),
                minWidth: 130,
                options: [
                  {
                    value: "primary",
                    label: "primary",
                    description: t("connection.modal.mongodb.read_preference.primary"),
                  },
                  {
                    value: "primaryPreferred",
                    label: "primaryPreferred",
                    description: t(
                      "connection.modal.mongodb.read_preference.primary_preferred",
                    ),
                  },
                  {
                    value: "secondary",
                    label: "secondary",
                    description: t("connection.modal.mongodb.read_preference.secondary"),
                  },
                  {
                    value: "secondaryPreferred",
                    label: "secondaryPreferred",
                    description: t(
                      "connection.modal.mongodb.read_preference.secondary_preferred",
                    ),
                  },
                  {
                    value: "nearest",
                    label: "nearest",
                    description: t("connection.modal.mongodb.read_preference.nearest"),
                  },
                ],
              })}
            </div>
          </div>
        ),
      })}
    </>
  );
};

export default ConnectionModalMongoSections;
