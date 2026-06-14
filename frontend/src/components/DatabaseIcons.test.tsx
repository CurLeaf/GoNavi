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
    expect(markup).toContain('chroma.svg');
    expect(markup).toContain('alt="chroma"');
  });

  it('includes Qdrant in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('qdrant');
    expect(getDbIconLabel('qdrant')).toBe('Qdrant');
    const markup = renderToStaticMarkup(<>{getDbIcon('qdrant', undefined, 22)}</>);
    expect(markup).toContain('qdrant.svg');
    expect(markup).toContain('alt="qdrant"');
  });

  it('includes Apache IoTDB in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('iotdb');
    expect(getDbIconLabel('iotdb')).toBe('Apache IoTDB');
    const markup = renderToStaticMarkup(<>{getDbIcon('iotdb', undefined, 22)}</>);
    expect(markup).toContain('iotdb.svg');
    expect(markup).toContain('alt="iotdb"');
  });

  it('includes RocketMQ in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('rocketmq');
    expect(getDbIconLabel('rocketmq')).toBe('RocketMQ');
    const markup = renderToStaticMarkup(<>{getDbIcon('rocketmq', undefined, 22)}</>);
    expect(markup).toContain('rocketmq.svg');
    expect(markup).toContain('alt="rocketmq"');
  });

  it('includes MQTT in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('mqtt');
    expect(getDbIconLabel('mqtt')).toBe('MQTT');
    const markup = renderToStaticMarkup(<>{getDbIcon('mqtt', undefined, 22)}</>);
    expect(markup).toContain('mqtt.svg');
    expect(markup).toContain('alt="mqtt"');
  });

  it('includes Kafka in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('kafka');
    expect(getDbIconLabel('kafka')).toBe('Kafka');
    const markup = renderToStaticMarkup(<>{getDbIcon('kafka', undefined, 22)}</>);
    expect(markup).toContain('kafka.svg');
    expect(markup).toContain('alt="kafka"');
  });

  it('includes RabbitMQ in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('rabbitmq');
    expect(getDbIconLabel('rabbitmq')).toBe('RabbitMQ');
    const markup = renderToStaticMarkup(<>{getDbIcon('rabbitmq', undefined, 22)}</>);
    expect(markup).toContain('rabbitmq.svg');
    expect(markup).toContain('alt="rabbitmq"');
  });

  it('includes GaussDB in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('gaussdb');
    expect(getDbIconLabel('gaussdb')).toBe('GaussDB');
    const markup = renderToStaticMarkup(<>{getDbIcon('gaussdb', undefined, 22)}</>);
    expect(markup).toContain('gaussdb.svg');
    expect(markup).toContain('alt="gaussdb"');
  });

  it('includes GoldenDB in the selectable database icons', () => {
    expect(DB_ICON_TYPES).toContain('goldendb');
    expect(getDbIconLabel('goldendb')).toBe('GoldenDB');
    const markup = renderToStaticMarkup(<>{getDbIcon('goldendb', undefined, 22)}</>);
    expect(markup).toContain('goldendb.svg');
    expect(markup).toContain('alt="goldendb"');
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
