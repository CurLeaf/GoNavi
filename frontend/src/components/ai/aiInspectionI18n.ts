import type { I18nParams } from '../../i18n';
import { t as translateCatalog } from '../../i18n';

export type AIInspectionTranslator = (key: string, params?: I18nParams) => string;

export const translateInspectionCopy = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
  params?: I18nParams,
): string => {
  const t = translate || ((catalogKey, catalogParams) => translateCatalog(catalogKey, catalogParams, 'en-US'));
  const translated = t(key, params);
  return translated && translated !== key ? translated : fallback;
};
