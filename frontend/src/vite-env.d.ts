/// <reference types="vite/client" />

declare module 'monaco-editor/esm/nls.messages.zh-cn' { const messages: Record<string, string>; export default messages; }

interface ImportMetaEnv {
  readonly VITE_GONAVI_ENABLE_MAC_WINDOW_DIAGNOSTICS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
