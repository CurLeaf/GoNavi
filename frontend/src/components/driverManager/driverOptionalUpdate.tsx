import { Button } from 'antd';
import { t } from '../../i18n';

export type DriverOptionalUpdateStatus = {
  builtIn: boolean;
  needsUpdate?: boolean;
  optionalUpdate?: boolean;
  expectedRevision?: string;
  connectable: boolean;
  runtimeAvailable: boolean;
  packageInstalled: boolean;
  pinnedVersion?: string;
  updateReason?: string;
  message?: string;
};

export const OPTIONAL_UPDATE_DISMISS_KEY = 'gonavi.driver.optionalUpdate.dismissedRevision';

export const readOptionalUpdateDismissedRevisions = (): string[] => {
  try {
    const raw = window.localStorage.getItem(OPTIONAL_UPDATE_DISMISS_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
  } catch {
    return [];
  }
};

export const dismissOptionalUpdateRevision = (current: string[], expectedRevision: string): string[] => {
  const revision = expectedRevision.trim();
  if (!revision) {
    return current;
  }
  const nextDismissed = Array.from(new Set([...current, revision]));
  try {
    window.localStorage.setItem(OPTIONAL_UPDATE_DISMISS_KEY, JSON.stringify(nextDismissed));
  } catch {
    // localStorage 不可用时只在本次会话内隐藏。
  }
  return nextDismissed;
};

export const isOptionalUpdateVisible = (
  row: DriverOptionalUpdateStatus,
  dismissedRevisions: string[],
): boolean => !!row.optionalUpdate && !!row.expectedRevision && !dismissedRevisions.includes(row.expectedRevision);

const containsCjkText = (value: string) => /[\u3400-\u9fff]/.test(value);

const appendRawNonChineseDetail = (parts: string[], value: unknown) => {
  const text = String(value || '').trim();
  if (!text || containsCjkText(text) || parts.includes(text)) {
    return;
  }
  parts.push(text);
};

export const formatDriverCardStatusMessage = (
  row: DriverOptionalUpdateStatus,
  dismissedRevisions: string[] = [],
): string => {
  const parts: string[] = [];
  if (row.builtIn) {
    parts.push(t('driver.modal.card.status.builtIn'));
  } else if (row.needsUpdate) {
    parts.push(t('driver.modal.card.status.needsUpdate'));
    appendRawNonChineseDetail(parts, row.updateReason);
    appendRawNonChineseDetail(parts, row.message);
  } else if (isOptionalUpdateVisible(row, dismissedRevisions)) {
    parts.push(t('driver_manager.status.optional_component_update'));
    appendRawNonChineseDetail(parts, row.message);
  } else if (row.connectable || row.runtimeAvailable) {
    parts.push(t('driver.modal.card.status.runtimeAvailable'));
    appendRawNonChineseDetail(parts, row.message);
  } else if (row.packageInstalled) {
    parts.push(t('driver.modal.card.status.installedPending'));
    appendRawNonChineseDetail(parts, row.message);
  } else {
    parts.push(t('driver.modal.card.status.notEnabled'));
    appendRawNonChineseDetail(parts, row.message);
  }
  return parts.join(' ');
};

export function DriverOptionalUpdateDismissButton({
  row,
  dismissedRevisions,
  disabled,
  size,
  onDismissed,
}: {
  row: DriverOptionalUpdateStatus;
  dismissedRevisions: string[];
  disabled?: boolean;
  size?: 'small' | 'middle' | 'large';
  onDismissed: (next: string[]) => void;
}) {
  if (!isOptionalUpdateVisible(row, dismissedRevisions) || !row.expectedRevision) {
    return null;
  }
  const expectedRevision = row.expectedRevision;
  return (
    <Button
      size={size}
      type="text"
      disabled={disabled}
      onClick={() => onDismissed(dismissOptionalUpdateRevision(dismissedRevisions, expectedRevision))}
    >
      {t('driver_manager.message.optional_update_dismiss')}
    </Button>
  );
}
