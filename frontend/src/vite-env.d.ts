/// <reference types="vite/client" />

declare module 'monaco-editor/esm/nls.messages.zh-cn';

interface ImportMetaEnv {
  readonly VITE_GONAVI_ENABLE_MAC_WINDOW_DIAGNOSTICS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
