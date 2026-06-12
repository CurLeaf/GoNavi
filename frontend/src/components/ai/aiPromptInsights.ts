import type { AISkillConfig, AIUserPromptSettings } from '../../types';

const PROMPT_SCOPE_LABELS: Record<keyof AIUserPromptSettings, string> = {
  global: '全局',
  database: '数据库会话',
  jvm: 'JVM 资源分析',
  jvmDiagnostic: 'JVM 诊断',
};

export const buildAIGuidanceSnapshot = (params: {
  userPromptSettings?: AIUserPromptSettings;
  skills?: AISkillConfig[];
}) => {
  const userPromptSettings = params.userPromptSettings || {
    global: '',
    database: '',
    jvm: '',
    jvmDiagnostic: '',
  };
  const skills = Array.isArray(params.skills) ? params.skills : [];

  const customPrompts = (Object.keys(PROMPT_SCOPE_LABELS) as Array<keyof AIUserPromptSettings>).map((scope) => {
    const content = String(userPromptSettings[scope] || '').trim();
    return {
      scope,
      label: PROMPT_SCOPE_LABELS[scope],
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
      ? `当前已启用 ${enabledPromptCount} 条自定义提示词、${enabledSkills.length} 个 Skills`
      : '当前没有启用自定义提示词或 Skills',
  };
};
