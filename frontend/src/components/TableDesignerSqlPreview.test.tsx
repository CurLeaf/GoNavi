import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TableDesignerSqlPreview from './TableDesignerSqlPreview';

const mockMonaco = {
  editor: {
    defineTheme: vi.fn(),
  },
};

vi.mock('@monaco-editor/react', () => ({
  default: ({
    beforeMount,
    defaultLanguage,
    language,
    options,
    theme,
    value,
  }: {
    beforeMount?: (monaco: any) => void;
    defaultLanguage?: string;
    language?: string;
    options?: Record<string, any>;
    theme?: string;
    value?: string;
  }) => {
    beforeMount?.(mockMonaco);
    return (
      <div
        data-default-language={defaultLanguage}
        data-language={language}
        data-monaco-editor-mock="true"
        data-options={JSON.stringify(options)}
        data-theme={theme}
      >
        {value}
      </div>
    );
  },
}));

describe('TableDesignerSqlPreview', () => {
  beforeEach(() => {
    mockMonaco.editor.defineTheme.mockClear();
  });

  it('renders SQL changes in a read-only Monaco SQL editor with explicit syntax highlight theme', () => {
    const markup = renderToStaticMarkup(
      <TableDesignerSqlPreview
        sql={'ALTER TABLE "users"\nRENAME COLUMN "name" TO "display_name";'}
        darkMode={false}
      />,
    );

    expect(markup).toContain('data-table-designer-sql-preview="true"');
    expect(markup).toContain('data-monaco-editor-mock="true"');
    expect(markup).toContain('data-default-language="sql"');
    expect(markup).toContain('data-language="sql"');
    expect(markup).toContain('data-theme="gonavi-sql-preview-light"');
    expect(markup).toContain('&quot;readOnly&quot;:true');
    expect(markup).toContain('&quot;lineNumbers&quot;:&quot;on&quot;');
    expect(markup).toContain('ALTER TABLE');
    expect(markup).toContain('RENAME COLUMN');

    expect(mockMonaco.editor.defineTheme).toHaveBeenCalledWith(
      'gonavi-sql-preview-light',
      expect.objectContaining({
        base: 'vs',
        inherit: true,
        rules: expect.arrayContaining([
          expect.objectContaining({ token: 'keyword', foreground: expect.any(String) }),
          expect.objectContaining({ token: 'string', foreground: expect.any(String) }),
          expect.objectContaining({ token: 'comment', foreground: expect.any(String) }),
        ]),
      }),
    );
  });

  it('uses the dark SQL preview theme when dark mode is enabled', () => {
    const markup = renderToStaticMarkup(
      <TableDesignerSqlPreview sql="CREATE TABLE users (id int);" darkMode />,
    );

    expect(markup).toContain('data-theme="gonavi-sql-preview-dark"');
    expect(mockMonaco.editor.defineTheme).toHaveBeenCalledWith(
      'gonavi-sql-preview-dark',
      expect.objectContaining({
        base: 'vs-dark',
        inherit: true,
      }),
    );
  });
});
