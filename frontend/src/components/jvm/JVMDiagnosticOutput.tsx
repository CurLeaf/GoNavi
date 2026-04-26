import React from "react";
import { Empty, List, Tag, Typography } from "antd";

import type { JVMDiagnosticEventChunk } from "../../types";
import {
  formatJVMDiagnosticChunkText,
  formatJVMDiagnosticEventLabel,
  formatJVMDiagnosticPhaseLabel,
} from "../../utils/jvmDiagnosticPresentation";

const { Text } = Typography;

type JVMDiagnosticOutputProps = {
  chunks: JVMDiagnosticEventChunk[];
};

const JVMDiagnosticOutput: React.FC<JVMDiagnosticOutputProps> = ({ chunks }) => {
  if (!chunks.length) {
    return <Empty description="尚无诊断输出" />;
  }

  return (
    <div style={{ maxHeight: 420, overflow: "auto", paddingRight: 4 }}>
      <List
        size="small"
        dataSource={chunks}
        renderItem={(chunk, index) => (
          <List.Item
            key={`${chunk.sessionId}-${chunk.commandId || "chunk"}-${index}`}
          >
            <div style={{ display: "grid", gap: 4, width: "100%" }}>
              <Text
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                {formatJVMDiagnosticChunkText(chunk)}
              </Text>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {chunk.phase ? (
                  <Tag color="geekblue">{formatJVMDiagnosticPhaseLabel(chunk.phase)}</Tag>
                ) : null}
                {chunk.event ? <Tag>{formatJVMDiagnosticEventLabel(chunk.event)}</Tag> : null}
                {chunk.commandId ? <Tag color="blue">{chunk.commandId}</Tag> : null}
              </div>
            </div>
          </List.Item>
        )}
      />
    </div>
  );
};

export default JVMDiagnosticOutput;
