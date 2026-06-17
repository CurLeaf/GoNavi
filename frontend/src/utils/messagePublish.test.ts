import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  buildMessagePublishCommand,
  createDefaultMessagePublishDraft,
  getMessagePublishPresentation,
} from './messagePublish';

const messagePublishSource = readFileSync(new URL('./messagePublish.ts', import.meta.url), 'utf8');

describe('messagePublish', () => {
  it('localizes presentation copy through the supplied translator while keeping transport names raw', () => {
    const t = (key: string) => key;

    expect(getMessagePublishPresentation({ type: 'rabbitmq' }, t)).toMatchObject({
      transportLabel: 'RabbitMQ Queue',
      destinationLabel: 'Queue',
      destinationPlaceholder: 'message_publish.presentation.rabbitmq.destination_placeholder',
      destinationRequiredMessage: 'message_publish.presentation.rabbitmq.destination_required',
      alertMessage: 'message_publish.presentation.rabbitmq.alert',
      successHint: 'message_publish.presentation.rabbitmq.success_hint',
      keyLabel: 'message_publish.presentation.key_label',
    });

    expect(getMessagePublishPresentation({ type: 'rocketmq' }, t)).toMatchObject({
      transportLabel: 'RocketMQ Topic',
      destinationLabel: 'Topic',
      destinationPlaceholder: 'message_publish.presentation.rocketmq.destination_placeholder',
      destinationRequiredMessage: 'message_publish.presentation.topic_required',
      alertMessage: 'message_publish.presentation.rocketmq.alert',
      successHint: 'message_publish.presentation.rocketmq.success_hint',
      keyLabel: 'message_publish.presentation.keys_label',
      keyPlaceholder: 'message_publish.presentation.rocketmq.key_placeholder',
      tagPlaceholder: 'message_publish.presentation.rocketmq.tag_placeholder',
    });

    expect(getMessagePublishPresentation({ type: 'mqtt' }, t)).toMatchObject({
      transportLabel: 'MQTT Topic',
      destinationLabel: 'Topic',
      destinationPlaceholder: 'message_publish.presentation.mqtt.destination_placeholder',
      destinationRequiredMessage: 'message_publish.presentation.topic_required',
      alertMessage: 'message_publish.presentation.mqtt.alert',
      successHint: 'message_publish.presentation.mqtt.success_hint',
      keyLabel: 'message_publish.presentation.key_label',
    });

    expect(getMessagePublishPresentation({ type: 'kafka' }, t)).toMatchObject({
      transportLabel: 'Kafka Topic',
      destinationLabel: 'Topic',
      destinationPlaceholder: 'message_publish.presentation.kafka.destination_placeholder',
      destinationRequiredMessage: 'message_publish.presentation.topic_required',
      alertMessage: 'message_publish.presentation.kafka.alert',
      successHint: 'message_publish.presentation.kafka.success_hint',
      keyLabel: 'message_publish.presentation.key_label',
      keyPlaceholder: 'message_publish.presentation.kafka.key_placeholder',
    });
  });

  it('keeps presentation copy out of hardcoded Chinese literals', () => {
    [
      '例如：orders.queue',
      '请输入 Queue',
      '当前表单会自动拼装 RabbitMQ publish JSON 命令',
      '留空 Exchange 时会使用默认交换机',
      '例如：orders.events',
      '请输入 Topic',
      '当前表单会自动拼装 RocketMQ publish JSON 命令',
      'Tag、Keys、Delay Level 与 Properties 会一并写入 RocketMQ 消息属性',
      '消息 Keys（可选）',
      '可输入多个 Key，使用逗号分隔',
      '例如：TagA',
      '例如：devices/device-001/telemetry',
      '当前表单会自动拼装 MQTT publish JSON 命令',
      'QoS 与 retain 可单独指定',
      '当前表单会自动拼装 Kafka publish JSON 命令',
      'Headers 会作为 Kafka Record Headers 一并发送',
      '消息 Key（可选）',
      '可留空；JSON 模式请输入一行合法 JSON',
    ].forEach((legacyText) => {
      expect(messagePublishSource).not.toContain(legacyText);
    });
  });

  it('keeps presentation keys in every locale catalog', () => {
    (['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const).forEach((locale) => {
      const catalog = JSON.parse(
        readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8'),
      ) as Record<string, string>;

      [
        'message_publish.presentation.rabbitmq.destination_placeholder',
        'message_publish.presentation.rabbitmq.destination_required',
        'message_publish.presentation.rabbitmq.alert',
        'message_publish.presentation.rabbitmq.success_hint',
        'message_publish.presentation.rocketmq.destination_placeholder',
        'message_publish.presentation.topic_required',
        'message_publish.presentation.rocketmq.alert',
        'message_publish.presentation.rocketmq.success_hint',
        'message_publish.presentation.keys_label',
        'message_publish.presentation.rocketmq.key_placeholder',
        'message_publish.presentation.rocketmq.tag_placeholder',
        'message_publish.presentation.mqtt.destination_placeholder',
        'message_publish.presentation.mqtt.alert',
        'message_publish.presentation.mqtt.success_hint',
        'message_publish.presentation.kafka.destination_placeholder',
        'message_publish.presentation.kafka.alert',
        'message_publish.presentation.kafka.success_hint',
        'message_publish.presentation.key_label',
        'message_publish.presentation.kafka.key_placeholder',
      ].forEach((key) => {
        expect(catalog[key]).toEqual(expect.any(String));
        expect(catalog[key].length).toBeGreaterThan(0);
      });

      [
        ['message_publish.presentation.rabbitmq.alert', 'RabbitMQ'],
        ['message_publish.presentation.rabbitmq.alert', 'Management API'],
        ['message_publish.presentation.rocketmq.alert', 'RocketMQ'],
        ['message_publish.presentation.rocketmq.alert', 'NameServer'],
        ['message_publish.presentation.mqtt.alert', 'MQTT'],
        ['message_publish.presentation.kafka.alert', 'Kafka'],
        ['message_publish.presentation.kafka.success_hint', 'Headers'],
        ['message_publish.presentation.key_label', 'Key'],
      ].forEach(([key, rawTerm]) => {
        expect(catalog[key]).toContain(rawTerm);
      });
    });
  });

  it('localizes command validation errors while preserving raw protocol details', () => {
    const t = (key: string, params?: Record<string, unknown>) => (
      params ? `${key} ${JSON.stringify(params)}` : key
    );

    expect(() => buildMessagePublishCommand(
      { type: 'kafka' },
      {
        destination: '',
        bodyMode: 'json',
        body: '{"ok":true}',
      },
      t,
    )).toThrow('message_publish.error.destination_required');

    expect(() => buildMessagePublishCommand(
      { type: 'kafka' },
      {
        destination: 'orders.events',
        bodyMode: 'json',
        body: '{bad',
      },
      t,
    )).toThrow(/message_publish\.error\.invalid_json_detail .*message_publish\.field\.body/);

    expect(() => buildMessagePublishCommand(
      { type: 'kafka' },
      {
        destination: 'orders.events',
        bodyMode: 'json',
        body: '{"ok":true}',
        headers: '["bad"]',
      },
      t,
    )).toThrow(/message_publish\.error\.json_object_required .*"field":"Headers"/);

    expect(() => buildMessagePublishCommand(
      { type: 'mqtt' },
      {
        destination: 'devices/+/telemetry',
        bodyMode: 'json',
        body: '{"ok":true}',
      },
      t,
    )).toThrow('message_publish.error.mqtt_wildcard_topic');

    expect(() => buildMessagePublishCommand(
      { type: 'not-a-message-bus' },
      {
        destination: 'orders.events',
        bodyMode: 'json',
        body: '{"ok":true}',
      },
      t,
    )).toThrow(/message_publish\.error\.unsupported_type .*not-a-message-bus/);
  });

  it('keeps command validation errors in locale catalogs and out of hardcoded Chinese literals', () => {
    [
      '请输入目标 Topic / Queue',
      'MQTT 发送 Topic 不能包含 + 或 # 通配符',
      '请输入${fieldLabel}',
      '${fieldLabel}不是合法 JSON',
      '${fieldLabel} 必须是 JSON 对象',
      '当前数据源暂不支持测试发送消息',
    ].forEach((legacyText) => {
      expect(messagePublishSource).not.toContain(legacyText);
    });

    (['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const).forEach((locale) => {
      const catalog = JSON.parse(
        readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8'),
      ) as Record<string, string>;

      [
        'message_publish.field.body',
        'message_publish.field.message_key',
        'message_publish.error.destination_required',
        'message_publish.error.required_field',
        'message_publish.error.invalid_json_detail',
        'message_publish.error.json_object_required',
        'message_publish.error.mqtt_wildcard_topic',
        'message_publish.error.unsupported_type',
      ].forEach((key) => {
        expect(catalog[key]).toEqual(expect.any(String));
        expect(catalog[key].length).toBeGreaterThan(0);
      });

      expect(catalog['message_publish.error.destination_required']).toContain('Topic / Queue');
      expect(catalog['message_publish.error.mqtt_wildcard_topic']).toContain('MQTT');
      expect(catalog['message_publish.error.mqtt_wildcard_topic']).toContain('+');
      expect(catalog['message_publish.error.mqtt_wildcard_topic']).toContain('#');
    });
  });

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
    )).toThrow(/Headers.*JSON object/);
  });

  it('seeds Kafka default publish draft with a JSON body example', () => {
    expect(createDefaultMessagePublishDraft({ type: 'kafka' }, 'orders.events')).toMatchObject({
      destination: 'orders.events',
      keyMode: 'text',
      bodyMode: 'json',
    });
  });

  it('builds an MQTT publish JSON command with qos and retain flags', () => {
    const result = buildMessagePublishCommand(
      { type: 'mqtt' },
      {
        destination: 'devices/device-001/telemetry',
        qos: 1,
        retain: true,
        bodyMode: 'json',
        body: '{"id":1,"event":"created"}',
      },
    );

    expect(result.transportLabel).toBe('MQTT Topic');
    expect(result.destinationLabel).toBe('devices/device-001/telemetry');
    expect(result.commandText).toContain('"publish": "devices/device-001/telemetry"');
    expect(result.commandText).toContain('"qos": 1');
    expect(result.commandText).toContain('"retain": true');
  });

  it('seeds MQTT default publish draft with connection qos and retain defaults', () => {
    expect(createDefaultMessagePublishDraft(
      { type: 'mqtt', database: 'devices/+/telemetry', connectionParams: 'qos=1&retain=true' },
      '',
    )).toMatchObject({
      destination: 'devices/+/telemetry',
      qos: 1,
      retain: true,
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

  it('builds a RocketMQ publish JSON command with tag, keys and delay level', () => {
    const result = buildMessagePublishCommand(
      { type: 'rocketmq' },
      {
        destination: 'orders.events',
        key: 'key-a,key-b',
        tag: 'TagA',
        delayLevel: 3,
        bodyMode: 'json',
        body: '{"id":1,"event":"created"}',
        properties: '{"trace":"trace-1"}',
      },
    );

    const command = JSON.parse(result.commandText);
    expect(result.transportLabel).toBe('RocketMQ Topic');
    expect(result.destinationLabel).toBe('orders.events');
    expect(command).toMatchObject({
      publish: 'orders.events',
      tag: 'TagA',
      delayLevel: 3,
      properties: {
        trace: 'trace-1',
      },
    });
    expect(command.keys).toEqual(['key-a', 'key-b']);
    expect(command.payload).toMatchObject({ id: 1, event: 'created' });
  });

  it('seeds RocketMQ default publish draft with connection tag and delay level defaults', () => {
    expect(createDefaultMessagePublishDraft(
      { type: 'rocketmq', database: 'orders.events', connectionParams: 'tag=TagA&delayLevel=5' },
      '',
    )).toMatchObject({
      destination: 'orders.events',
      tag: 'TagA',
      delayLevel: 5,
      bodyMode: 'json',
    });
  });
});
