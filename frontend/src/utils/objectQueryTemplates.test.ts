import { describe, expect, it } from 'vitest';

import { buildTableSelectQuery } from './objectQueryTemplates';

describe('buildTableSelectQuery', () => {
  it('quotes uppercase postgres table names in new query templates', () => {
    expect(buildTableSelectQuery('postgres', 'public.MyTable')).toBe('SELECT * FROM public."MyTable";');
  });

  it('adds a preview limit for RocketMQ topic browsing', () => {
    expect(buildTableSelectQuery('rocketmq', 'orders.events')).toBe('SELECT * FROM "orders.events" LIMIT 100;');
  });

  it('adds a preview limit for Kafka topic browsing', () => {
    expect(buildTableSelectQuery('kafka', 'logs.app-1')).toBe('SELECT * FROM "logs.app-1" LIMIT 100;');
  });

  it('adds a preview limit for MQTT topic browsing', () => {
    expect(buildTableSelectQuery('mqtt', 'devices/+/telemetry')).toBe('SELECT * FROM "devices/+/telemetry" LIMIT 100;');
  });

  it('adds a preview limit for RabbitMQ queue browsing', () => {
    expect(buildTableSelectQuery('rabbitmq', 'orders.events.v1')).toBe('SELECT * FROM "orders.events.v1" LIMIT 100;');
  });
});
