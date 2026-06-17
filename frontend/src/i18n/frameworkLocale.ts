import enUS from "antd/locale/en_US";
import deDE from "antd/locale/de_DE";
import jaJP from "antd/locale/ja_JP";
import ruRU from "antd/locale/ru_RU";
import zhCN from "antd/locale/zh_CN";
import zhTW from "antd/locale/zh_TW";
import type { SupportedLanguage } from "./types";

export function getAntdLocale(language: SupportedLanguage) {
  switch (language) {
    case "zh-CN":
      return zhCN;
    case "zh-TW":
      return zhTW;
    case "ja-JP":
      return jaJP;
    case "de-DE":
      return deDE;
    case "ru-RU":
      return ruRU;
    default:
      return enUS;
  }
}
