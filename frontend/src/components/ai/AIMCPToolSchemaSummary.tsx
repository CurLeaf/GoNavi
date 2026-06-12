import React from 'react';

import type { AIMCPToolDescriptor } from '../../types';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import { buildMCPHintStyle } from './AIMCPHelpBlock';

const MAX_PARAMETER_PREVIEW = 6;

type JSONSchemaRecord = Record<string, any>;

const isRecord = (value: unknown): value is JSONSchemaRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readSchemaType = (schema: JSONSchemaRecord): string => {
  if (Array.isArray(schema.type)) {
    return schema.type.map((item) => String(item)).filter(Boolean).join('|') || 'unknown';
  }
  if (typeof schema.type === 'string' && schema.type.trim()) {
    return schema.type.trim();
  }
  if (Array.isArray(schema.enum)) {
    return 'enum';
  }
  if (isRecord(schema.properties)) {
    return 'object';
  }
  if (isRecord(schema.items)) {
    return 'array';
  }
  return 'unknown';
};

const readRequiredSet = (schema: JSONSchemaRecord): Set<string> => new Set(
  Array.isArray(schema.required)
    ? schema.required.map((item) => String(item)).filter(Boolean)
    : [],
);

const readExampleValue = (name: string, schema: JSONSchemaRecord): unknown => {
  if (Object.prototype.hasOwnProperty.call(schema, 'default')) {
    const value = schema.default;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      return value;
    }
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const value = schema.enum[0];
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      return value;
    }
  }

  const type = readSchemaType(schema);
  if (type.includes('boolean')) return false;
  if (type.includes('number') || type.includes('integer')) return 0;
  if (type.includes('array')) return [];
  if (type.includes('object')) return {};
  return `<${name}>`;
};

export const buildMCPToolMinimalArgumentsExample = (tool: AIMCPToolDescriptor): string => {
  const inputSchema = isRecord(tool.inputSchema) ? tool.inputSchema : {};
  const properties = isRecord(inputSchema.properties) ? inputSchema.properties : {};
  const requiredSet = readRequiredSet(inputSchema);
  const example = Object.entries(properties).reduce<Record<string, unknown>>((acc, [name, rawSchema]) => {
    if (!requiredSet.has(name)) {
      return acc;
    }
    acc[name] = readExampleValue(name, isRecord(rawSchema) ? rawSchema : {});
    return acc;
  }, {});
  return JSON.stringify(example);
};

const summarizeToolParameters = (tool: AIMCPToolDescriptor) => {
  const inputSchema = isRecord(tool.inputSchema) ? tool.inputSchema : {};
  const properties = isRecord(inputSchema.properties) ? inputSchema.properties : {};
  const requiredSet = readRequiredSet(inputSchema);
  const parameters = Object.entries(properties).map(([name, rawSchema]) => {
    const schema = isRecord(rawSchema) ? rawSchema : {};
    return {
      name,
      required: requiredSet.has(name),
      type: readSchemaType(schema),
      description: String(schema.description || schema.title || '').trim(),
    };
  });

  return {
    hasInputSchema: Object.keys(inputSchema).length > 0,
    parameters,
    requiredCount: parameters.filter((item) => item.required).length,
    minimalArgumentsExample: buildMCPToolMinimalArgumentsExample(tool),
    truncated: parameters.length > MAX_PARAMETER_PREVIEW,
  };
};

interface AIMCPToolSchemaSummaryProps {
  tools: AIMCPToolDescriptor[];
  cardBorder: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
}

const AIMCPToolSchemaSummary: React.FC<AIMCPToolSchemaSummaryProps> = ({
  tools,
  cardBorder,
  darkMode,
  overlayTheme,
}) => {
  if (tools.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: overlayTheme.titleText }}>已发现工具和参数提示</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
        {tools.map((tool) => {
          const summary = summarizeToolParameters(tool);
          const previewParameters = summary.parameters.slice(0, MAX_PARAMETER_PREVIEW);
          return (
            <div
              key={tool.alias}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${cardBorder}`,
                background: darkMode ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.78)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: overlayTheme.titleText, overflowWrap: 'anywhere' }}>
                {tool.alias}
              </div>
              {tool.description ? (
                <div style={buildMCPHintStyle(overlayTheme.mutedText)}>{tool.description}</div>
              ) : null}
              <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
                {summary.hasInputSchema
                  ? `参数 ${summary.parameters.length} 个，必填 ${summary.requiredCount} 个；星号表示必填。`
                  : '未声明 inputSchema，调用参数需参考服务文档或用 /mcptool 继续查看。'}
              </div>
              {summary.hasInputSchema ? (
                <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
                  最小 arguments 示例：
                  {' '}
                  <code style={{ fontFamily: 'var(--gn-font-mono)', overflowWrap: 'anywhere' }}>
                    {summary.minimalArgumentsExample}
                  </code>
                </div>
              ) : null}
              {previewParameters.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {previewParameters.map((parameter) => (
                    <span
                      key={parameter.name}
                      title={parameter.description || undefined}
                      style={{
                        padding: '3px 7px',
                        borderRadius: 999,
                        background: parameter.required
                          ? (darkMode ? 'rgba(59,130,246,0.18)' : 'rgba(37,99,235,0.10)')
                          : (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)'),
                        color: parameter.required ? '#2563eb' : overlayTheme.mutedText,
                        fontSize: 12,
                        fontFamily: 'var(--gn-font-mono)',
                      }}
                    >
                      {parameter.name}
                      {parameter.required ? '*' : ''}: {parameter.type}
                    </span>
                  ))}
                  {summary.truncated ? (
                    <span style={{ ...buildMCPHintStyle(overlayTheme.mutedText), padding: '3px 0' }}>
                      还有 {summary.parameters.length - MAX_PARAMETER_PREVIEW} 个参数，使用 /mcptool 查看完整 schema
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AIMCPToolSchemaSummary;
