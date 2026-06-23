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
import { useI18n } from "../i18n/provider";
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
}) => {
  const { t } = useI18n();

  return (
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
                  label: t("connection.modal.redis.topology.single.label"),
                  description: t("connection.modal.redis.topology.single.description"),
                },
                {
                  value: "cluster",
                  label: t("connection.modal.redis.topology.cluster.label"),
                  description: t("connection.modal.redis.topology.cluster.description"),
                },
                {
                  value: "sentinel",
                  label: t("connection.modal.redis.topology.sentinel.label"),
                  description: t("connection.modal.redis.topology.sentinel.description"),
                },
              ],
            })}
            {(redisTopology === "cluster" || redisTopology === "sentinel") && (
              <>
                <Form.Item
                  name="redisHosts"
                  label={t(
                    redisTopology === "sentinel"
                      ? "connection.modal.redis.hosts.sentinel.label"
                      : "connection.modal.redis.hosts.cluster.label",
                  )}
                  help={t(
                    redisTopology === "sentinel"
                      ? "connection.modal.redis.hosts.sentinel.help"
                      : "connection.modal.redis.hosts.cluster.help",
                  )}
                  style={{ marginTop: 16, marginBottom: 0 }}
                >
                  <Select
                    mode="tags"
                    placeholder={t(
                      redisTopology === "sentinel"
                        ? "connection.modal.redis.hosts.sentinel.placeholder"
                        : "connection.modal.redis.hosts.cluster.placeholder",
                    )}
                    tokenSeparators={[",", ";", " "]}
                  />
                </Form.Item>
                {redisTopology === "sentinel" && (
                  <Form.Item
                    name="redisSentinelMaster"
                    label={t("connection.modal.redis.sentinel.master.label")}
                    help={t("connection.modal.redis.sentinel.master.help")}
                    rules={[
                      createUriAwareRequiredRule(
                        t("connection.modal.redis.sentinel.master.required"),
                      ),
                    ]}
                    style={{ marginTop: 16, marginBottom: 0 }}
                  >
                    <Input
                      {...noAutoCapInputProps}
                      placeholder={t("connection.modal.redis.sentinel.master.placeholder")}
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
            <Form.Item name="password" label={t("connection.modal.redis.credentials.primary.label")}>
              <Input.Password
                {...noAutoCapInputProps}
                visibilityToggle={{
                  visible: primaryPasswordVisible,
                  onVisibleChange: setPrimaryPasswordVisible,
                }}
                placeholder={getStoredSecretPlaceholder({
                  hasStoredSecret: initialValues?.hasPrimaryPassword,
                  emptyPlaceholder: t("connection.modal.redis.credentials.primary.placeholder.empty"),
                  retainedLabel: t("connection.modal.redis.credentials.primary.placeholder.retained"),
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
                    label={t("connection.modal.redis.credentials.sentinelUser.label")}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      {...noAutoCapInputProps}
                      placeholder={t("connection.modal.redis.credentials.sentinelUser.placeholder")}
                    />
                  </Form.Item>
                  <Form.Item
                    name="redisSentinelPassword"
                    label={t("connection.modal.redis.credentials.sentinelPassword.label")}
                    style={{ marginBottom: 0 }}
                  >
                    <Input.Password
                      {...noAutoCapInputProps}
                      placeholder={getStoredSecretPlaceholder({
                        hasStoredSecret: initialValues?.hasRedisSentinelPassword,
                        emptyPlaceholder: t(
                          "connection.modal.redis.credentials.sentinelPassword.placeholder.empty",
                        ),
                        retainedLabel: t(
                          "connection.modal.redis.credentials.sentinelPassword.placeholder.retained",
                        ),
                      })}
                    />
                  </Form.Item>
                </div>
                {renderStoredSecretControls({
                  fieldName: "redisSentinelPassword",
                  clearKey: "redisSentinelPassword",
                  hasStoredSecret: initialValues?.hasRedisSentinelPassword,
                  clearLabel: t("connection.modal.redis.credentials.sentinelPassword.clear"),
                  description: t(
                    "connection.modal.redis.credentials.sentinelPassword.description",
                  ),
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
            label={t("connection.modal.redis.databaseScope.label")}
            help={t("connection.modal.redis.databaseScope.help")}
            style={{ marginBottom: 0 }}
          >
            <Select
              mode="multiple"
              placeholder={t("connection.modal.redis.databaseScope.placeholder")}
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
};

export default ConnectionModalRedisSections;
