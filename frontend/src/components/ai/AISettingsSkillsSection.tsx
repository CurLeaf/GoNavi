import React from 'react';
import { Button, Input, Popconfirm, Select } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

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

const SKILL_SCOPE_OPTIONS: Array<{ value: AISkillScope; label: string; desc: string }> = [
  { value: 'global', label: '全局', desc: '所有 AI 会话都启用' },
  { value: 'database', label: '数据库', desc: '仅 SQL / 数据库场景启用' },
  { value: 'jvm', label: 'JVM 资源', desc: '仅 JVM 资源分析场景启用' },
  { value: 'jvmDiagnostic', label: 'JVM 诊断', desc: '仅 JVM 诊断工作台启用' },
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
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
      Skill 不是另一条大提示词，而是“命名的提示模块 + 作用域 + 工具依赖”。当前阶段仍建议保留在主仓库内，不需要单独新建 GitHub 仓库；只有未来要做共享 skill pack 分发时，再考虑拆仓。
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 12, color: overlayTheme.mutedText }}>启用后会按 scope 注入对应会话；如果依赖的工具不存在，该 Skill 会被自动跳过。</div>
      <Button icon={<PlusOutlined />} onClick={onAddSkill} style={{ borderRadius: 10 }}>新增 Skill</Button>
    </div>
    {skills.length === 0 && (
      <div style={{ padding: '18px 16px', borderRadius: 14, border: `1px dashed ${cardBorder}`, background: cardBg, color: overlayTheme.mutedText }}>
        还没有 Skill。你可以给数据库、JVM、诊断场景分别定义专用的 system prompt。
      </div>
    )}
    {skills.map((skill) => (
      <div key={skill.id} style={{ padding: '14px 16px', borderRadius: 14, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 132px', gap: 12 }}>
          <Input
            value={skill.name}
            onChange={(event) => onUpdateSkillDraft(skill.id, { name: event.target.value })}
            placeholder="Skill 名称，例如：SQL 审查 / JVM 诊断计划"
            style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}` }}
          />
          <Select
            value={skill.enabled ? 'enabled' : 'disabled'}
            onChange={(value) => onUpdateSkillDraft(skill.id, { enabled: value === 'enabled' })}
            options={[{ label: '已启用', value: 'enabled' }, { label: '已禁用', value: 'disabled' }]}
          />
        </div>
        <Input
          value={skill.description || ''}
          onChange={(event) => onUpdateSkillDraft(skill.id, { description: event.target.value })}
          placeholder="给自己看的说明，例如：输出 SQL 前必须先确认字段名和风险"
          style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}` }}
        />
        <Select
          mode="multiple"
          value={skill.scopes || []}
          onChange={(value) => onUpdateSkillDraft(skill.id, { scopes: value as AISkillScope[] })}
          options={SKILL_SCOPE_OPTIONS.map((option) => ({ label: `${option.label} · ${option.desc}`, value: option.value }))}
          placeholder="选择这个 Skill 要作用到哪些场景"
          style={{ width: '100%' }}
        />
        <Select
          mode="multiple"
          value={skill.requiredTools || []}
          onChange={(value) => onUpdateSkillDraft(skill.id, { requiredTools: value })}
          options={skillRequiredToolOptions}
          placeholder="可选：声明这个 Skill 依赖哪些工具"
          style={{ width: '100%' }}
        />
        <Input.TextArea
          rows={6}
          value={skill.systemPrompt}
          onChange={(event) => onUpdateSkillDraft(skill.id, { systemPrompt: event.target.value })}
          placeholder="输入这条 Skill 要追加的 system prompt。建议聚焦一个明确能力，不要和全局提示词重复。"
          style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}`, fontFamily: 'var(--gn-font-mono)', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type="primary" onClick={() => onSaveSkill(skill)} loading={loading} style={{ borderRadius: 10, fontWeight: 600 }}>保存</Button>
          <Popconfirm title="删除这个 Skill？" okText="删除" cancelText="取消" onConfirm={() => onDeleteSkill(skill.id)}>
            <Button danger icon={<DeleteOutlined />} style={{ borderRadius: 10 }}>删除</Button>
          </Popconfirm>
        </div>
      </div>
    ))}
  </div>
);

export default AISettingsSkillsSection;
