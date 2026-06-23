import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider, useI18n } from "./provider";

const syncLanguageMock = vi.fn(async (_language: string) => undefined);

vi.mock("./runtime", () => ({
  syncLanguageRuntime: (language: string) => syncLanguageMock(language),
}));

const Probe: React.FC = () => {
  const { language, preference, setPreference, t } = useI18n();
  return (
    <button
      data-language={language}
      data-preference={preference}
      onClick={() => setPreference("en-US")}
    >
      {t("settings.language.title")}
    </button>
  );
};

describe("I18nProvider", () => {
  it("resolves system language, translates text, and syncs runtime", async () => {
    syncLanguageMock.mockClear();

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <I18nProvider
          preference="system"
          systemLanguages={["zh-CN"]}
          onPreferenceChange={() => undefined}
        >
          <Probe />
        </I18nProvider>,
      );
    });

    const button = renderer!.root.findByType("button");
    expect(button.props["data-language"]).toBe("zh-CN");
    expect(button.children).toEqual(["语言"]);
    expect(syncLanguageMock).toHaveBeenCalledWith("zh-CN");
  });

  it("emits preference changes without exposing resolved language as writable state", async () => {
    const onPreferenceChange = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <I18nProvider
          preference="zh-CN"
          systemLanguages={["zh-CN"]}
          onPreferenceChange={onPreferenceChange}
        >
          <Probe />
        </I18nProvider>,
      );
    });

    await act(async () => {
      renderer!.root.findByType("button").props.onClick();
    });

    expect(onPreferenceChange).toHaveBeenCalledWith("en-US");
  });
});
