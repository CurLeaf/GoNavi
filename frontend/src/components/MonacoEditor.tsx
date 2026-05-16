import React, { useCallback, useEffect, useState } from 'react';
import Editor, { loader, type BeforeMount, type EditorProps } from '@monaco-editor/react';

export type { BeforeMount, OnMount } from '@monaco-editor/react';

let monacoConfiguredPromise: Promise<void> | null = null;
let transparentThemesRegistered = false;

const isTestRuntime = (): boolean => {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env || {};
  return env.MODE === 'test' || env.VITEST === true || env.VITEST === 'true';
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

const MonacoEditor: React.FC<EditorProps> = ({ beforeMount, loading, ...props }) => {
  const [ready, setReady] = useState(isTestRuntime);

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

  return <Editor {...props} loading={loading} beforeMount={handleBeforeMount} />;
};

export default MonacoEditor;
