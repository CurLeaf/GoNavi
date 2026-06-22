import {
  MCP_AUTHORING_NOTES,
  MCP_COMMAND_EXAMPLES,
  MCP_COMMAND_PARSE_EXAMPLE,
  MCP_FIELD_GUIDES,
  MCP_SERVER_FILL_STEPS,
  buildMCPLaunchPreview,
} from '../../utils/mcpServerGuidance';
import { t as catalogTranslate } from '../../i18n/catalog';
import { MCP_SERVER_DRAFT_TEMPLATES } from '../../utils/mcpServerTemplates';
import { translateInspectionCopy, type AIInspectionTranslator } from './aiInspectionI18n';

const copy = (
  translate: AIInspectionTranslator | undefined,
  key: string,
) => translateInspectionCopy(translate, key, catalogTranslate('en-US', key));

export const buildMCPAuthoringGuideSnapshot = (translate?: AIInspectionTranslator) => ({
  fullCommandPasteExample: MCP_COMMAND_PARSE_EXAMPLE,
  commandExamples: MCP_COMMAND_EXAMPLES,
  supportsWholeCommandAutoSplit: true,
  recommendedSteps: MCP_SERVER_FILL_STEPS.map((item) => ({
    step: item.step,
    title: copy(translate, item.titleKey),
    detail: copy(translate, item.detailKey),
  })),
  fieldGuides: MCP_FIELD_GUIDES.map((item) => ({
    key: item.key,
    title: copy(translate, item.titleKey),
    summary: copy(translate, item.summaryKey),
    detail: copy(translate, item.detailKey),
    example: item.exampleKey ? copy(translate, item.exampleKey) : item.example || '',
    required: item.fieldState === 'required',
    fixed: item.fieldState === 'fixed',
  })),
  templates: MCP_SERVER_DRAFT_TEMPLATES.map((template) => ({
    key: template.key,
    title: translateInspectionCopy(translate, template.titleKey, template.title),
    description: translateInspectionCopy(translate, template.descriptionKey, template.description),
    detail: translateInspectionCopy(translate, template.detailKey, template.detail),
    exampleLaunchPreview: buildMCPLaunchPreview(
      String(template.seed.command || ''),
      Array.isArray(template.seed.args) ? template.seed.args : [],
    ),
  })),
  notes: MCP_AUTHORING_NOTES.map((key) => copy(translate, key)),
});
