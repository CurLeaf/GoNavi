import React from "react";
import { Button, Card, Space, Tag, Typography } from "antd";

import {
  groupJVMDiagnosticPresets,
  resolveJVMDiagnosticRiskColor,
  type JVMDiagnosticCommandPreset,
} from "../../utils/jvmDiagnosticPresentation";

const { Text } = Typography;

type JVMCommandPresetBarProps = {
  onSelectPreset: (preset: JVMDiagnosticCommandPreset) => void;
};

const JVMCommandPresetBar: React.FC<JVMCommandPresetBarProps> = ({
  onSelectPreset,
}) => (
  <div style={{ display: "grid", gap: 12 }}>
    {groupJVMDiagnosticPresets().map((group) => (
      <Card
        key={group.category}
        size="small"
        title={group.label}
        styles={{ body: { display: "grid", gap: 8 } }}
      >
        {group.items.map((preset) => (
          <Space
            key={preset.key}
            align="start"
            style={{ width: "100%", justifyContent: "space-between" }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <Space size={8} wrap>
                <Button size="small" onClick={() => onSelectPreset(preset)}>
                  {preset.label}
                </Button>
                <Tag color={resolveJVMDiagnosticRiskColor(preset.riskLevel)}>
                  {preset.riskLevel.toUpperCase()}
                </Tag>
              </Space>
              <Text type="secondary">{preset.description}</Text>
              <Text code>{preset.command}</Text>
            </div>
          </Space>
        ))}
      </Card>
    ))}
  </div>
);

export default JVMCommandPresetBar;
