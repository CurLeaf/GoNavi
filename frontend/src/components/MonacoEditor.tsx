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

const isSelectionEmpty = (selection: any): boolean => (
  !selection
  || (
    Number(selection.startLineNumber) === Number(selection.endLineNumber)
    && Number(selection.startColumn) === Number(selection.endColumn)
  )
);

const stripSqlIdentifierQuotes = (value: string): string => {
  const text = String(value || '').trim();
  if (!text) return '';
  if ((text.startsWith('`') && text.endsWith('`'))
    || (text.startsWith('"') && text.endsWith('"'))
    || (text.startsWith('[') && text.endsWith(']'))) {
    return text.slice(1, -1).trim();
  }
  return text;
};

const splitSqlIdentifierPath = (raw: string): string[] => (
  String(raw || '')
    .split('.')
    .map(stripSqlIdentifierQuotes)
    .map((part) => part.trim())
    .filter(Boolean)
);

const resolveIdentifierWindowAtColumn = (
  lineContent: string,
  column: number,
): { start: number; end: number; text: string } | null => {
  const text = String(lineContent || '');
  if (!text) return null;
  const isIdentChar = (ch: string) => /[A-Za-z0-9_$`"\[\].]/.test(ch || '');
  let offset = Math.max(0, Math.min(text.length - 1, Number(column || 1) - 2));
  if (!isIdentChar(text[offset] || '')) {
    if (offset > 0 && isIdentChar(text[offset - 1] || '')) {
      offset -= 1;
    } else if (offset + 1 < text.length && isIdentChar(text[offset + 1] || '')) {
      offset += 1;
    } else {
      return null;
    }
  }
  let start = offset;
  while (start > 0 && isIdentChar(text[start - 1] || '')) start -= 1;
  let end = offset + 1;
  while (end < text.length && isIdentChar(text[end] || '')) end += 1;
  return start < end ? { start, end, text: text.slice(start, end).trim() } : null;
};

const isLikelyTableReferenceIdentifier = (
  lineContent: string,
  identifierStart: number,
): boolean => {
  const beforeIdentifier = String(lineContent || '').slice(0, Math.max(0, identifierStart));
  return /\b(?:from|join|update|into|delete\s+from|alter\s+table|drop\s+table|truncate\s+table)\s*$/i.test(beforeIdentifier);
};

const isOceanBaseOracleConnection = (connection: any): boolean => {
  const config = connection?.config || {};
  return String(config.type || '').trim().toLowerCase() === 'oceanbase'
    && String(config.oceanBaseProtocol || '').trim().toLowerCase() === 'oracle';
};

const installOceanBaseOracleNavigationFallback = (editor: any) => {
  const editorDomNode = editor?.getDomNode?.();
  if (!editorDomNode || editor.__gonaviObOracleNavigationFallbackInstalled) {
    return;
  }
  Object.defineProperty(editor, '__gonaviObOracleNavigationFallbackInstalled', {
    value: true,
    configurable: true,
  });

  const handleMouseDownCapture = (event: MouseEvent) => {
    if (event.button !== 0 || !(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }

    const store = useStore.getState();
    const activeTab = (store.tabs || []).find((tab: any) => tab.id === store.activeTabId);
    if (!activeTab || activeTab.type !== 'query') {
      return;
    }
    const connectionId = String(activeTab.connectionId || store.activeContext?.connectionId || '').trim();
    if (!connectionId) {
      return;
    }
    const connection = (store.connections || []).find((item: any) => item.id === connectionId);
    if (!isOceanBaseOracleConnection(connection)) {
      return;
    }

    const target = editor.getTargetAtClientPoint?.(event.clientX, event.clientY);
    const position = target?.position;
    if (!position) {
      return;
    }
    const model = editor.getModel?.();
    const lineContent = String(model?.getLineContent?.(position.lineNumber) || '');
    const identifier = resolveIdentifierWindowAtColumn(lineContent, position.column);
    if (!identifier || !identifier.text.includes('.')) {
      return;
    }
    if (!isLikelyTableReferenceIdentifier(lineContent, identifier.start)) {
      return;
    }

    const parts = splitSqlIdentifierPath(identifier.text);
    if (parts.length < 2) {
      return;
    }
    const schemaName = parts[parts.length - 2];
    const tableName = parts[parts.length - 1];
    if (!schemaName || !tableName) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    store.setActiveContext?.({ connectionId, dbName: schemaName });
    store.addTab?.({
      id: `${connectionId}-${schemaName}-table-${tableName}`,
      title: tableName,
      type: 'table',
      connectionId,
      dbName: schemaName,
      tableName,
      initialViewMode: 'fields',
      initialViewModeRequestId: String(Date.now()),
      objectType: 'table',
      returnToTabId: activeTab.id || undefined,
    });
  };

  editorDomNode.addEventListener('mousedown', handleMouseDownCapture, true);
  editor.onDidDispose?.(() => {
    editorDomNode.removeEventListener('mousedown', handleMouseDownCapture, true);
  });
};

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

const installPrintableInputFallback = (editor: any, monaco: any) => {
  const editorDomNode = editor?.getDomNode?.();
  if (!editorDomNode || editor.__gonaviPrintableInputFallbackInstalled) {
    return;
  }
  const input = editorDomNode.querySelector?.('textarea.inputarea, .inputarea textarea, textarea') as HTMLTextAreaElement | null;
  if (!(input instanceof HTMLTextAreaElement)) {
    return;
  }
  Object.defineProperty(editor, '__gonaviPrintableInputFallbackInstalled', {
    value: true,
    configurable: true,
  });

  const isReadOnly = (): boolean => {
    try {
      const optionId = monaco?.editor?.EditorOption?.readOnly;
      return optionId !== undefined ? editor.getOption?.(optionId) === true : false;
    } catch {
      return false;
    }
  };

  const handleBeforeInput = (event: InputEvent) => {
    const text = String(event.data || '');
    if (
      event.defaultPrevented
      || event.isComposing
      || event.inputType !== 'insertText'
      || !text
      || text.length > 8
      || isReadOnly()
    ) {
      return;
    }

    const selectionBefore = editor.getSelection?.();
    if (!isSelectionEmpty(selectionBefore)) {
      return;
    }
    const beforeValue = String(editor.getValue?.() ?? '');
    const beforePosition = editor.getPosition?.();

    window.setTimeout(() => {
      const domNode = editor.getDomNode?.();
      if (!(domNode instanceof HTMLElement) || !domNode.isConnected || isReadOnly()) {
        return;
      }
      if (document.activeElement && !domNode.contains(document.activeElement)) {
        return;
      }
      const afterValue = String(editor.getValue?.() ?? '');
      const afterPosition = editor.getPosition?.();
      if (afterValue !== beforeValue || !sameEditorPosition(beforePosition, afterPosition)) {
        return;
      }
      editor.trigger?.('gonavi-printable-input-fallback', 'type', { text });
    }, 16);
  };

  input.addEventListener('beforeinput', handleBeforeInput);
  editor.onDidDispose?.(() => {
    input.removeEventListener('beforeinput', handleBeforeInput);
  });
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
    installOceanBaseOracleNavigationFallback(editor);
    patchQueryEditorAiInlineRightArrowFallback(editor, monaco);
    installPrintableInputFallback(editor, monaco);
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
