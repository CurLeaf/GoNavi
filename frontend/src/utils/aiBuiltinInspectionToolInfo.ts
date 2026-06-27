import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";
import {
  BUILTIN_AI_INSPECTION_CONTEXT_TOOL_INFO,
  localizeBuiltinInspectionContextToolInfo,
} from "./aiBuiltinInspectionContextToolInfo";
import {
  BUILTIN_AI_INSPECTION_CORE_TOOL_INFO,
  localizeBuiltinInspectionCoreToolInfo,
} from "./aiBuiltinInspectionCoreToolInfo";
import {
  BUILTIN_AI_INSPECTION_DIAGNOSTICS_TOOL_INFO,
  localizeBuiltinInspectionDiagnosticsToolInfo,
} from "./aiBuiltinInspectionDiagnosticsToolInfo";
import {
  BUILTIN_AI_INSPECTION_MCP_TOOL_INFO,
  localizeBuiltinInspectionMcpToolInfo,
} from "./aiBuiltinInspectionMcpToolInfo";
import {
  BUILTIN_AI_INSPECTION_SQL_TOOL_INFO,
  localizeBuiltinInspectionSqlToolInfo,
} from "./aiBuiltinInspectionSqlToolInfo";

export const BUILTIN_AI_INSPECTION_TOOL_INFO: AIBuiltinToolInfo[] = [
  ...BUILTIN_AI_INSPECTION_CORE_TOOL_INFO,
  ...BUILTIN_AI_INSPECTION_MCP_TOOL_INFO,
  ...BUILTIN_AI_INSPECTION_CONTEXT_TOOL_INFO,
  ...BUILTIN_AI_INSPECTION_SQL_TOOL_INFO,
  ...BUILTIN_AI_INSPECTION_DIAGNOSTICS_TOOL_INFO,
];

export const localizeBuiltinInspectionToolInfo = (
  t?: (key: string) => string,
): AIBuiltinToolInfo[] => [
  ...localizeBuiltinInspectionCoreToolInfo(t),
  ...localizeBuiltinInspectionMcpToolInfo(t),
  ...localizeBuiltinInspectionContextToolInfo(t),
  ...localizeBuiltinInspectionSqlToolInfo(t),
  ...localizeBuiltinInspectionDiagnosticsToolInfo(t),
];
