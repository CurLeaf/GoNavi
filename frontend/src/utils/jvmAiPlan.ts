import type { JVMActionDefinition, JVMChangeRequest, JVMAIPlanContext, JVMValueSnapshot, TabData } from '../types';
import { t as translateCatalog, type I18nParams } from '../i18n';
import { JVM_SENSITIVE_VALUE_MASK } from './jvmResourcePresentation';

export type JVMAIChangePlan = {
  targetType: 'cacheEntry' | 'managedBean' | 'attribute' | 'operation';
  selector: {
    namespace?: string;
    key?: string;
    resourcePath?: string;
  };
  action: string;
  payload?: {
    format: 'json' | 'text';
    value: unknown;
  };
  reason: string;
};

export type JVMAIChangeDraft = Pick<JVMChangeRequest, 'resourceId' | 'action' | 'reason' | 'source' | 'payload'>;

type JVMAIPlanPromptContext = {
  connectionName: string;
  host?: string;
  providerMode: 'jmx' | 'endpoint' | 'agent';
  resourcePath: string;
  readOnly: boolean;
  environment?: string;
  snapshot?: JVMValueSnapshot | null;
};

type JVMAIPlanTranslator = (key: string, params?: I18nParams) => string;

const planFencePattern = /```json\s*([\s\S]*?)```/gi;
const allowedTargetTypes = new Set<JVMAIChangePlan['targetType']>(['cacheEntry', 'managedBean', 'attribute', 'operation']);
const allowedPayloadFormats = new Set<NonNullable<JVMAIChangePlan['payload']>['format']>(['json', 'text']);

const asTrimmedString = (value: unknown): string => String(value ?? '').trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const translatePlanCopy = (
  translate: JVMAIPlanTranslator | undefined,
  key: string,
  params?: I18nParams,
): string => {
  const resolved = (translate || translateCatalog)(key, params);
  return resolved && resolved !== key ? resolved : key;
};

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

  if (!allowedTargetTypes.has(targetType) || !action || !reason || !selector) {
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

const formatSnapshotValue = (
  snapshot?: JVMValueSnapshot | null,
  translate?: JVMAIPlanTranslator,
): string => {
  if (!snapshot) {
    return translatePlanCopy(translate, 'jvm_ai_plan.snapshot.unavailable');
  }
  if (snapshot.sensitive) {
    return JVM_SENSITIVE_VALUE_MASK;
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

export const resolveJVMAIPlanResourceId = (plan: JVMAIChangePlan): string => {
  const resourcePath = asTrimmedString(plan.selector.resourcePath);
  if (resourcePath) {
    return resourcePath;
  }

  const namespace = asTrimmedString(plan.selector.namespace);
  const key = asTrimmedString(plan.selector.key);
  return [namespace, key].filter(Boolean).join('/');
};

export const matchesJVMAIPlanTargetTab = (
  tab: Pick<TabData, 'type' | 'connectionId' | 'providerMode' | 'resourcePath'>,
  context?: JVMAIPlanContext,
): boolean => {
  if (!context || tab.type !== 'jvm-resource') {
    return false;
  }

  const providerMode = (tab.providerMode || 'jmx') as JVMAIPlanContext['providerMode'];
  return (
    tab.connectionId === context.connectionId &&
    providerMode === context.providerMode &&
    asTrimmedString(tab.resourcePath) === asTrimmedString(context.resourcePath)
  );
};

export const resolveJVMAIPlanTargetTabId = (tabs: TabData[], context?: JVMAIPlanContext): string => {
  if (!context) {
    return '';
  }

  const exactMatch = tabs.find((tab) => tab.id === context.tabId && matchesJVMAIPlanTargetTab(tab, context));
  if (exactMatch) {
    return exactMatch.id;
  }

  const fallbackMatch = tabs.find((tab) => matchesJVMAIPlanTargetTab(tab, context));
  return fallbackMatch?.id || '';
};

export const buildJVMChangeDraftFromAIPlan = (
  plan: JVMAIChangePlan,
  translate?: JVMAIPlanTranslator,
): JVMAIChangeDraft => {
  const resourceId = resolveJVMAIPlanResourceId(plan);
  if (!resourceId) {
    throw new Error(translatePlanCopy(translate, 'jvm_ai_plan.error.resource_locator_missing'));
  }

  const reason = asTrimmedString(plan.reason);
  if (!reason) {
    throw new Error(translatePlanCopy(translate, 'jvm_ai_plan.error.reason_missing'));
  }

  const action = asTrimmedString(plan.action);
  if (!action) {
    throw new Error(translatePlanCopy(translate, 'jvm_ai_plan.error.action_missing'));
  }

  if (plan.action === 'updateValue') {
    const value = plan.payload?.value;
    if (plan.payload?.format !== 'json' || !isRecord(value)) {
      throw new Error(translatePlanCopy(translate, 'jvm_ai_plan.error.payload_json_object_required'));
    }
    return {
      resourceId,
      action: 'put',
      reason,
      source: 'ai-plan',
      payload: value as Record<string, any>,
    };
  }

  const payloadValue = plan.payload?.value;
  if (plan.payload && plan.payload.format === 'json') {
    if (!isRecord(payloadValue)) {
      throw new Error(translatePlanCopy(translate, 'jvm_ai_plan.error.payload_json_object_required'));
    }
    return {
      resourceId,
      action,
      reason,
      source: 'ai-plan',
      payload: payloadValue as Record<string, any>,
    };
  }

  if (plan.payload && plan.payload.format === 'text') {
    return {
      resourceId,
      action,
      reason,
      source: 'ai-plan',
      payload: {
        value: payloadValue == null ? '' : String(payloadValue),
      },
    };
  }

  return {
    resourceId,
    action,
    reason,
    source: 'ai-plan',
    payload: {},
  };
};

const formatSupportedActions = (
  actions?: JVMActionDefinition[],
  translate?: JVMAIPlanTranslator,
): string => {
  if (!actions || actions.length === 0) {
    return translatePlanCopy(translate, 'jvm_ai_plan.actions.none');
  }
  return actions
    .map((item) => {
      const payloadFields = Array.isArray(item.payloadFields) && item.payloadFields.length > 0
        ? translatePlanCopy(translate, 'jvm_ai_plan.actions.payload_fields', {
          fields: item.payloadFields
            .map((field) => `${field.name}${field.required ? translatePlanCopy(translate, 'jvm_ai_plan.actions.required_suffix') : ''}`)
            .join(translatePlanCopy(translate, 'jvm_ai_plan.actions.field_separator')),
        })
        : '';
      return `- ${item.action}${item.label ? translatePlanCopy(translate, 'jvm_ai_plan.actions.label', { label: item.label }) : ''}${item.description ? translatePlanCopy(translate, 'jvm_ai_plan.actions.description', { description: item.description }) : ''}${payloadFields}`;
    })
    .join('\n');
};

export const buildJVMAIPlanPrompt = ({
  connectionName,
  host,
  providerMode,
  resourcePath,
  readOnly,
  environment,
  snapshot,
}: JVMAIPlanPromptContext, translate?: JVMAIPlanTranslator): string => {
  const normalizedPath = asTrimmedString(resourcePath) || translatePlanCopy(translate, 'jvm_ai_plan.prompt.resource_path_missing');
  const snapshotFormat = asTrimmedString(snapshot?.format) || 'json';
  const environmentLabel = asTrimmedString(environment) || translatePlanCopy(translate, 'jvm_ai_plan.prompt.environment_unknown');
  const connectionPolicy = translatePlanCopy(
    translate,
    readOnly ? 'jvm_ai_plan.prompt.connection_policy.read_only' : 'jvm_ai_plan.prompt.connection_policy.writable',
  );
  const supportedActionsText = formatSupportedActions(snapshot?.supportedActions, translate);

  return [
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.intro'),
    '',
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.connection_name', { connectionName }),
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.target_host', { host: asTrimmedString(host) || '-' }),
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.provider_mode', { providerMode }),
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.environment', { environmentLabel }),
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.connection_policy', { policy: connectionPolicy }),
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.resource_path', { resourcePath: normalizedPath }),
    '',
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.snapshot_title'),
    `\`\`\`${snapshotFormat}`,
    formatSnapshotValue(snapshot, translate),
    '```',
    '',
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.supported_actions_title'),
    supportedActionsText,
    '',
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.output_requirements_title'),
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.requirement.single_json_block'),
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.requirement.fields'),
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.requirement.resource_path', { resourcePath: normalizedPath }),
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.requirement.action'),
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.requirement.payload'),
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.requirement.no_execute'),
    '',
    translatePlanCopy(translate, 'jvm_ai_plan.prompt.example_title'),
    '```json',
    JSON.stringify(
      {
        targetType: 'cacheEntry',
        selector: {
          resourcePath: normalizedPath,
        },
        action: 'put',
        payload: {
          format: 'json',
          value: {
            status: 'ACTIVE',
          },
        },
        reason: translatePlanCopy(translate, 'jvm_ai_plan.prompt.example_reason'),
      },
      null,
      2,
    ),
    '```',
  ].join('\n');
};
