import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";
import { BUILTIN_AI_INSPECTION_CONTEXT_TOOL_INFO } from "./aiBuiltinInspectionContextToolInfo";
import { BUILTIN_AI_INSPECTION_CORE_TOOL_INFO } from "./aiBuiltinInspectionCoreToolInfo";
import { BUILTIN_AI_INSPECTION_DIAGNOSTICS_TOOL_INFO } from "./aiBuiltinInspectionDiagnosticsToolInfo";
import { BUILTIN_AI_INSPECTION_MCP_TOOL_INFO } from "./aiBuiltinInspectionMcpToolInfo";
import { BUILTIN_AI_INSPECTION_SQL_TOOL_INFO } from "./aiBuiltinInspectionSqlToolInfo";

export const BUILTIN_AI_INSPECTION_TOOL_INFO: AIBuiltinToolInfo[] = [
  ...BUILTIN_AI_INSPECTION_CORE_TOOL_INFO,
  ...BUILTIN_AI_INSPECTION_MCP_TOOL_INFO,
  ...BUILTIN_AI_INSPECTION_CONTEXT_TOOL_INFO,
  ...BUILTIN_AI_INSPECTION_SQL_TOOL_INFO,
  ...BUILTIN_AI_INSPECTION_DIAGNOSTICS_TOOL_INFO,
];
