import type { JVMValueSnapshot } from '../types';

export type JVMAIChangePlan = {
  targetType: 'cacheEntry' | 'managedBean';
  selector: {
    namespace?: string;
    key?: string;
    resourcePath?: string;
  };
  action: 'updateValue' | 'evict' | 'clear';
  payload?: {
    format: 'json' | 'text';
    value: unknown;
  };
  reason: string;
};

type JVMAIPlanPromptContext = {
  connectionName: string;
  host?: string;
  providerMode: 'jmx' | 'endpoint' | 'agent';
  resourcePath: string;
  readOnly: boolean;
  environment?: string;
  snapshot?: JVMValueSnapshot | null;
};

const planFencePattern = /```json\s*([\s\S]*?)```/gi;
const allowedTargetTypes = new Set<JVMAIChangePlan['targetType']>(['cacheEntry', 'managedBean']);
const allowedActions = new Set<JVMAIChangePlan['action']>(['updateValue', 'evict', 'clear']);
const allowedPayloadFormats = new Set<NonNullable<JVMAIChangePlan['payload']>['format']>(['json', 'text']);

const asTrimmedString = (value: unknown): string => String(value ?? '').trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeSelector = (value: unknown): JVMAIChangePlan['selector'] | null => {
  if (!isRecord(value)) {
    return null;
  }

  const selector: JVMAIChangePlan['selector'] = {};
  const namespace = asTrimmedString(value.namespace);
  const key = asTrimmedString(value.key);
  const resourcePath = asTrimmedString(value.resourcePath);

  if (namespace) {
    selector.namespace = namespace;
  }
  if (key) {
    selector.key = key;
  }
  if (resourcePath) {
    selector.resourcePath = resourcePath;
  }

  return selector.namespace || selector.key || selector.resourcePath ? selector : null;
};

const normalizePayload = (value: unknown): JVMAIChangePlan['payload'] | undefined => {
  if (value == null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const format = asTrimmedString(value.format) as NonNullable<JVMAIChangePlan['payload']>['format'];
  if (!allowedPayloadFormats.has(format)) {
    return undefined;
  }

  return {
    format,
    value: value.value,
  };
};

const normalizePlan = (value: unknown): JVMAIChangePlan | null => {
  if (!isRecord(value)) {
    return null;
  }

  const targetType = asTrimmedString(value.targetType) as JVMAIChangePlan['targetType'];
  const action = asTrimmedString(value.action) as JVMAIChangePlan['action'];
  const reason = asTrimmedString(value.reason);
  const selector = normalizeSelector(value.selector);
  const payload = normalizePayload(value.payload);

  if (!allowedTargetTypes.has(targetType) || !allowedActions.has(action) || !reason || !selector) {
    return null;
  }

  return {
    targetType,
    selector,
    action,
    payload,
    reason,
  };
};

const formatSnapshotValue = (snapshot?: JVMValueSnapshot | null): string => {
  if (!snapshot) {
    return '当前资源快照尚未加载成功。';
  }
  if (typeof snapshot.value === 'string') {
    return snapshot.value;
  }
  try {
    return JSON.stringify(snapshot.value ?? null, null, 2);
  } catch {
    return String(snapshot.value);
  }
};

export const extractJVMChangePlan = (content: string): JVMAIChangePlan | null => {
  const source = String(content || '');
  planFencePattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = planFencePattern.exec(source)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const normalized = normalizePlan(parsed);
      if (normalized) {
        return normalized;
      }
    } catch {
      // Ignore malformed JSON blocks and continue scanning.
    }
  }

  return null;
};

export const buildJVMAIPlanPrompt = ({
  connectionName,
  host,
  providerMode,
  resourcePath,
  readOnly,
  environment,
  snapshot,
}: JVMAIPlanPromptContext): string => {
  const normalizedPath = asTrimmedString(resourcePath) || '(未提供资源路径)';
  const snapshotFormat = asTrimmedString(snapshot?.format) || 'json';
  const environmentLabel = asTrimmedString(environment) || 'unknown';

  return [
    '请分析下面这个 JVM 资源，并生成一个可用于 GoNavi “预览变更” 的结构化修改计划。',
    '',
    `连接名称：${connectionName}`,
    `目标主机：${asTrimmedString(host) || '-'}`,
    `Provider 模式：${providerMode}`,
    `运行环境：${environmentLabel}`,
    `连接策略：${readOnly ? '只读连接，当前只能生成计划和风险分析，不能假设已执行' : '可写连接，但仍必须先预览再人工确认'}`,
    `当前资源路径：${normalizedPath}`,
    '',
    '当前资源快照：',
    `\`\`\`${snapshotFormat}`,
    formatSnapshotValue(snapshot),
    '```',
    '',
    '输出要求：',
    '1. 可以先给一小段分析，但必须包含且只包含一个 ```json 代码块。',
    '2. 代码块里的 JSON 字段必须严格是：targetType、selector、action、payload、reason。',
    `3. selector.resourcePath 优先使用当前资源路径 ${normalizedPath}，不要凭空编造其他路径。`,
    '4. action 只能使用 updateValue、evict、clear 之一。',
    '5. payload 必须保持对象结构，例如 {"format":"json","value":{"status":"ACTIVE"}}。',
    '6. 不要声称已经执行修改，也不要输出脚本或命令。',
    '',
    'JSON 示例：',
    '```json',
    JSON.stringify(
      {
        targetType: 'cacheEntry',
        selector: {
          resourcePath: normalizedPath,
        },
        action: 'updateValue',
        payload: {
          format: 'json',
          value: {
            status: 'ACTIVE',
          },
        },
        reason: '修复缓存脏值',
      },
      null,
      2,
    ),
    '```',
  ].join('\n');
};
