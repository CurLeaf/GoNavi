import React from 'react';
import { Button, Input, Popconfirm, Select } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

import { t as catalogTranslate } from '../../i18n/catalog';
import { useOptionalI18n } from '../../i18n/provider';
import type { AISkillConfig, AISkillScope } from '../../types';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

interface AISettingsSkillsSectionProps {
  skills: AISkillConfig[];
  skillRequiredToolOptions: Array<{ label: string; value: string }>;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  loading: boolean;
  onAddSkill: () => void;
  onUpdateSkillDraft: (id: string, patch: Partial<AISkillConfig>) => void;
  onSaveSkill: (skill: AISkillConfig) => void;
  onDeleteSkill: (id: string) => void;
}

const SKILL_SCOPE_OPTIONS: Array<{ value: AISkillScope; labelKey: string; descKey: string }> = [
  { value: 'global', labelKey: 'ai_settings.skill.scope.global.label', descKey: 'ai_settings.skill.scope.global.desc' },
  { value: 'database', labelKey: 'ai_settings.skill.scope.database.label', descKey: 'ai_settings.skill.scope.database.desc' },
  { value: 'jvm', labelKey: 'ai_settings.skill.scope.jvm.label', descKey: 'ai_settings.skill.scope.jvm.desc' },
  { value: 'jvmDiagnostic', labelKey: 'ai_settings.skill.scope.jvm_diagnostic.label', descKey: 'ai_settings.skill.scope.jvm_diagnostic.desc' },
];

const AISettingsSkillsSection: React.FC<AISettingsSkillsSectionProps> = ({
  skills,
  skillRequiredToolOptions,
  overlayTheme,
  cardBg,
  cardBorder,
  inputBg,
  loading,
  onAddSkill,
  onUpdateSkillDraft,
  onSaveSkill,
  onDeleteSkill,
}) => {
  const i18n = useOptionalI18n();
  const copy = (key: string) => (i18n?.t ?? ((catalogKey) => catalogTranslate('en-US', catalogKey)))(key);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
        {copy('ai_settings.skill.description')}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 12, color: overlayTheme.mutedText }}>{copy('ai_settings.skill.hint')}</div>
        <Button icon={<PlusOutlined />} onClick={onAddSkill} style={{ borderRadius: 10 }}>
          {copy('ai_settings.skill.action.add')}
        </Button>
      </div>
      {skills.length === 0 && (
        <div style={{ padding: '18px 16px', borderRadius: 14, border: `1px dashed ${cardBorder}`, background: cardBg, color: overlayTheme.mutedText }}>
          {copy('ai_settings.skill.empty')}
        </div>
      )}
      {skills.map((skill) => (
        <div key={skill.id} style={{ padding: '14px 16px', borderRadius: 14, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 132px', gap: 12 }}>
            <Input
              value={skill.name}
              onChange={(event) => onUpdateSkillDraft(skill.id, { name: event.target.value })}
              placeholder={copy('ai_settings.skill.name_placeholder')}
              style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}` }}
            />
            <Select
              value={skill.enabled ? 'enabled' : 'disabled'}
              onChange={(value) => onUpdateSkillDraft(skill.id, { enabled: value === 'enabled' })}
              options={[
                { label: copy('ai_settings.skill.status.enabled'), value: 'enabled' },
                { label: copy('ai_settings.skill.status.disabled'), value: 'disabled' },
              ]}
            />
          </div>
          <Input
            value={skill.description || ''}
            onChange={(event) => onUpdateSkillDraft(skill.id, { description: event.target.value })}
            placeholder={copy('ai_settings.skill.description_placeholder')}
            style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}` }}
          />
          <Select
            mode="multiple"
            value={skill.scopes || []}
            onChange={(value) => onUpdateSkillDraft(skill.id, { scopes: value as AISkillScope[] })}
            options={SKILL_SCOPE_OPTIONS.map((option) => ({
              label: `${copy(option.labelKey)} · ${copy(option.descKey)}`,
              value: option.value,
            }))}
            placeholder={copy('ai_settings.skill.scopes_placeholder')}
            style={{ width: '100%' }}
          />
          <Select
            mode="multiple"
            value={skill.requiredTools || []}
            onChange={(value) => onUpdateSkillDraft(skill.id, { requiredTools: value })}
            options={skillRequiredToolOptions}
            placeholder={copy('ai_settings.skill.required_tools_placeholder')}
            style={{ width: '100%' }}
          />
          <Input.TextArea
            rows={6}
            value={skill.systemPrompt}
            onChange={(event) => onUpdateSkillDraft(skill.id, { systemPrompt: event.target.value })}
            placeholder={copy('ai_settings.skill.system_prompt_placeholder')}
            style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}`, fontFamily: 'var(--gn-font-mono)', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="primary" onClick={() => onSaveSkill(skill)} loading={loading} style={{ borderRadius: 10, fontWeight: 600 }}>
              {copy('common.save')}
            </Button>
            <Popconfirm
              title={copy('ai_settings.skill.confirm_delete')}
              okText={copy('common.delete')}
              cancelText={copy('common.cancel')}
              onConfirm={() => onDeleteSkill(skill.id)}
            >
              <Button danger icon={<DeleteOutlined />} style={{ borderRadius: 10 }}>
                {copy('common.delete')}
              </Button>
            </Popconfirm>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AISettingsSkillsSection;
