import Editor, { type BeforeMount } from '@monaco-editor/react';

interface TableDesignerSqlPreviewProps {
  sql: string;
  darkMode?: boolean;
  height?: string | number;
}

const SQL_PREVIEW_LIGHT_THEME = 'gonavi-sql-preview-light';
const SQL_PREVIEW_DARK_THEME = 'gonavi-sql-preview-dark';

const registerSqlPreviewThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(SQL_PREVIEW_LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '006C9C', fontStyle: 'bold' },
      { token: 'operator', foreground: '8250DF' },
      { token: 'number', foreground: 'B45309' },
      { token: 'string', foreground: '15803D' },
      { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
      { token: 'predefined', foreground: '0F766E' },
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.lineHighlightBackground': '#0F172A0A',
      'editorGutter.background': '#00000000',
      'editorLineNumber.foreground': '#94A3B8',
    },
  });

  monaco.editor.defineTheme(SQL_PREVIEW_DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '7DD3FC', fontStyle: 'bold' },
      { token: 'operator', foreground: 'C4B5FD' },
      { token: 'number', foreground: 'FDBA74' },
      { token: 'string', foreground: '86EFAC' },
      { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' },
      { token: 'predefined', foreground: '5EEAD4' },
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.lineHighlightBackground': '#FFFFFF12',
      'editorGutter.background': '#00000000',
      'editorLineNumber.foreground': '#64748B',
    },
  });
};

const TableDesignerSqlPreview: React.FC<TableDesignerSqlPreviewProps> = ({
  sql,
  darkMode = false,
  height = '360px',
}) => (
  <div
    data-table-designer-sql-preview="true"
    style={{
      maxHeight: 400,
      overflow: 'hidden',
      borderRadius: 8,
      border: darkMode ? '1px solid #333' : '1px solid #eee',
    }}
  >
    <Editor
      beforeMount={registerSqlPreviewThemes}
      defaultLanguage="sql"
      height={height}
      language="sql"
      options={{
        automaticLayout: true,
        fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
        fontSize: 13,
        lineNumbers: 'on',
        minimap: { enabled: false },
        padding: { top: 8, bottom: 8 },
        readOnly: true,
        scrollBeyondLastLine: false,
        wordWrap: 'on',
      }}
      theme={darkMode ? SQL_PREVIEW_DARK_THEME : SQL_PREVIEW_LIGHT_THEME}
      value={sql}
    />
  </div>
);

export default TableDesignerSqlPreview;
