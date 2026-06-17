import React from 'react';
import { Select, Tooltip } from 'antd';

import { t as defaultTranslate } from '../i18n';
import { useOptionalI18n } from '../i18n/provider';

export type SqlEditorCommitMode = 'manual' | 'auto';

type SqlEditorAutoCommitDelayOption = {
  value: number;
  label: string;
} | {
  value: number;
  labelKey: string;
};

export const SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS: SqlEditorAutoCommitDelayOption[] = [
  { value: 0, labelKey: 'query_editor.transaction.delay.immediate' },
  { value: 3000, label: '3s' },
  { value: 5000, label: '5s' },
  { value: 10000, label: '10s' },
  { value: 30000, label: '30s' },
];

type QueryEditorTransactionSettingsProps = {
  isV2Ui: boolean;
  commitMode: SqlEditorCommitMode;
  autoCommitDelayMs: number;
  onCommitModeChange: (mode: SqlEditorCommitMode) => void;
  onAutoCommitDelayMsChange: (delayMs: number) => void;
};

const QueryEditorTransactionSettings: React.FC<QueryEditorTransactionSettingsProps> = ({
  isV2Ui,
  commitMode,
  autoCommitDelayMs,
  onCommitModeChange,
  onAutoCommitDelayMsChange,
}) => {
  const i18n = useOptionalI18n();
  const t = i18n?.t ?? defaultTranslate;
  const autoCommitDelayOptions = SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS.map((option) => ({
    value: option.value,
    label: 'labelKey' in option ? t(option.labelKey) : option.label,
  }));

  return (
    <>
      <Tooltip title={t('query_editor.transaction.mode.tooltip')}>
      <Select
        className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-transaction-mode-select' : undefined}
        style={isV2Ui ? undefined : { width: 78 }}
        value={commitMode}
        onChange={(mode) => onCommitModeChange(mode === 'auto' ? 'auto' : 'manual')}
        options={[
          { label: t('query_editor.transaction.mode.manual'), value: 'manual' },
          { label: t('query_editor.transaction.mode.auto'), value: 'auto' },
        ]}
      />
      </Tooltip>
      {commitMode === 'auto' && (
        <Select
          className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-transaction-delay-select' : undefined}
          style={isV2Ui ? undefined : { width: 68 }}
          value={autoCommitDelayMs}
          onChange={(delayMs) => onAutoCommitDelayMsChange(Number(delayMs))}
          options={autoCommitDelayOptions}
        />
      )}
    </>
  );
};

export default QueryEditorTransactionSettings;
