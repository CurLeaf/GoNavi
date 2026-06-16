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
}) => (
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
            label: "单机模式",
            description: "只连接一个 MongoDB 节点。",
          },
          {
            value: "replica",
            label: "副本集 / 多节点",
            description: "配置副本集名称和多个候选节点。",
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
                label: "标准地址",
                description: "使用 host:port 直连或副本集节点列表。",
              },
              {
                value: true,
                label: "SRV 地址",
                description: "使用 mongodb+srv，由 DNS 发现目标节点。",
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
                    {active ? <Tag color="blue">当前</Tag> : null}
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
              message="SRV 与 SSH 隧道同时启用时，可能依赖本地 DNS 解析能力"
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
              label={mongoSrv ? "附加 SRV 主机（可选）" : "附加节点地址"}
              help={
                mongoSrv
                  ? "可输入多个候选主机名，格式：host；若留空则仅使用上方主机。"
                  : "可输入多个节点地址，格式：host:port（回车确认）"
              }
            >
              <Select
                mode="tags"
                placeholder={
                  mongoSrv
                    ? "例如：cluster-a.example.com、cluster-b.example.com"
                    : "例如：10.10.0.12:27017、10.10.0.13:27017"
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
                label="副本集名称（可选）"
                style={{ marginBottom: 0 }}
              >
                <Input {...noAutoCapInputProps} placeholder="例如：rs0" />
              </Form.Item>
              <Form.Item
                name="mongoReplicaUser"
                label="副本集用户名（可选）"
                style={{ marginBottom: 0 }}
              >
                <Input {...noAutoCapInputProps} placeholder="留空沿用主用户名" />
              </Form.Item>
            </div>
            <Form.Item
              name="mongoReplicaPassword"
              label="副本集密码（可选）"
              style={{ marginTop: 16, marginBottom: 0 }}
            >
              <Input.Password
                {...noAutoCapInputProps}
                placeholder={getStoredSecretPlaceholder({
                  hasStoredSecret: initialValues?.hasMongoReplicaPassword,
                  emptyPlaceholder: "留空沿用主密码",
                  retainedLabel: "已保存副本集密码",
                })}
              />
            </Form.Item>
            {renderStoredSecretControls({
              fieldName: "mongoReplicaPassword",
              clearKey: "mongoReplicaPassword",
              hasStoredSecret: initialValues?.hasMongoReplicaPassword,
              clearLabel: "清除已保存副本集密码",
              description:
                "当前已保存副本集密码。留空表示继续沿用，输入新值表示替换。",
            })}
            <Space size={8} style={{ marginTop: 12, marginBottom: 12 }}>
              <Button
                onClick={handleDiscoverMongoMembers}
                loading={discoveringMembers}
              >
                自动发现成员
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
                    title: "角色",
                    dataIndex: "role",
                    width: "32%",
                    render: (value: string, record: MongoMemberInfo) => (
                      <Tag color={record.isSelf ? "blue" : "default"}>
                        {value || "UNKNOWN"}
                      </Tag>
                    ),
                  },
                  {
                    title: "健康",
                    dataIndex: "healthy",
                    width: "20%",
                    render: (value: boolean) => (
                      <Tag color={value ? "success" : "error"}>
                        {value ? "正常" : "异常"}
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
            label="认证库 (authSource)"
            style={{ marginBottom: 0 }}
          >
            <Input {...noAutoCapInputProps} placeholder="默认使用 database 或 admin" />
          </Form.Item>
          <div style={{ display: "grid", gap: 8 }}>
            <Text strong>读偏好 (readPreference)</Text>
            {renderChoiceCards({
              fieldName: "mongoReadPreference",
              value: String(mongoReadPreference),
              minWidth: 130,
              options: [
                {
                  value: "primary",
                  label: "primary",
                  description: "只读主节点。",
                },
                {
                  value: "primaryPreferred",
                  label: "primaryPreferred",
                  description: "主节点优先。",
                },
                {
                  value: "secondary",
                  label: "secondary",
                  description: "只读从节点。",
                },
                {
                  value: "secondaryPreferred",
                  label: "secondaryPreferred",
                  description: "从节点优先。",
                },
                {
                  value: "nearest",
                  label: "nearest",
                  description: "选择最近节点。",
                },
              ],
            })}
          </div>
        </div>
      ),
    })}
  </>
);

export default ConnectionModalMongoSections;
