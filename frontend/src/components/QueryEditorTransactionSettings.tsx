import React from 'react';
import { Select, Tooltip } from 'antd';

import { t as defaultTranslate } from '../i18n';
import { useOptionalI18n } from '../i18n/provider';

export type SqlEditorCommitMode = 'manual' | 'auto';

type SqlEditorAutoCommitDelayOption = {
  value: number;
};

export const SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS: SqlEditorAutoCommitDelayOption[] = [
  { value: 0 },
  { value: 3000 },
  { value: 5000 },
  { value: 10000 },
  { value: 30000 },
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
  const [isModeSelectOpen, setIsModeSelectOpen] = React.useState(false);
  const [isModeTooltipOpen, setIsModeTooltipOpen] = React.useState(false);
  const autoCommitDelayOptions = SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS.map((option) => ({
    value: option.value,
    label: option.value === 0
      ? t('query_editor.transaction.delay.immediate_commit')
      : t('query_editor.transaction.delay.seconds_commit', { seconds: Math.round(option.value / 1000) }),
  }));
  const handleModeSelectOpenChange = (open: boolean) => {
    setIsModeSelectOpen(open);
    if (open) {
      setIsModeTooltipOpen(false);
    }
  };
  const handleModeTooltipOpenChange = (open: boolean) => {
    setIsModeTooltipOpen(open);
  };

  return (
    <>
      <Tooltip
        title={t('query_editor.transaction.mode.tooltip')}
        open={isModeTooltipOpen && !isModeSelectOpen}
        onOpenChange={handleModeTooltipOpenChange}
      >
      <Select
        className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-transaction-mode-select' : undefined}
        style={isV2Ui ? undefined : { width: 78 }}
        value={commitMode}
        onOpenChange={handleModeSelectOpenChange}
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
