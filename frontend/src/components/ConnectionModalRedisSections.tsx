import React from "react";
import { Form, Input, Select } from "antd";
import {
  ClusterOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";

import type { SavedConnection } from "../types";
import {
  getStoredSecretPlaceholder,
  type ConnectionConfigSectionKey,
} from "../utils/connectionModalPresentation";
import { noAutoCapInputProps } from "../utils/inputAutoCap";

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
  clearKey: "redisSentinelPassword";
  hasStoredSecret?: boolean;
  clearLabel: string;
  description: string;
}) => React.ReactNode;

interface ConnectionModalRedisSectionsProps {
  redisTopology: string;
  redisDbList: number[];
  initialValues?: SavedConnection | null;
  primaryPasswordVisible: boolean;
  setPrimaryPasswordVisible: (visible: boolean) => void;
  renderChoiceCards: RenderChoiceCards;
  renderConfigSectionCard: RenderConfigSectionCard;
  renderStoredSecretControls: RenderStoredSecretControls;
  createUriAwareRequiredRule: (
    messageText: string,
    validateValue?: (value: unknown) => boolean,
  ) => any;
}

const ConnectionModalRedisSections: React.FC<ConnectionModalRedisSectionsProps> = ({
  redisTopology,
  redisDbList,
  initialValues,
  primaryPasswordVisible,
  setPrimaryPasswordVisible,
  renderChoiceCards,
  renderConfigSectionCard,
  renderStoredSecretControls,
  createUriAwareRequiredRule,
}) => (
  <>
    {renderConfigSectionCard({
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
                label: "单机模式",
                description: "只连接一个 Redis 节点。",
              },
              {
                value: "cluster",
                label: "集群模式",
                description: "Redis Cluster，配置多个种子节点。",
              },
              {
                value: "sentinel",
                label: "哨兵模式",
                description: "通过 Sentinel 发现主节点，适合主从高可用。",
              },
            ],
          })}
          {(redisTopology === "cluster" || redisTopology === "sentinel") && (
            <>
              <Form.Item
                name="redisHosts"
                label={
                  redisTopology === "sentinel"
                    ? "Sentinel 附加节点地址"
                    : "集群附加节点地址"
                }
                help={
                  redisTopology === "sentinel"
                    ? "上方主机地址作为第一个 Sentinel；这里填写其他 Sentinel 节点，格式：host:port"
                    : "主节点使用上方主机地址；这里填写其他种子节点，格式：host:port"
                }
                style={{ marginTop: 16, marginBottom: 0 }}
              >
                <Select
                  mode="tags"
                  placeholder={
                    redisTopology === "sentinel"
                      ? "例如：10.10.0.12:26379、10.10.0.13:26379"
                      : "例如：10.10.0.12:6379、10.10.0.13:6379"
                  }
                  tokenSeparators={[",", ";", " "]}
                />
              </Form.Item>
              {redisTopology === "sentinel" && (
                <Form.Item
                  name="redisSentinelMaster"
                  label="Sentinel master 名称"
                  help="填写 Sentinel 配置中的 monitor 名称，例如 mymaster。"
                  rules={[
                    createUriAwareRequiredRule(
                      "请输入 Sentinel master 名称",
                    ),
                  ]}
                  style={{ marginTop: 16, marginBottom: 0 }}
                >
                  <Input
                    {...noAutoCapInputProps}
                    placeholder="例如：mymaster"
                  />
                </Form.Item>
              )}
            </>
          )}
        </>
      ),
    })}

    {renderConfigSectionCard({
      sectionKey: "credentials",
      icon: <SafetyCertificateOutlined />,
      children: (
        <>
          <Form.Item name="password" label="密码 (可选)">
            <Input.Password
              {...noAutoCapInputProps}
              visibilityToggle={{
                visible: primaryPasswordVisible,
                onVisibleChange: setPrimaryPasswordVisible,
              }}
              placeholder={getStoredSecretPlaceholder({
                hasStoredSecret: initialValues?.hasPrimaryPassword,
                emptyPlaceholder: "Redis 密码（如果设置了 requirepass）",
                retainedLabel: "已保存 Redis 密码",
              })}
            />
          </Form.Item>
          {redisTopology === "sentinel" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 16,
                }}
              >
                <Form.Item
                  name="redisSentinelUser"
                  label="Sentinel 用户名（可选）"
                  style={{ marginBottom: 0 }}
                >
                  <Input
                    {...noAutoCapInputProps}
                    placeholder="留空表示 Sentinel 不使用 ACL 用户名"
                  />
                </Form.Item>
                <Form.Item
                  name="redisSentinelPassword"
                  label="Sentinel 密码（可选）"
                  style={{ marginBottom: 0 }}
                >
                  <Input.Password
                    {...noAutoCapInputProps}
                    placeholder={getStoredSecretPlaceholder({
                      hasStoredSecret: initialValues?.hasRedisSentinelPassword,
                      emptyPlaceholder: "Sentinel 自身认证密码，留空则不发送",
                      retainedLabel: "已保存 Sentinel 密码",
                    })}
                  />
                </Form.Item>
              </div>
              {renderStoredSecretControls({
                fieldName: "redisSentinelPassword",
                clearKey: "redisSentinelPassword",
                hasStoredSecret: initialValues?.hasRedisSentinelPassword,
                clearLabel: "清除已保存 Sentinel 密码",
                description:
                  "当前已保存 Sentinel 密码。留空表示继续沿用，输入新值表示替换。",
              })}
            </>
          )}
        </>
      ),
    })}

    {renderConfigSectionCard({
      sectionKey: "databaseScope",
      icon: <DatabaseOutlined />,
      children: (
        <Form.Item
          name="includeRedisDatabases"
          label="显示数据库 (留空显示全部)"
          help="连接测试成功后可选择"
          style={{ marginBottom: 0 }}
        >
          <Select
            mode="multiple"
            placeholder="选择显示的数据库 (0-15)"
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
  </>
);

export default ConnectionModalRedisSections;
