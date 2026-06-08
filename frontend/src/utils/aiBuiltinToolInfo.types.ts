export interface AIChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface AIBuiltinToolInfo {
  name: string;
  icon: string;
  desc: string;
  detail: string;
  params: string;
  tool: AIChatToolDefinition;
}
