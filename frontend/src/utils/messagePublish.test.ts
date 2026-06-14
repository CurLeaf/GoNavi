import { describe, expect, it } from 'vitest';

import {
  buildMessagePublishCommand,
  createDefaultMessagePublishDraft,
} from './messagePublish';

describe('messagePublish', () => {
  it('builds a Kafka publish JSON command from JSON payload inputs', () => {
    const result = buildMessagePublishCommand(
      { type: 'kafka' },
      {
        destination: 'orders.events',
        keyMode: 'json',
        key: '{"tenant":"a"}',
        bodyMode: 'json',
        body: '{"id":1,"event":"created"}',
        headers: '{"x-env":"dev"}',
      },
    );

    expect(result.transportLabel).toBe('Kafka Topic');
    expect(result.destinationLabel).toBe('orders.events');
    expect(result.commandText).toContain('"publish": "orders.events"');
    expect(result.commandText).toContain('"tenant": "a"');
    expect(result.commandText).toContain('"id": 1');
    expect(result.commandText).toContain('"x-env": "dev"');
  });

  it('keeps Kafka text payloads as plain strings', () => {
    const result = buildMessagePublishCommand(
      { type: 'kafka' },
      {
        destination: 'logs.app',
        keyMode: 'text',
        key: 'tenant-a',
        bodyMode: 'text',
        body: 'hello gonavi',
        headers: '',
      },
    );

    expect(result.commandText).toContain('"key": "tenant-a"');
    expect(result.commandText).toContain('"value": "hello gonavi"');
  });

  it('rejects non-object Kafka headers', () => {
    expect(() => buildMessagePublishCommand(
      { type: 'kafka' },
      {
        destination: 'logs.app',
        bodyMode: 'json',
        body: '{"ok":true}',
        headers: '["bad"]',
      },
    )).toThrow('Headers 必须是 JSON 对象');
  });

  it('seeds Kafka default publish draft with a JSON body example', () => {
    expect(createDefaultMessagePublishDraft({ type: 'kafka' }, 'orders.events')).toMatchObject({
      destination: 'orders.events',
      keyMode: 'text',
      bodyMode: 'json',
    });
  });

  it('builds a RabbitMQ publish JSON command with routing and properties', () => {
    const result = buildMessagePublishCommand(
      { type: 'rabbitmq', connectionParams: 'defaultQueue=orders.queue&exchange=events.topic' },
      {
        destination: 'orders.queue',
        exchange: '',
        routingKey: '',
        bodyMode: 'json',
        body: '{"id":1,"event":"created"}',
        headers: '{"x-env":"dev"}',
        properties: '{"content_type":"application/json"}',
      },
    );

    expect(result.transportLabel).toBe('RabbitMQ Queue');
    expect(result.destinationLabel).toBe('orders.queue');
    expect(result.commandText).toContain('"publish": "orders.queue"');
    expect(result.commandText).toContain('"exchange": "events.topic"');
    expect(result.commandText).toContain('"routing_key": "orders.queue"');
    expect(result.commandText).toContain('"content_type": "application/json"');
  });

  it('seeds RabbitMQ default publish draft with defaultQueue and exchange', () => {
    expect(createDefaultMessagePublishDraft(
      { type: 'rabbitmq', connectionParams: 'defaultQueue=orders.queue&exchange=events.topic' },
      '',
    )).toMatchObject({
      destination: 'orders.queue',
      exchange: 'events.topic',
      routingKey: 'orders.queue',
      bodyMode: 'json',
    });
  });
});
