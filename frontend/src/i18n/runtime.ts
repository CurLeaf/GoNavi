import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "dayjs/locale/zh-tw";
import "dayjs/locale/ja";
import "dayjs/locale/de";
import "dayjs/locale/ru";
import type { SupportedLanguage } from "./types";

const appApi = () => (window as any)?.go?.app?.App;
const aiApi = () => (window as any)?.go?.aiservice?.Service;
let lastSyncedLanguage: SupportedLanguage | null = null;
let desiredLanguage: SupportedLanguage | null = null;
let activeSyncLoop: Promise<void> | null = null;

export function applyDayjsLocale(language: SupportedLanguage): void {
  const localeByLanguage: Record<SupportedLanguage, string> = {
    "zh-CN": "zh-cn",
    "zh-TW": "zh-tw",
    "en-US": "en",
    "ja-JP": "ja",
    "de-DE": "de",
    "ru-RU": "ru",
  };
  dayjs.locale(localeByLanguage[language] || "en");
}

export async function syncLanguageRuntime(language: SupportedLanguage): Promise<void> {
  desiredLanguage = language;
  if (lastSyncedLanguage === language) {
    return;
  }
  if (activeSyncLoop) {
    return activeSyncLoop;
  }

  activeSyncLoop = (async () => {
    while (desiredLanguage && desiredLanguage !== lastSyncedLanguage) {
      const targetLanguage: SupportedLanguage = desiredLanguage;
      applyDayjsLocale(targetLanguage);

      const tasks: Promise<unknown>[] = [];
      const app = appApi();
      if (typeof app?.SetLanguage === "function") {
        tasks.push(app.SetLanguage(targetLanguage));
      }
      const ai = aiApi();
      if (typeof ai?.AISetLanguage === "function") {
        tasks.push(ai.AISetLanguage(targetLanguage));
      }

      const results = await Promise.allSettled(tasks);
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length > 0) {
        console.warn("[i18n] failed to sync language runtime", failures);
        if (desiredLanguage === targetLanguage) {
          break;
        }
        continue;
      }

      lastSyncedLanguage = targetLanguage;
    }
  })();

  try {
    await activeSyncLoop;
  } finally {
    activeSyncLoop = null;
  }
}
