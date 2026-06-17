import React from "react";
import { Segmented } from "antd";
import { useI18n } from "../i18n/provider";
import type { LanguagePreference } from "../i18n/types";

const LanguageSettingsPanel: React.FC = () => {
  const { preference, setPreference, t } = useI18n();

  const options: { label: string; value: LanguagePreference }[] = [
    { label: t("settings.language.follow_system"), value: "system" },
    { label: t("settings.language.simplified_chinese"), value: "zh-CN" },
    { label: t("settings.language.traditional_chinese"), value: "zh-TW" },
    { label: t("settings.language.english"), value: "en-US" },
    { label: t("settings.language.japanese"), value: "ja-JP" },
    { label: t("settings.language.german"), value: "de-DE" },
    { label: t("settings.language.russian"), value: "ru-RU" },
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{t("settings.language.title")}</div>
        <div style={{ fontSize: 12, opacity: 0.72 }}>{t("settings.language.description")}</div>
      </div>
      <Segmented
        aria-label={t("settings.language.title")}
        block
        options={options}
        value={preference}
        onChange={(value) => setPreference(value as LanguagePreference)}
      />
      <div style={{ fontSize: 12, opacity: 0.64 }}>
        {t("settings.language.restart_hint")}
      </div>
    </div>
  );
};

export default LanguageSettingsPanel;
