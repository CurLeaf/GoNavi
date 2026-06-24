import React from "react";
import { useI18n } from "../i18n/provider";
import type { LanguagePreference } from "../i18n/types";

const groupStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const getOptionStyle = (selected: boolean): React.CSSProperties => ({
  minHeight: 44,
  borderRadius: 12,
  border: selected ? "1px solid rgba(255, 255, 255, 0.55)" : "1px solid rgba(160, 179, 209, 0.10)",
  background: selected
    ? "linear-gradient(180deg, #f7f9fd 0%, #dfe5f1 100%)"
    : "rgba(56, 64, 79, 0.78)",
  color: selected ? "#151922" : "#d3d9e6",
  padding: "10px 14px",
  fontSize: 14,
  fontWeight: 600,
  textAlign: "center",
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: selected ? "inset 0 1px 0 rgba(255, 255, 255, 0.5)" : "none",
});

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
      <div role="radiogroup" aria-label={t("settings.language.title")} style={groupStyle}>
        {options.map((option) => {
          const selected = option.value === preference;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreference(option.value)}
              style={getOptionStyle(selected)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, opacity: 0.64 }}>
        {t("settings.language.restart_hint")}
      </div>
    </div>
  );
};

export default LanguageSettingsPanel;
