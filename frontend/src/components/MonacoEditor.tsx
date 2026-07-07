import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Editor, { loader, type BeforeMount, type EditorProps, type OnMount } from '@monaco-editor/react';
import { useStore } from '../store';
import { sanitizeDataTableFontSize } from '../utils/dataGridDisplay';
import { DEFAULT_MONO_FONT_FAMILY } from '../utils/fontFamilies';

export type { BeforeMount, OnMount } from '@monaco-editor/react';
export type GonaviMonacoTypography = 'code' | 'data';

const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 20;
const QUERY_EDITOR_AI_INLINE_CONTEXT_KEY = 'gonaviAiInlineSuggestionVisible';
let monacoConfiguredPromise: Promise<void> | null = null;
let transparentThemesRegistered = false;

const isTestRuntime = (): boolean => {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env || {};
  return env.MODE === 'test' || env.VITEST === true || env.VITEST === 'true';
};

const sameEditorPosition = (left: any, right: any): boolean => (
  Number(left?.lineNumber) === Number(right?.lineNumber)
  && Number(left?.column) === Number(right?.column)
);

const patchQueryEditorAiInlineRightArrowFallback = (editor: any, monaco: any) => {
  const originalAddCommand = editor?.addCommand?.bind?.(editor);
  if (!originalAddCommand || !monaco?.KeyCode?.RightArrow) {
    return;
  }
  if (editor.__gonaviAiInlineRightArrowFallbackPatched) {
    return;
  }
  Object.defineProperty(editor, '__gonaviAiInlineRightArrowFallbackPatched', {
    value: true,
    configurable: true,
  });

  editor.addCommand = (keybinding: any, handler: any, context: any) => {
    if (
      keybinding === monaco.KeyCode.RightArrow
      && context === QUERY_EDITOR_AI_INLINE_CONTEXT_KEY
      && typeof handler === 'function'
    ) {
      return originalAddCommand(keybinding, (...args: any[]) => {
        const beforePosition = editor.getPosition?.();
        const beforeValue = String(editor.getValue?.() ?? '');
        const result = handler(...args);
        const afterPosition = editor.getPosition?.();
        const afterValue = String(editor.getValue?.() ?? '');
        if (beforeValue === afterValue && sameEditorPosition(beforePosition, afterPosition)) {
          editor.trigger?.('gonavi-ai-inline-fallback', 'cursorRight', null);
        }
        return result;
      }, context);
    }
    return originalAddCommand(keybinding, handler, context);
  };
};

export const registerGonaviMonacoThemes: BeforeMount = (monaco) => {
  if (transparentThemesRegistered) {
    return;
  }

  monaco.editor.defineTheme('transparent-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#00000000',
      'editor.lineHighlightBackground': '#ffffff10',
      'editorGutter.background': '#00000000',
      'editorStickyScroll.background': '#1e1e1e',
      'editorStickyScrollHover.background': '#2a2a2a',
    },
  });
  monaco.editor.defineTheme('transparent-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#00000000',
      'editor.lineHighlightBackground': '#00000010',
      'editorGutter.background': '#00000000',
      'editorStickyScroll.background': '#ffffff',
      'editorStickyScrollHover.background': '#f5f5f5',
    },
  });

  transparentThemesRegistered = true;
};

const ensureMonacoConfigured = (): Promise<void> => {
  if (isTestRuntime()) {
    return Promise.resolve();
  }

  if (!monacoConfiguredPromise) {
    monacoConfiguredPromise = import('monaco-editor/esm/nls.messages.zh-cn')
      .then(() => import('monaco-editor'))
      .then((monaco) => {
        loader.config({ monaco });
      });
  }

  return monacoConfiguredPromise;
};

interface MonacoEditorProps extends EditorProps {
  gonaviTypography?: GonaviMonacoTypography;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({
  beforeMount,
  gonaviTypography = 'code',
  loading,
  onMount,
  options,
  ...props
}) => {
  const [ready, setReady] = useState(isTestRuntime);
  const uiVersion = useStore((state) => state.appearance.uiVersion);
  const dataTableFontSize = useStore((state) => state.appearance.dataTableFontSize);
  const dataTableFontSizeFollowGlobal = useStore((state) => state.appearance.dataTableFontSizeFollowGlobal);
  const monoFontFamily = useStore((state) => state.appearance.customMonoFontFamily);
  const globalFontSize = useStore((state) => state.fontSize);

  useEffect(() => {
    let cancelled = false;

    void ensureMonacoConfigured()
      .then(() => {
        if (!cancelled) {
          setReady(true);
        }
      })
      .catch((error) => {
        console.error('Failed to configure Monaco Editor', error);
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    registerGonaviMonacoThemes(monaco);
    beforeMount?.(monaco);
  }, [beforeMount]);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    patchQueryEditorAiInlineRightArrowFallback(editor, monaco);
    onMount?.(editor, monaco);
  }, [onMount]);

  const resolvedOptions = useMemo(() => {
    if (uiVersion !== 'v2') {
      return {
        ...options,
        editContext: false,
      };
    }

    const effectiveGlobalFontSize = Math.min(
      MAX_FONT_SIZE,
      Math.max(MIN_FONT_SIZE, Math.round(Number(globalFontSize) || DEFAULT_FONT_SIZE)),
    );
    const effectiveDataTableFontSize = dataTableFontSizeFollowGlobal !== false
      ? effectiveGlobalFontSize
      : (sanitizeDataTableFontSize(dataTableFontSize) ?? effectiveGlobalFontSize);
    const resolvedFontSize = gonaviTypography === 'data'
      ? effectiveDataTableFontSize
      : Math.max(10, Math.round(effectiveDataTableFontSize * 0.92));
    const effectiveEditorFontSize = Math.max(
      10,
      Math.round(Number(options?.fontSize) || resolvedFontSize),
    );

    return {
      ...options,
      editContext: false,
      fontFamily: options?.fontFamily ?? monoFontFamily ?? DEFAULT_MONO_FONT_FAMILY,
      fontSize: options?.fontSize ?? resolvedFontSize,
      lineHeight: options?.lineHeight ?? Math.max(18, Math.round(effectiveEditorFontSize * 1.62)),
    };
  }, [
    dataTableFontSize,
    dataTableFontSizeFollowGlobal,
    globalFontSize,
    gonaviTypography,
    monoFontFamily,
    options,
    uiVersion,
  ]);

  if (!ready) {
    return (
      <div
        data-monaco-editor-loading="true"
        style={{ height: props.height || '100%', width: props.width || '100%' }}
      >
        {loading || null}
      </div>
    );
  }

  return (
    <Editor
      {...props}
      options={resolvedOptions}
      loading={loading}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
    />
  );
};

export default MonacoEditor;
