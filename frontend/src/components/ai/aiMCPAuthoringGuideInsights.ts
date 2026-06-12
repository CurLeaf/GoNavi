import {
  MCP_AUTHORING_NOTES,
  MCP_COMMAND_EXAMPLES,
  MCP_COMMAND_PARSE_EXAMPLE,
  MCP_FIELD_GUIDES,
  MCP_SERVER_FILL_STEPS,
  buildMCPLaunchPreview,
} from '../../utils/mcpServerGuidance';
import { MCP_SERVER_DRAFT_TEMPLATES } from '../../utils/mcpServerTemplates';

export const buildMCPAuthoringGuideSnapshot = () => ({
  fullCommandPasteExample: MCP_COMMAND_PARSE_EXAMPLE,
  commandExamples: MCP_COMMAND_EXAMPLES,
  supportsWholeCommandAutoSplit: true,
  recommendedSteps: MCP_SERVER_FILL_STEPS.map((item) => ({
    step: item.step,
    title: item.title,
    detail: item.detail,
  })),
  fieldGuides: MCP_FIELD_GUIDES.map((item) => ({
    key: item.key,
    title: item.title,
    summary: item.summary,
    detail: item.detail,
    example: item.example || '',
    required: item.fieldState === 'required',
    fixed: item.fieldState === 'fixed',
  })),
  templates: MCP_SERVER_DRAFT_TEMPLATES.map((template) => ({
    key: template.key,
    title: template.title,
    description: template.description,
    detail: template.detail,
    exampleLaunchPreview: buildMCPLaunchPreview(
      String(template.seed.command || ''),
      Array.isArray(template.seed.args) ? template.seed.args : [],
    ),
  })),
  notes: MCP_AUTHORING_NOTES,
});
