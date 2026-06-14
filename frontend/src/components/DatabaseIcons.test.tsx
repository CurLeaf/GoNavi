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

  it('includes Chroma in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('chroma');
    expect(getDbIconLabel('chroma')).toBe('Chroma');
    const markup = renderToStaticMarkup(<>{getDbIcon('chroma', undefined, 22)}</>);
    expect(markup).toContain('>Ch</text>');
  });

  it('includes Qdrant in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('qdrant');
    expect(getDbIconLabel('qdrant')).toBe('Qdrant');
    const markup = renderToStaticMarkup(<>{getDbIcon('qdrant', undefined, 22)}</>);
    expect(markup).toContain('>Qd</text>');
  });

  it('includes Apache IoTDB in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('iotdb');
    expect(getDbIconLabel('iotdb')).toBe('Apache IoTDB');
    const markup = renderToStaticMarkup(<>{getDbIcon('iotdb', undefined, 22)}</>);
    expect(markup).toContain('>Io</text>');
  });

  it('includes MQTT in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('mqtt');
    expect(getDbIconLabel('mqtt')).toBe('MQTT');
    const markup = renderToStaticMarkup(<>{getDbIcon('mqtt', undefined, 22)}</>);
    expect(markup).toContain('>Mq</text>');
  });

  it('includes Kafka in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('kafka');
    expect(getDbIconLabel('kafka')).toBe('Kafka');
    const markup = renderToStaticMarkup(<>{getDbIcon('kafka', undefined, 22)}</>);
    expect(markup).toContain('>Kf</text>');
  });

  it('includes RabbitMQ in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('rabbitmq');
    expect(getDbIconLabel('rabbitmq')).toBe('RabbitMQ');
    const markup = renderToStaticMarkup(<>{getDbIcon('rabbitmq', undefined, 22)}</>);
    expect(markup).toContain('>RM</text>');
  });

  it('includes GaussDB in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('gaussdb');
    expect(getDbIconLabel('gaussdb')).toBe('GaussDB');
    const markup = renderToStaticMarkup(<>{getDbIcon('gaussdb', undefined, 22)}</>);
    expect(markup).toContain('>GS</text>');
  });

  it('includes GoldenDB in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('goldendb');
    expect(getDbIconLabel('goldendb')).toBe('GoldenDB');
    const markup = renderToStaticMarkup(<>{getDbIcon('goldendb', undefined, 22)}</>);
    expect(markup).toContain('>GD</text>');
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
