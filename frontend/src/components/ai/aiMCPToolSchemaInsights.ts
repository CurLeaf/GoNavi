import type { AIMCPToolDescriptor } from '../../types';
import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

const DEFAULT_TOOL_LIMIT = 8;
const MAX_TOOL_LIMIT = 30;
const MAX_PARAMETER_HINTS = 40;
const MAX_ENUM_VALUES = 12;
const MAX_SCHEMA_DEPTH = 2;

const translateMCPToolSchemaCopy = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
  params?: Parameters<AIInspectionTranslator>[1],
): string => translateInspectionCopy(translate, key, fallback, params);

interface JSONSchemaRecord {
  [key: string]: any;
}

const isRecord = (value: unknown): value is JSONSchemaRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeSearchText = (value: unknown): string =>
  String(value || '').trim().toLowerCase();

const readSchemaType = (schema: JSONSchemaRecord): string => {
  const rawType = schema.type;
  if (Array.isArray(rawType)) {
    return rawType.map((item) => String(item)).filter(Boolean).join('|') || 'unknown';
  }
  if (typeof rawType === 'string' && rawType.trim()) {
    return rawType.trim();
  }
  if (Array.isArray(schema.enum)) {
    return 'enum';
  }
  if (Array.isArray(schema.anyOf)) {
    return 'anyOf';
  }
  if (Array.isArray(schema.oneOf)) {
    return 'oneOf';
  }
  if (isRecord(schema.properties)) {
    return 'object';
  }
  if (isRecord(schema.items)) {
    return 'array';
  }
  return 'unknown';
};

const readRequiredSet = (schema: JSONSchemaRecord): Set<string> =>
  new Set(
    Array.isArray(schema.required)
      ? schema.required.map((item) => String(item)).filter(Boolean)
      : [],
  );

const readDescription = (schema: JSONSchemaRecord): string => {
  const description = String(schema.description || '').trim();
  if (description) {
    return description;
  }
  return String(schema.title || '').trim();
};

const readEnumValues = (schema: JSONSchemaRecord): string[] =>
  Array.isArray(schema.enum)
    ? schema.enum.slice(0, MAX_ENUM_VALUES).map((item) => String(item))
    : [];

const readDefaultValue = (schema: JSONSchemaRecord): string => {
  if (!Object.prototype.hasOwnProperty.call(schema, 'default')) {
    return '';
  }
  const value = schema.default;
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export interface MCPToolSchemaParameterHint {
  path: string;
  name: string;
  required: boolean;
  type: string;
  description: string;
  enumValues: string[];
  enumValuesTruncated: boolean;
  defaultValue: string;
  nestedPropertyCount: number;
  arrayItemType: string;
}

const buildParameterHints = (
  schema: JSONSchemaRecord,
  pathPrefix = '',
  depth = 0,
): MCPToolSchemaParameterHint[] => {
  if (!isRecord(schema.properties)) {
    return [];
  }

  const requiredSet = readRequiredSet(schema);
  const hints: MCPToolSchemaParameterHint[] = [];
  Object.entries(schema.properties).forEach(([name, rawChildSchema]) => {
    if (hints.length >= MAX_PARAMETER_HINTS) {
      return;
    }
    const childSchema = isRecord(rawChildSchema) ? rawChildSchema : {};
    const path = pathPrefix ? `${pathPrefix}.${name}` : name;
    const childProperties = isRecord(childSchema.properties) ? childSchema.properties : {};
    const itemSchema = isRecord(childSchema.items) ? childSchema.items : {};
    const enumValues = readEnumValues(childSchema);
    hints.push({
      path,
      name,
      required: requiredSet.has(name),
      type: readSchemaType(childSchema),
      description: readDescription(childSchema),
      enumValues,
      enumValuesTruncated: Array.isArray(childSchema.enum) && childSchema.enum.length > MAX_ENUM_VALUES,
      defaultValue: readDefaultValue(childSchema),
      nestedPropertyCount: Object.keys(childProperties).length,
      arrayItemType: isRecord(childSchema.items) ? readSchemaType(itemSchema) : '',
    });

    if (depth >= MAX_SCHEMA_DEPTH || hints.length >= MAX_PARAMETER_HINTS) {
      return;
    }
    if (Object.keys(childProperties).length > 0) {
      hints.push(...buildParameterHints(childSchema, path, depth + 1).slice(0, MAX_PARAMETER_HINTS - hints.length));
      return;
    }
    if (isRecord(itemSchema.properties)) {
      hints.push(...buildParameterHints(itemSchema, `${path}[]`, depth + 1).slice(0, MAX_PARAMETER_HINTS - hints.length));
    }
  });
  return hints.slice(0, MAX_PARAMETER_HINTS);
};

const matchesKeyword = (tool: AIMCPToolDescriptor, keyword: string): boolean => {
  if (!keyword) {
    return true;
  }
  return [
    tool.alias,
    tool.originalName,
    tool.title,
    tool.description,
    tool.serverId,
    tool.serverName,
  ].some((item) => normalizeSearchText(item).includes(keyword));
};

const buildUsageHints = (params: {
  tool: AIMCPToolDescriptor;
  hasInputSchema: boolean;
  parameterHints: MCPToolSchemaParameterHint[];
  translate?: AIInspectionTranslator;
}) => {
  const { tool, hasInputSchema, parameterHints, translate } = params;
  const hints: string[] = [];
  const requiredTopLevel = parameterHints
    .filter((item) => item.required && !item.path.includes('.'))
    .map((item) => item.path);
  const enumHint = parameterHints.find((item) => item.enumValues.length > 0);
  const nestedHint = parameterHints.find((item) => item.nestedPropertyCount > 0 || item.path.includes('.'));

  if (!hasInputSchema) {
    hints.push(translateMCPToolSchemaCopy(
      translate,
      'ai_chat.inspection.mcp_tool_schema.usage.no_input_schema',
      'This MCP tool does not declare inputSchema; check the service README first or probe with an empty object.',
    ));
  }
  if (requiredTopLevel.length > 0) {
    hints.push(translateMCPToolSchemaCopy(
      translate,
      'ai_chat.inspection.mcp_tool_schema.usage.required_params',
      'Before calling {{alias}}, provide: {{parameters}}',
      { alias: tool.alias, parameters: requiredTopLevel.join(', ') },
    ));
  }
  if (enumHint) {
    hints.push(translateMCPToolSchemaCopy(
      translate,
      'ai_chat.inspection.mcp_tool_schema.usage.enum_values',
      '{{path}} must be one of: {{values}}',
      { path: enumHint.path, values: enumHint.enumValues.join(' / ') },
    ));
  }
  if (nestedHint) {
    hints.push(translateMCPToolSchemaCopy(
      translate,
      'ai_chat.inspection.mcp_tool_schema.usage.nested_json',
      'Nested object and array parameters must follow the JSON structure; do not pass the whole object as a string.',
    ));
  }
  if (parameterHints.length > 0) {
    hints.push(translateMCPToolSchemaCopy(
      translate,
      'ai_chat.inspection.mcp_tool_schema.usage.schema_fields_only',
      'Only pass fields declared in the schema; if a field meaning is unclear, ask the user instead of guessing.',
    ));
  }
  return hints;
};

export const buildMCPToolSchemaSnapshot = (params: {
  mcpTools?: AIMCPToolDescriptor[];
  alias?: string;
  serverId?: string;
  keyword?: string;
  includeSchema?: boolean;
  limit?: number;
  translate?: AIInspectionTranslator;
}) => {
  const {
    mcpTools = [],
    alias = '',
    serverId = '',
    keyword = '',
    includeSchema = false,
    translate,
  } = params;
  const normalizedAlias = normalizeSearchText(alias);
  const normalizedServerId = normalizeSearchText(serverId);
  const normalizedKeyword = normalizeSearchText(keyword);
  const limit = Math.max(1, Math.min(MAX_TOOL_LIMIT, Number(params.limit) || DEFAULT_TOOL_LIMIT));
  const allTools = Array.isArray(mcpTools) ? mcpTools : [];

  const matchedTools = allTools
    .filter((tool) => {
      if (normalizedAlias) {
        const aliasText = normalizeSearchText(tool.alias);
        const originalText = normalizeSearchText(tool.originalName);
        if (aliasText !== normalizedAlias && originalText !== normalizedAlias) {
          return false;
        }
      }
      if (normalizedServerId && normalizeSearchText(tool.serverId) !== normalizedServerId) {
        return false;
      }
      return matchesKeyword(tool, normalizedKeyword);
    })
    .sort((left, right) => {
      if (normalizedAlias) {
        const leftExact = normalizeSearchText(left.alias) === normalizedAlias ? 0 : 1;
        const rightExact = normalizeSearchText(right.alias) === normalizedAlias ? 0 : 1;
        if (leftExact !== rightExact) {
          return leftExact - rightExact;
        }
      }
      return String(left.alias || '').localeCompare(String(right.alias || ''));
    });

  const tools = matchedTools.slice(0, limit).map((tool) => {
    const inputSchema = isRecord(tool.inputSchema) ? tool.inputSchema : {};
    const parameterHints = buildParameterHints(inputSchema);
    const topLevelParameters = parameterHints.filter((item) => !item.path.includes('.'));
    const requiredParameters = topLevelParameters
      .filter((item) => item.required)
      .map((item) => item.path);
    const hasInputSchema = Object.keys(inputSchema).length > 0;

    return {
      alias: tool.alias,
      originalName: tool.originalName,
      title: tool.title || tool.originalName || tool.alias,
      description: tool.description || '',
      serverId: tool.serverId,
      serverName: tool.serverName,
      hasInputSchema,
      parameterCount: topLevelParameters.length,
      parameterHintCount: parameterHints.length,
      parameterHintsTruncated: parameterHints.length >= MAX_PARAMETER_HINTS,
      requiredParameterCount: requiredParameters.length,
      requiredParameters,
      parameters: parameterHints,
      usageHints: buildUsageHints({ tool, hasInputSchema, parameterHints, translate }),
      inputSchema: includeSchema ? inputSchema : undefined,
    };
  });

  const warnings: string[] = [];
  const nextActions: string[] = [];
  if (allTools.length === 0) {
    warnings.push(translateMCPToolSchemaCopy(
      translate,
      'ai_chat.inspection.mcp_tool_schema.warning.no_tools',
      'No MCP tools were discovered; MCP services may not be configured, or service testing/discovery may have failed.',
    ));
    nextActions.push(translateMCPToolSchemaCopy(
      translate,
      'ai_chat.inspection.mcp_tool_schema.next_action.inspect_setup',
      'Call inspect_mcp_setup first to check whether MCP services are enabled and tools have been discovered.',
    ));
  } else if (matchedTools.length === 0) {
    warnings.push(translateMCPToolSchemaCopy(
      translate,
      'ai_chat.inspection.mcp_tool_schema.warning.no_matches',
      'No matching MCP tool was found.',
    ));
    nextActions.push(translateMCPToolSchemaCopy(
      translate,
      'ai_chat.inspection.mcp_tool_schema.next_action.lookup_alias',
      'Call inspect_mcp_setup first to check the MCP tool aliases actually discovered, then query by exact alias.',
    ));
  } else if (tools.some((tool) => !tool.hasInputSchema)) {
    warnings.push(translateMCPToolSchemaCopy(
      translate,
      'ai_chat.inspection.mcp_tool_schema.warning.missing_schema',
      'Some MCP tools do not declare inputSchema, so parameter documentation may be incomplete.',
    ));
    nextActions.push(translateMCPToolSchemaCopy(
      translate,
      'ai_chat.inspection.mcp_tool_schema.next_action.read_readme',
      'For tools without schema, go back to the MCP service README or use tool errors to confirm parameters.',
    ));
  }

  return {
    query: {
      alias: alias || '',
      serverId: serverId || '',
      keyword: keyword || '',
      includeSchema: includeSchema === true,
      limit,
    },
    totalMCPToolCount: allTools.length,
    matchedToolCount: matchedTools.length,
    returnedToolCount: tools.length,
    toolsTruncated: matchedTools.length > tools.length,
    tools,
    warnings,
    nextActions,
    message: matchedTools.length > 0
      ? translateMCPToolSchemaCopy(
          translate,
          'ai_chat.inspection.mcp_tool_schema.message.with_matches',
          'Found {{matched}} MCP tools and returned {{returned}} parameter schema summaries',
          { matched: matchedTools.length, returned: tools.length },
        )
      : allTools.length > 0
        ? translateMCPToolSchemaCopy(
            translate,
            'ai_chat.inspection.mcp_tool_schema.message.no_matches',
            'No matching MCP tool was found',
          )
        : translateMCPToolSchemaCopy(
            translate,
            'ai_chat.inspection.mcp_tool_schema.message.empty',
            'No MCP tool schema is available yet',
          ),
  };
};
