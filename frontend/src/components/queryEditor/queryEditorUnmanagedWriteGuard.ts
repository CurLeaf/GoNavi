import { message } from 'antd';

import type { I18nParams } from '../../i18n/types';
import type { SavedConnection } from '../../types';
import { findPotentiallyMutatingConnectionStatements } from '../../utils/connectionReadOnly';
import { confirmProductionRisk } from '../../utils/productionRiskConfirm';

export const QUERY_EDITOR_UNMANAGED_WRITE_MESSAGE_KEY =
  'query_editor.transaction.message.executed_without_transaction';

type QueryEditorMutatingConfig = Parameters<typeof findPotentiallyMutatingConnectionStatements>[0];
type TranslateFn = (key: string, params?: I18nParams) => string;

export const findQueryEditorMutatingStatements = (
  config: QueryEditorMutatingConfig,
  sql: string,
): string[] => findPotentiallyMutatingConnectionStatements(config, sql);

/**
 * 以后端 `transactionPending` 为准。前端 `useManagedTransaction` 更宽松，
 * DDL / TRUNCATE / CALL / 存储过程会被后端降级为 autocommit，采信前端会误报成已托管。
 */
export const shouldWarnQueryEditorUnmanagedWrite = ({
  success,
  mutatingStatements,
  transactionPending,
}: {
  success?: boolean;
  mutatingStatements: readonly unknown[];
  transactionPending?: boolean | null;
}): boolean => (
  success === true
  && mutatingStatements.length > 0
  && !transactionPending
);

export const warnIfQueryEditorUnmanagedWrite = (
  input: {
    success?: boolean;
    mutatingStatements: readonly unknown[];
    transactionPending?: boolean | null;
  },
  translate: TranslateFn,
): void => {
  if (!shouldWarnQueryEditorUnmanagedWrite(input)) {
    return;
  }
  message.warning(translate(QUERY_EDITOR_UNMANAGED_WRITE_MESSAGE_KEY), 6);
};

/**
 * 生产确认与不可撤销提示必须共用这一次解析结果，避免边界 SQL 上两者漂移。
 */
export const confirmQueryEditorMutatingSql = async ({
  connection,
  sql,
  target,
  translate,
}: {
  connection: SavedConnection;
  sql: string;
  target: string;
  translate: TranslateFn;
}): Promise<{ approved: boolean; mutatingStatements: string[] }> => {
  const mutatingStatements = findQueryEditorMutatingStatements(connection.config, sql);
  if (mutatingStatements.length === 0) {
    return { approved: true, mutatingStatements };
  }
  const approved = await confirmProductionRisk({
    connection,
    action: translate('connection.production_risk.action.execute_sql'),
    target,
    translate,
  });
  return { approved, mutatingStatements };
};
