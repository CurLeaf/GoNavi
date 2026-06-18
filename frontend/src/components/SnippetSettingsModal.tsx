import { useState, useMemo, useCallback } from 'react';
import Modal from './common/ResizableDraggableModal';
import { Button, Input, List, Tag, Popconfirm, message, Collapse, Typography } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  UndoOutlined,
  SaveOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { SqlSnippet } from '../types';
import { useStore } from '../store';
import { BUILTIN_SNIPPET_MAP } from '../utils/sqlSnippetDefaults';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import { useI18n } from '../i18n/provider';
interface SnippetSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  embedded?: boolean;
}

type DraftSnippet = Omit<SqlSnippet, 'createdAt'> & { createdAt?: number };

const emptyDraft = (): DraftSnippet => ({
  id: uuidv4(),
  prefix: '',
  name: '',
  description: '',
  syntaxHelp: '',
  body: '',
  isBuiltin: false,
});

export default function SnippetSettingsModal({
  open,
  onClose,
  onBack,
  darkMode,
  overlayTheme,
  embedded = false,
}: SnippetSettingsModalProps) {
  const { t } = useI18n();
  const sqlSnippets = useStore((s) => s.sqlSnippets);
  const saveSqlSnippet = useStore((s) => s.saveSqlSnippet);
  const deleteSqlSnippet = useStore((s) => s.deleteSqlSnippet);
  const resetBuiltinSqlSnippet = useStore((s) => s.resetBuiltinSqlSnippet);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftSnippet>(emptyDraft());
  const [isCreating, setIsCreating] = useState(false);

  const shellStyle = useMemo(
    () => ({
      background: overlayTheme.shellBg,
      border: overlayTheme.shellBorder,
      boxShadow: overlayTheme.shellShadow,
      backdropFilter: overlayTheme.shellBackdropFilter,
    }),
    [overlayTheme],
  );

  const panelStyle = useMemo(
    () => ({
      padding: 16,
      borderRadius: 14,
      border: overlayTheme.sectionBorder,
      background: overlayTheme.sectionBg,
    }),
    [overlayTheme],
  );

  const textColor = darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(16,24,40,0.9)';
  const mutedColor = darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)';
  const selectedBg = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';

  const sortedSnippets = useMemo(
    () => [...sqlSnippets].sort((a, b) => a.prefix.localeCompare(b.prefix)),
    [sqlSnippets],
  );

  const selectedSnippet = useMemo(
    () => sqlSnippets.find((s) => s.id === selectedId) ?? null,
    [sqlSnippets, selectedId],
  );

  const handleSelect = useCallback(
    (snippet: SqlSnippet) => {
      setIsCreating(false);
      setSelectedId(snippet.id);
      setDraft({ ...snippet });
    },
    [],
  );

  const handleNew = useCallback(() => {
    setIsCreating(true);
    setSelectedId(null);
    setDraft(emptyDraft());
  }, []);

  const handleSave = useCallback(() => {
    const prefix = draft.prefix.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
    if (!prefix) {
      void message.warning('前缀不能为空');
      return;
    }
    if (!draft.name.trim()) {
      void message.warning('名称不能为空');
      return;
    }
    if (!draft.body.trim()) {
      void message.warning('片段内容不能为空');
      return;
    }

    const duplicate = sqlSnippets.find(
      (s) => s.prefix.toLowerCase() === prefix && s.id !== draft.id,
    );
    if (duplicate) {
      void message.warning(`前缀 "${prefix}" 已被其他片段使用`);
      return;
    }

    const toSave: SqlSnippet = {
      id: draft.id,
      prefix,
      name: draft.name.trim(),
      description: draft.description?.trim() || undefined,
      syntaxHelp: draft.syntaxHelp?.trim() || undefined,
      body: draft.body,
      isBuiltin: draft.isBuiltin,
      createdAt: draft.createdAt ?? Date.now(),
    };

    saveSqlSnippet(toSave);
    setSelectedId(toSave.id);
    setIsCreating(false);
    void message.success('片段已保存');
  }, [draft, sqlSnippets, saveSqlSnippet]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteSqlSnippet(id);
      if (selectedId === id) {
        setSelectedId(null);
        setDraft(emptyDraft());
      }
      void message.success('片段已删除');
    },
    [deleteSqlSnippet, selectedId],
  );

  const handleReset = useCallback(
    (id: string) => {
      resetBuiltinSqlSnippet(id);
      const original = BUILTIN_SNIPPET_MAP[id];
      if (original && selectedId === id) {
        setDraft({ ...original, syntaxHelp: original.syntaxHelp || '' });
      }
      void message.success('已重置为默认');
    },
    [resetBuiltinSqlSnippet, selectedId],
  );

  const syntaxHelpItems = useMemo(
    () => [
      {
        key: 'snippet-help',
        label: '片段语法说明（可编辑）',
        children: (
          <Input.TextArea
            data-sql-snippet-syntax-help-editor="true"
            value={draft.syntaxHelp || ''}
            onChange={(e) => setDraft((d) => ({ ...d, syntaxHelp: e.target.value }))}
            placeholder="展示在补全详情中的用法说明，例如占位符含义、参数约定或注意事项"
            maxLength={1000}
            autoSize={{ minRows: 4, maxRows: 8 }}
            style={{
              fontSize: 12,
              resize: 'none',
              fontFamily: 'var(--gn-font-mono)',
            }}
          />
        ),
      },
      {
        key: 'syntax',
        label: '占位符语法参考',
        children: (
          <div style={{ fontSize: 12, lineHeight: 1.8, color: mutedColor, fontFamily: 'var(--gn-font-mono)' }}>
            <div>{'${1:占位符}   第一个 Tab 位，占位符为提示文字'}</div>
            <div>{'${2:默认值}   第二个 Tab 位，默认值可直接确认'}</div>
            <div>{'$0            最终光标位置'}</div>
            <div>{'${1:表名}     同一数字在多处出现时会同步编辑'}</div>
            <div style={{ marginTop: 6, fontWeight: 600, color: textColor }}>{'内置变量（展开时自动替换为实际值）：'}</div>
            <div>{'${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE}  当前日期'}</div>
            <div>{'${CURRENT_HOUR}:${CURRENT_MINUTE}:${CURRENT_SECOND}  当前时间'}</div>
            <div>{'${CURRENT_SECONDS_UNIX}  Unix 时间戳'}</div>
            <div>{'${UUID}       随机 UUID'}</div>
            <div>{'${RANDOM}     6 位随机数'}</div>
            <div style={{ marginTop: 8, fontFamily: 'inherit', color: textColor }}>
              {'示例：SELECT ${1:列名} FROM ${2:表名} WHERE date >= \'${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE}\';$0'}
            </div>
          </div>
        ),
      },
    ],
    [draft.syntaxHelp, mutedColor, textColor],
  );

  const showEditor = isCreating || selectedSnippet;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              background: overlayTheme.iconBg,
              color: overlayTheme.iconColor,
              flexShrink: 0,
            }}
          >
            <CodeOutlined />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: textColor }}>代码片段管理</div>
            <div style={{ fontSize: 12, color: mutedColor, lineHeight: 1.5 }}>
              管理 SQL 代码片段，输入前缀后按 Tab 展开
            </div>
            </div>
        </div>
      }
      open={open}
      embedded={embedded}
      onCancel={onClose}
      width={820}
      styles={{
        content: shellStyle,
        header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
        body: { paddingTop: 8, paddingBottom: 24 },
      }}
      footer={null}
    >
      <div style={{ display: 'flex', gap: 16, minHeight: 420 }}>
        {/* Left: snippet list */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            borderRadius: 14,
            border: overlayTheme.sectionBorder,
            background: overlayTheme.sectionBg,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 12px 4px', fontSize: 12, color: mutedColor, fontWeight: 600 }}>
            片段列表
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <List
              size="small"
              dataSource={sortedSnippets}
              renderItem={(snippet) => (
                <List.Item
                  onClick={() => handleSelect(snippet)}
                  style={{
                    cursor: 'pointer',
                    padding: '6px 12px',
                    background: selectedId === snippet.id ? selectedBg : 'transparent',
                    borderLeft:
                      selectedId === snippet.id
                        ? `3px solid ${overlayTheme.iconBg}`
                        : '3px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <Typography.Text
                      code
                      style={{ fontSize: 12, flexShrink: 0, color: textColor }}
                    >
                      {snippet.prefix}
                    </Typography.Text>
                    <span
                      style={{
                        fontSize: 12,
                        color: textColor,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {snippet.name}
                    </span>
                    {snippet.isBuiltin && (
                      <Tag
                        style={{
                          fontSize: 10,
                          lineHeight: '16px',
                          padding: '0 4px',
                          margin: 0,
                          borderRadius: 4,
                        }}
                        color="blue"
                      >
                        内置
                      </Tag>
                    )}
                  </div>
                </List.Item>
              )}
            />
          </div>
          <div style={{ padding: 8 }}>
            <Button type="dashed" icon={<PlusOutlined />} block size="small" onClick={handleNew}>
              新建片段
            </Button>
          </div>
        </div>

        {/* Right: editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {showEditor ? (
            <div
              style={{
                ...panelStyle,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                height: '100%',
              }}
            >
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 0.4 }}>
                  <div style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>前缀</div>
                  <Input
                    value={draft.prefix}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, prefix: e.target.value.toLowerCase() }))
                    }
                    placeholder="如 sel, ins"
                    maxLength={20}
                    size="small"
                  />
                </div>
                <div style={{ flex: 0.6 }}>
                  <div style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>名称</div>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="片段显示名称"
                    maxLength={60}
                    size="small"
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>描述（可选）</div>
                <Input
                  value={draft.description || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="补全详情中的描述文字"
                  maxLength={200}
                  size="small"
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>片段内容</div>
                <Input.TextArea
                  value={draft.body}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                  placeholder={'SELECT ${1:columns} FROM ${2:table_name}$0;'}
                  style={{
                    flex: 1,
                    minHeight: 120,
                    fontFamily: 'var(--gn-font-mono)',
                    fontSize: 13,
                    resize: 'none',
                  }}
                />
                <Collapse
                  size="small"
                  defaultActiveKey={['snippet-help']}
                  items={syntaxHelpItems}
                  style={{ marginTop: 8, background: 'transparent' }}
                />
              </div>

            </div>
          ) : (
            <div
              style={{
                ...panelStyle,
                display: 'grid',
                placeItems: 'center',
                height: '100%',
                color: mutedColor,
                fontSize: 13,
              }}
            >
              选择左侧片段编辑，或点击「新建片段」
            </div>
          )}
        </div>
      </div>
      <div
        data-sql-snippet-action-row="true"
        style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingTop: 18,
          marginTop: 18,
          borderTop: overlayTheme.sectionBorder,
        }}
      >
        {showEditor && draft.isBuiltin && draft.createdAt && (
          <Popconfirm
            title="重置为默认"
            description="将恢复此内置片段的原始内容"
            onConfirm={() => handleReset(draft.id)}
          >
            <Button icon={<UndoOutlined />} size="large" style={{ minWidth: 118 }}>
              重置为默认
            </Button>
          </Popconfirm>
        )}
        {showEditor && !draft.isBuiltin && !isCreating && (
          <Popconfirm
            title="删除片段"
            description="确定要删除此片段吗？"
            onConfirm={() => handleDelete(draft.id)}
          >
            <Button danger icon={<DeleteOutlined />} size="large" style={{ minWidth: 96 }}>
              删除
            </Button>
          </Popconfirm>
        )}
        {showEditor && (
          <Button type="primary" icon={<SaveOutlined />} size="large" style={{ minWidth: 96 }} onClick={handleSave}>
            保存
          </Button>
        )}
        <Button size="large" style={{ minWidth: 96 }} onClick={onClose}>
          关闭
        </Button>
        {onBack ? (
          <Button size="large" style={{ minWidth: 124 }} onClick={onBack}>
            {t('common.back_to_previous')}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
