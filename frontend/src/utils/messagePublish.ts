import { resolveDataSourceType } from './dataSourceCapabilities';

type ConnectionLike = {
  type?: string;
  driver?: string;
  oceanBaseProtocol?: string;
  database?: string;
  uri?: string;
  connectionParams?: string;
} | null | undefined;

export type MessagePublishValueMode = 'text' | 'json';

export type MessagePublishDraft = {
  destination: string;
  exchange?: string;
  routingKey?: string;
  qos?: number;
  retain?: boolean;
  keyMode?: MessagePublishValueMode;
  key?: string;
  bodyMode?: MessagePublishValueMode;
  body: string;
  headers?: string;
  properties?: string;
};

export type MessagePublishCommand = {
  commandText: string;
  destinationLabel: string;
  transportLabel: string;
};

export type MessagePublishPresentation = {
  transportLabel: string;
  destinationLabel: string;
  destinationPlaceholder: string;
  destinationRequiredMessage: string;
  alertMessage: string;
  successHint: string;
  showKey: boolean;
  showExchange: boolean;
  showRoutingKey: boolean;
  showProperties: boolean;
  showQos: boolean;
  showRetain: boolean;
};

const normalizeMode = (value: unknown, fallback: MessagePublishValueMode): MessagePublishValueMode => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'text') return 'text';
  if (normalized === 'json') return 'json';
  return fallback;
};

const parseRequiredPayload = (
  rawValue: unknown,
  mode: MessagePublishValueMode,
  fieldLabel: string,
): string | number | boolean | Record<string, any> | Array<any> => {
  const text = String(rawValue ?? '');
  if (!text.trim()) {
    throw new Error(`请输入${fieldLabel}`);
  }
  if (mode === 'text') {
    return text;
  }
  try {
    return JSON.parse(text);
  } catch (error: any) {
    throw new Error(`${fieldLabel}不是合法 JSON：${error?.message || String(error)}`);
  }
};

const parseOptionalPayload = (
  rawValue: unknown,
  mode: MessagePublishValueMode,
  fieldLabel: string,
): string | number | boolean | Record<string, any> | Array<any> | undefined => {
  const text = String(rawValue ?? '');
  if (!text.trim()) {
    return undefined;
  }
  return parseRequiredPayload(text, mode, fieldLabel);
};

const parseOptionalJSONObject = (
  rawValue: unknown,
  fieldLabel: string,
): Record<string, any> | undefined => {
  const text = String(rawValue ?? '');
  if (!text.trim()) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: any) {
    throw new Error(`${fieldLabel}不是合法 JSON：${error?.message || String(error)}`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${fieldLabel} 必须是 JSON 对象`);
  }
  return parsed as Record<string, any>;
};

const mergeSearchParams = (target: URLSearchParams, sourceText: unknown) => {
  const text = String(sourceText ?? '').trim();
  if (!text) return;
  const raw = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text;
  const params = new URLSearchParams(raw.replace(/^\?/, ''));
  params.forEach((value, key) => {
    if (String(key || '').trim()) {
      target.set(key, value);
    }
  });
};

const resolveConnectionParams = (config: ConnectionLike): URLSearchParams => {
  const params = new URLSearchParams();
  if (!config) return params;
  mergeSearchParams(params, config.uri);
  mergeSearchParams(params, config.connectionParams);
  return params;
};

const normalizeRabbitMQExchange = (value: unknown): string => {
  const normalized = String(value ?? '').trim();
  if (normalized === 'amq.default' || normalized === '(default)') {
    return '';
  }
  return normalized;
};

const resolveDefaultDestination = (config: ConnectionLike, explicitDestination: string): string => {
  const destination = String(explicitDestination || '').trim();
  if (destination) return destination;

  const resolvedType = resolveDataSourceType(config as any);
  const params = resolveConnectionParams(config);

  if (resolvedType === 'kafka') {
    return String(config?.database || '').trim();
  }
  if (resolvedType === 'mqtt') {
    return String(config?.database || params.get('defaultTopic') || params.get('topic') || '').trim();
  }
  if (resolvedType === 'rabbitmq') {
    return String(params.get('defaultQueue') || params.get('queue') || '').trim();
  }
  return '';
};

export const getMessagePublishPresentation = (
  config: ConnectionLike,
): MessagePublishPresentation => {
  const resolvedType = resolveDataSourceType(config as any);

  if (resolvedType === 'rabbitmq') {
    return {
      transportLabel: 'RabbitMQ Queue',
      destinationLabel: 'Queue',
      destinationPlaceholder: '例如：orders.queue',
      destinationRequiredMessage: '请输入 Queue',
      alertMessage: '当前表单会自动拼装 RabbitMQ publish JSON 命令，并通过 Management API 执行测试发送。',
      successHint: '留空 Exchange 时会使用默认交换机并按 Queue 名作为 routing key。',
      showKey: false,
      showExchange: true,
      showRoutingKey: true,
      showProperties: true,
      showQos: false,
      showRetain: false,
    };
  }

  if (resolvedType === 'mqtt') {
    return {
      transportLabel: 'MQTT Topic',
      destinationLabel: 'Topic',
      destinationPlaceholder: '例如：devices/device-001/telemetry',
      destinationRequiredMessage: '请输入 Topic',
      alertMessage: '当前表单会自动拼装 MQTT publish JSON 命令，并直接通过 broker 执行测试发送。',
      successHint: 'QoS 与 retain 可单独指定；未填写时沿用当前连接中的默认参数。',
      showKey: false,
      showExchange: false,
      showRoutingKey: false,
      showProperties: false,
      showQos: true,
      showRetain: true,
    };
  }

  return {
    transportLabel: 'Kafka Topic',
    destinationLabel: 'Topic',
    destinationPlaceholder: '例如：orders.events',
    destinationRequiredMessage: '请输入 Topic',
    alertMessage: '当前表单会自动拼装 Kafka publish JSON 命令，并直接调用后端执行测试发送。',
    successHint: 'Headers 会作为 Kafka Record Headers 一并发送。',
    showKey: true,
    showExchange: false,
    showRoutingKey: false,
    showProperties: false,
    showQos: false,
    showRetain: false,
  };
};

export const createDefaultMessagePublishDraft = (
  config: ConnectionLike,
  destination = '',
): MessagePublishDraft => {
  const resolvedType = resolveDataSourceType(config as any);
  const resolvedDestination = resolveDefaultDestination(config, destination);
  const params = resolveConnectionParams(config);

  if (resolvedType === 'rabbitmq') {
    return {
      destination: resolvedDestination,
      exchange: normalizeRabbitMQExchange(params.get('defaultExchange') || params.get('exchange') || ''),
      routingKey: resolvedDestination,
      bodyMode: 'json',
      body: '{\n  "event": "test",\n  "source": "gonavi"\n}',
      headers: '{\n  "x-source": "gonavi"\n}',
      properties: '{\n  "content_type": "application/json"\n}',
    };
  }

  if (resolvedType === 'mqtt') {
    const qosValue = Number(params.get('qos'));
    return {
      destination: resolvedDestination,
      qos: Number.isFinite(qosValue) ? Math.min(2, Math.max(0, Math.trunc(qosValue))) : 0,
      retain: ['1', 'true', 'yes', 'on'].includes(String(params.get('retain') || '').trim().toLowerCase()),
      bodyMode: 'json',
      body: '{\n  "event": "test",\n  "source": "gonavi"\n}',
      headers: '',
    };
  }

  return {
    destination: resolvedDestination,
    keyMode: 'text',
    key: '',
    bodyMode: 'json',
    body: '{\n  "event": "test",\n  "source": "gonavi"\n}',
    headers: '{\n  "x-source": "gonavi"\n}',
  };
};

export const buildMessagePublishCommand = (
  config: ConnectionLike,
  draft: MessagePublishDraft,
): MessagePublishCommand => {
  const resolvedType = resolveDataSourceType(config as any);
  const destination = String(draft.destination || '').trim();
  if (!destination) {
    throw new Error('请输入目标 Topic / Queue');
  }

  if (resolvedType === 'mqtt') {
    if (/[#+]/.test(destination)) {
      throw new Error('MQTT 发送 Topic 不能包含 + 或 # 通配符');
    }
    const bodyMode = normalizeMode(draft.bodyMode, 'json');
    const qosValue = Number(draft.qos);
    const qos = Number.isFinite(qosValue) ? Math.min(2, Math.max(0, Math.trunc(qosValue))) : 0;
    const command: Record<string, unknown> = {
      publish: destination,
      payload: parseRequiredPayload(draft.body, bodyMode, '消息体'),
      qos,
      retain: !!draft.retain,
    };

    return {
      commandText: JSON.stringify(command, null, 2),
      destinationLabel: destination,
      transportLabel: 'MQTT Topic',
    };
  }

  if (resolvedType === 'rabbitmq') {
    const params = resolveConnectionParams(config);
    const bodyMode = normalizeMode(draft.bodyMode, 'json');
    const command: Record<string, unknown> = {
      publish: destination,
      payload: parseRequiredPayload(draft.body, bodyMode, '消息体'),
      exchange: normalizeRabbitMQExchange(draft.exchange || params.get('defaultExchange') || params.get('exchange') || ''),
      routing_key: String(draft.routingKey || '').trim() || destination,
    };

    const headers = parseOptionalJSONObject(draft.headers, 'Headers');
    if (headers && Object.keys(headers).length > 0) {
      command.headers = headers;
    }

    const properties = parseOptionalJSONObject(draft.properties, 'Properties');
    if (properties && Object.keys(properties).length > 0) {
      command.properties = properties;
    }

    return {
      commandText: JSON.stringify(command, null, 2),
      destinationLabel: destination,
      transportLabel: 'RabbitMQ Queue',
    };
  }

  if (resolvedType === 'kafka') {
    const keyMode = normalizeMode(draft.keyMode, 'text');
    const bodyMode = normalizeMode(draft.bodyMode, 'json');
    const command: Record<string, unknown> = {
      publish: destination,
      value: parseRequiredPayload(draft.body, bodyMode, '消息体'),
    };

    const keyPayload = parseOptionalPayload(draft.key, keyMode, '消息 Key');
    if (keyPayload !== undefined) {
      command.key = keyPayload;
    }

    const headers = parseOptionalJSONObject(draft.headers, 'Headers');
    if (headers && Object.keys(headers).length > 0) {
      command.headers = headers;
    }

    return {
      commandText: JSON.stringify(command, null, 2),
      destinationLabel: destination,
      transportLabel: 'Kafka Topic',
    };
  }

  throw new Error(`当前数据源暂不支持测试发送消息：${resolvedType || 'unknown'}`);
};
