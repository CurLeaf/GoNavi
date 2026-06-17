import zhCN from "../../../shared/i18n/zh-CN.json";
import zhTW from "../../../shared/i18n/zh-TW.json";
import enUS from "../../../shared/i18n/en-US.json";
import jaJP from "../../../shared/i18n/ja-JP.json";
import deDE from "../../../shared/i18n/de-DE.json";
import ruRU from "../../../shared/i18n/ru-RU.json";
import type { I18nParams, SupportedLanguage } from "./types";

export type I18nKey = keyof typeof enUS;
export type Catalog = Record<I18nKey, string>;

export const catalogs: Record<SupportedLanguage, Catalog> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "en-US": enUS,
  "ja-JP": jaJP,
  "de-DE": deDE,
  "ru-RU": ruRU,
};

export function getCatalogKeys(language: SupportedLanguage): string[] {
  return Object.keys(catalogs[language]).sort();
}

export function t(
  language: SupportedLanguage,
  key: I18nKey | string,
  params: I18nParams = {},
): string {
  const catalog = catalogs[language] as Record<string, string>;
  const fallbackCatalog = catalogs["en-US"] as Record<string, string>;
  let template = catalog[key] || fallbackCatalog[key] || key;
  Object.entries(params).forEach(([name, value]) => {
    template = template.split(`{{${name}}}`).join(value == null ? "" : String(value));
  });
  return template;
}
