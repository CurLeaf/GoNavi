type StoredSecretPlaceholderOptions = {
  hasStoredSecret?: boolean;
  emptyPlaceholder: string;
  retainedLabel: string;
};

type ConnectionTestFailureKind =
  | 'validation'
  | 'runtime'
  | 'driver_unavailable'
  | 'secret_blocked';

type ConnectionTestFailureFeedback = {
  message: string;
  shouldToast: boolean;
};

const normalizeText = (value: unknown, fallback = ''): string => {
  const text = String(value ?? '').trim();
  if (!text || text === 'undefined' || text === 'null') {
    return fallback;
  }
  return text;
};

export const getStoredSecretPlaceholder = ({
  hasStoredSecret,
  emptyPlaceholder,
  retainedLabel,
}: StoredSecretPlaceholderOptions): string => (
  hasStoredSecret
    ? `••••••（留空表示继续沿用${retainedLabel}）`
    : emptyPlaceholder
);

export const normalizeConnectionSecretErrorMessage = (
  value: unknown,
  fallback = '',
): string => {
  const text = normalizeText(value, fallback);
  const lower = text.toLowerCase();

  if (lower.includes('saved connection not found:')) {
    return '未找到当前连接对应的已保存密文，请编辑当前连接，并输入密码后保存';
  }
  if (lower.includes('secret store unavailable')) {
    return '系统密文存储当前不可用，请检查系统钥匙串或凭据管理器后再试';
  }

  return text;
};

export const resolveConnectionTestFailureFeedback = ({
  kind,
  reason,
  fallback,
}: {
  kind: ConnectionTestFailureKind;
  reason: unknown;
  fallback: string;
}): ConnectionTestFailureFeedback => {
  if (kind === 'validation') {
    return {
      message: '测试失败: 请先完善必填项后再测试连接',
      shouldToast: false,
    };
  }

  return {
    message: `测试失败: ${normalizeConnectionSecretErrorMessage(reason, fallback)}`,
    shouldToast: true,
  };
};

export type {
  ConnectionTestFailureFeedback,
  ConnectionTestFailureKind,
};
