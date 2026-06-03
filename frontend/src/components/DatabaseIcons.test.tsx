import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { DB_ICON_TYPES, getDbIcon, getDbIconLabel } from './DatabaseIcons';

describe('DatabaseIcons', () => {
  it('includes InterSystems IRIS in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('iris');
    expect(getDbIconLabel('iris')).toBe('InterSystems IRIS');
  });

  it('includes Elasticsearch in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('elasticsearch');
    expect(getDbIconLabel('elasticsearch')).toBe('Elasticsearch');
    const markup = renderToStaticMarkup(<>{getDbIcon('elasticsearch', undefined, 22)}</>);
    expect(markup).toContain('elasticsearch.svg');
    expect(markup).toContain('alt="elasticsearch"');
  });

  it('wraps database icons in a consistent frame for sidebar sizing', () => {
    const mysqlMarkup = renderToStaticMarkup(<>{getDbIcon('mysql', undefined, 22)}</>);
    const jvmMarkup = renderToStaticMarkup(<>{getDbIcon('jvm', undefined, 22)}</>);

    expect(mysqlMarkup).toContain('data-db-icon-frame="true"');
    expect(jvmMarkup).toContain('data-db-icon-frame="true"');
    expect(mysqlMarkup).toContain('width:22px');
    expect(jvmMarkup).toContain('width:22px');
  });
});
