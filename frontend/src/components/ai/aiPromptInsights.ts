import type { AISkillConfig, AIUserPromptSettings } from '../../types';
import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

const PROMPT_SCOPE_FALLBACKS: Record<keyof AIUserPromptSettings, string> = {
  global: 'Global',
  database: 'Database session',
  jvm: 'JVM resource analysis',
  jvmDiagnostic: 'JVM diagnostics',
};

export const buildAIGuidanceSnapshot = (params: {
  userPromptSettings?: AIUserPromptSettings;
  skills?: AISkillConfig[];
  translate?: AIInspectionTranslator;
}) => {
  const translate = params.translate;
  const userPromptSettings = params.userPromptSettings || {
    global: '',
    database: '',
    jvm: '',
    jvmDiagnostic: '',
  };
  const skills = Array.isArray(params.skills) ? params.skills : [];

  const customPrompts = (Object.keys(PROMPT_SCOPE_FALLBACKS) as Array<keyof AIUserPromptSettings>).map((scope) => {
    const content = String(userPromptSettings[scope] || '').trim();
    return {
      scope,
      label: translateInspectionCopy(
        translate,
        `ai_chat.inspection.guidance.scope.${scope}`,
        PROMPT_SCOPE_FALLBACKS[scope],
      ),
      enabled: content.length > 0,
      charCount: content.length,
      content,
    };
  });

  const enabledSkills = skills
    .filter((skill) => skill?.enabled)
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description || '',
      scopes: Array.isArray(skill.scopes) ? skill.scopes : [],
      requiredTools: Array.isArray(skill.requiredTools) ? skill.requiredTools : [],
      systemPrompt: String(skill.systemPrompt || '').trim(),
      systemPromptCharCount: String(skill.systemPrompt || '').trim().length,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const disabledSkillCount = skills.filter((skill) => skill && !skill.enabled).length;
  const enabledPromptCount = customPrompts.filter((item) => item.enabled).length;

  return {
    customPromptCount: enabledPromptCount,
    customPrompts,
    skillCount: skills.length,
    enabledSkillCount: enabledSkills.length,
    disabledSkillCount,
    enabledSkills,
    message: enabledPromptCount > 0 || enabledSkills.length > 0
      ? translateInspectionCopy(
        translate,
        'ai_chat.inspection.guidance.message.configured',
        `${enabledPromptCount} custom prompts and ${enabledSkills.length} Skills are enabled`,
        { promptCount: enabledPromptCount, skillCount: enabledSkills.length },
      )
      : translateInspectionCopy(
        translate,
        'ai_chat.inspection.guidance.message.empty',
        'No custom prompts or Skills are enabled',
      ),
  };
};
