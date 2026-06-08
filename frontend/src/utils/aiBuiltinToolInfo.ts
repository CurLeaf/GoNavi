import { BUILTIN_AI_DATABASE_TOOL_INFO } from "./aiBuiltinDatabaseToolInfo";
import { BUILTIN_AI_INSPECTION_TOOL_INFO } from "./aiBuiltinInspectionToolInfo";

export type {
  AIChatToolDefinition,
  AIBuiltinToolInfo,
} from "./aiBuiltinToolInfo.types";

export const BUILTIN_AI_TOOL_INFO = [
  ...BUILTIN_AI_DATABASE_TOOL_INFO,
  ...BUILTIN_AI_INSPECTION_TOOL_INFO,
];
