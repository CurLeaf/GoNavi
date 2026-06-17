export type SupportedLanguage = "zh-CN" | "zh-TW" | "en-US" | "ja-JP" | "de-DE" | "ru-RU";
export type LanguagePreference = "system" | SupportedLanguage;
export type I18nParams = Record<string, string | number | boolean | null | undefined>;
