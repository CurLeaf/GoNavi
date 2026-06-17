import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import JVMChangePreviewModal from "./JVMChangePreviewModal";
import { getCurrentLanguage, setCurrentLanguage, t as translate } from "../../i18n";
import { I18nProvider } from "../../i18n/provider";

vi.mock("antd", () => {
  const Text = ({ children }: any) => <span>{children}</span>;
  const Modal = ({
    cancelText,
    children,
    okText,
    title,
  }: any) => (
    <section>
      <h1>{title}</h1>
      <button type="button">{okText}</button>
      <button type="button">{cancelText}</button>
      {children}
    </section>
  );
  const Descriptions: any = ({ children }: any) => <dl>{children}</dl>;
  Descriptions.Item = ({ children, label }: any) => (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );

  return {
    Alert: ({ description, message }: any) => (
      <div role="alert">
        {message}
        {description}
      </div>
    ),
    Descriptions,
    Modal,
    Space: ({ children }: any) => <div>{children}</div>,
    Tag: ({ children }: any) => <span>{children}</span>,
    Typography: { Text },
  };
});

const textContent = (node: any): string =>
  (node.children || [])
    .map((item: any) => (typeof item === "string" ? item : textContent(item)))
    .join("");

describe("JVMChangePreviewModal", () => {
  const previousLanguage = getCurrentLanguage();

  beforeEach(() => {
    vi.stubGlobal("window", {
      go: {
        app: {
          App: {},
        },
        aiservice: {
          Service: {},
        },
      },
    });
  });

  afterEach(() => {
    setCurrentLanguage(previousLanguage);
    vi.unstubAllGlobals();
  });

  it("localizes modal chrome and risk formatter through provider locale", async () => {
    setCurrentLanguage("en-US");

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <I18nProvider
          preference="en-US"
          systemLanguages={[]}
          onPreferenceChange={vi.fn()}
        >
          <JVMChangePreviewModal
            open
            applying={false}
            onCancel={vi.fn()}
            onConfirm={vi.fn()}
            preview={{
              allowed: false,
              requiresConfirmation: true,
              confirmationToken: "token-from-preview",
              summary: "",
              riskLevel: "high",
              blockingReason: "policy denied by raw backend",
              before: {
                resourceId: "jmx:/attribute/app/Mode",
                kind: "attribute",
                format: "string",
                value: "cold",
              },
              after: {
                resourceId: "jmx:/attribute/app/Mode",
                kind: "attribute",
                format: "string",
                value: "warm",
              },
            }}
          />
        </I18nProvider>,
      );
      await Promise.resolve();
    });

    const text = textContent(renderer!.root);
    expect(text).toContain(translate("jvm_change_preview_modal.title", undefined, "en-US"));
    expect(text).toContain(translate("jvm_change_preview_modal.action.confirm_execute", undefined, "en-US"));
    expect(text).toContain(translate("jvm_change_preview_modal.action.close", undefined, "en-US"));
    expect(text).toContain(translate("jvm_change_preview_modal.status.generated", undefined, "en-US"));
    expect(text).toContain(
      translate(
        "jvm_change_preview_modal.risk.label",
        {
          level: translate("jvm_change_preview_modal.risk.high", undefined, "en-US"),
        },
        "en-US",
      ),
    );
    expect(text).toContain(translate("jvm_change_preview_modal.permission.forbidden", undefined, "en-US"));
    expect(text).toContain("policy denied by raw backend");
    expect(text).toContain("jmx:/attribute/app/Mode");
    expect(text).not.toContain("JVM 变更预览");
    expect(text).not.toContain("确认执行");
    expect(text).not.toContain("风险 高");
  });
});
