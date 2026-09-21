import { t as translate } from '../../../i18n';
import type { connection } from '../../../../wailsjs/go/models';
import type { QueryParamBindingInput } from './queryEditorParamsModel';

type GoAppMethods = Record<string, ((...args: unknown[]) => Promise<unknown>) | undefined>;

export function hasQueryParamBindings(
  bindings?: QueryParamBindingInput[] | null,
): boolean {
  return Boolean(bindings && bindings.length > 0);
}

export function invokeWailsAppMethod(
  name: string,
  args: unknown[],
): Promise<connection.QueryResult> {
  const goApp = (window as unknown as {
    go?: { app?: { App?: GoAppMethods } };
  }).go?.app?.App;
  const fn = goApp?.[name];
  if (typeof fn !== 'function') {
    const messageKey = name.includes('Transaction')
      ? 'query_editor.params.unsupported_session'
      : 'query_editor.params.unsupported_driver';
    return Promise.reject(new Error(translate(messageKey)));
  }
  return fn(...args) as Promise<connection.QueryResult>;
}
