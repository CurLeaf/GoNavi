import { useState, useMemo, useCallback } from 'react';
import { Modal, Button, Input, List, Tag, Popconfirm, message, Collapse, Typography } from 'antd';
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
import { useI18n } from '../i18n/provider';
import { BUILTIN_SNIPPET_MAP } from '../utils/sqlSnippetDefaults';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
interface SnippetSettingsModalProps {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
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
  darkMode,
  overlayTheme,
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
  const newSnippetAction = t('snippet_settings.action.new');

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
      void message.warning(t('snippet_settings.message.prefix_required'));
      return;
    }
    if (!draft.name.trim()) {
      void message.warning(t('snippet_settings.message.name_required'));
      return;
    }
    if (!draft.body.trim()) {
      void message.warning(t('snippet_settings.message.body_required'));
      return;
    }

    const duplicate = sqlSnippets.find(
      (s) => s.prefix.toLowerCase() === prefix && s.id !== draft.id,
    );
    if (duplicate) {
      void message.warning(t('snippet_settings.message.prefix_duplicate', { prefix }));
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
    void message.success(t('snippet_settings.message.saved'));
  }, [draft, sqlSnippets, saveSqlSnippet, t]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteSqlSnippet(id);
      if (selectedId === id) {
        setSelectedId(null);
        setDraft(emptyDraft());
      }
      void message.success(t('snippet_settings.message.deleted'));
    },
    [deleteSqlSnippet, selectedId, t],
  );

  const handleReset = useCallback(
    (id: string) => {
      resetBuiltinSqlSnippet(id);
      const original = BUILTIN_SNIPPET_MAP[id];
      if (original && selectedId === id) {
        setDraft({ ...original, syntaxHelp: original.syntaxHelp || '' });
      }
      void message.success(t('snippet_settings.message.reset_default'));
    },
    [resetBuiltinSqlSnippet, selectedId, t],
  );

  const syntaxHelpItems = useMemo(
    () => [
      {
        key: 'snippet-help',
        label: t('snippet_settings.syntax_help.label'),
        children: (
          <Input.TextArea
            data-sql-snippet-syntax-help-editor="true"
            value={draft.syntaxHelp || ''}
            onChange={(e) => setDraft((d) => ({ ...d, syntaxHelp: e.target.value }))}
            placeholder={t('snippet_settings.syntax_help.placeholder')}
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
        label: t('snippet_settings.syntax_reference.label'),
        children: (
          <div style={{ fontSize: 12, lineHeight: 1.8, color: mutedColor, fontFamily: 'var(--gn-font-mono)' }}>
            <div>{t('snippet_settings.syntax_reference.first_tabstop')}</div>
            <div>{t('snippet_settings.syntax_reference.second_tabstop')}</div>
            <div>{t('snippet_settings.syntax_reference.final_cursor')}</div>
            <div>{t('snippet_settings.syntax_reference.linked_tabstop')}</div>
            <div style={{ marginTop: 6, fontWeight: 600, color: textColor }}>{t('snippet_settings.syntax_reference.builtin_variables')}</div>
            <div>{t('snippet_settings.syntax_reference.current_date')}</div>
            <div>{t('snippet_settings.syntax_reference.current_time')}</div>
            <div>{t('snippet_settings.syntax_reference.unix_seconds')}</div>
            <div>{t('snippet_settings.syntax_reference.uuid')}</div>
            <div>{t('snippet_settings.syntax_reference.random')}</div>
            <div style={{ marginTop: 8, fontFamily: 'inherit', color: textColor }}>
              {t('snippet_settings.syntax_reference.example')}
            </div>
          </div>
        ),
      },
    ],
    [draft.syntaxHelp, mutedColor, t, textColor],
  );

  const showEditor = isCreating || selectedSnippet;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
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
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: textColor }}>{t('app.tools.entry.snippets.title')}</div>
            <div style={{ fontSize: 12, color: mutedColor, lineHeight: 1.5 }}>
              {t('app.tools.entry.snippets.description')}
            </div>
          </div>
        </div>
      }
      open={open}
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
            {t('snippet_settings.list.title')}
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
                        {t('snippet_settings.tag.builtin')}
                      </Tag>
                    )}
                  </div>
                </List.Item>
              )}
            />
          </div>
          <div style={{ padding: 8 }}>
            <Button type="dashed" icon={<PlusOutlined />} block size="small" onClick={handleNew}>
              {newSnippetAction}
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
                  <div style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>{t('snippet_settings.field.prefix.label')}</div>
                  <Input
                    value={draft.prefix}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, prefix: e.target.value.toLowerCase() }))
                    }
                    placeholder={t('snippet_settings.field.prefix.placeholder')}
                    maxLength={20}
                    size="small"
                  />
                </div>
                <div style={{ flex: 0.6 }}>
                  <div style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>{t('snippet_settings.field.name.label')}</div>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder={t('snippet_settings.field.name.placeholder')}
                    maxLength={60}
                    size="small"
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>{t('snippet_settings.field.description.label')}</div>
                <Input
                  value={draft.description || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder={t('snippet_settings.field.description.placeholder')}
                  maxLength={200}
                  size="small"
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>{t('snippet_settings.field.body.label')}</div>
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
              {t('snippet_settings.empty_state', { action: newSnippetAction })}
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
            title={t('snippet_settings.confirm.reset.title')}
            description={t('snippet_settings.confirm.reset.description')}
            onConfirm={() => handleReset(draft.id)}
          >
            <Button icon={<UndoOutlined />} size="large" style={{ minWidth: 118 }}>
              {t('snippet_settings.action.reset')}
            </Button>
          </Popconfirm>
        )}
        {showEditor && !draft.isBuiltin && !isCreating && (
          <Popconfirm
            title={t('snippet_settings.confirm.delete.title')}
            description={t('snippet_settings.confirm.delete.description')}
            onConfirm={() => handleDelete(draft.id)}
          >
            <Button danger icon={<DeleteOutlined />} size="large" style={{ minWidth: 96 }}>
              {t('snippet_settings.action.delete')}
            </Button>
          </Popconfirm>
        )}
        {showEditor && (
          <Button type="primary" icon={<SaveOutlined />} size="large" style={{ minWidth: 96 }} onClick={handleSave}>
            {t('snippet_settings.action.save')}
          </Button>
        )}
        <Button size="large" style={{ minWidth: 96 }} onClick={onClose}>
          {t('snippet_settings.action.close')}
        </Button>
      </div>
    </Modal>
  );
}
