import type { AIMCPServerConfig } from '../../types';
import { buildMCPArgumentDetailHints } from '../../utils/mcpArgumentDetailHints';
import { buildMCPArgumentHintProfile } from '../../utils/mcpArgumentHints';
import { parseMCPCommandDraft, type ParseMCPCommandDraftResult } from '../../utils/mcpCommandDraft';
import { buildMCPEnvHintProfile } from '../../utils/mcpEnvHints';
import { parseMCPEnvDraft } from '../../utils/mcpEnvDraft';
import { buildMCPLaunchPreview } from '../../utils/mcpServerGuidance';
import { buildMCPServerDraftSeed } from '../../utils/mcpServerDraftSeed';
import { MCP_SERVER_DRAFT_TEMPLATES } from '../../utils/mcpServerTemplates';
import { validateMCPServerDraft } from '../../utils/mcpServerValidation';
import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

const translateMCPDraftCopy = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
): string => translateInspectionCopy(translate, key, fallback);

const normalizeArgs = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(toTrimmedString).filter(Boolean);
  }
  const text = toTrimmedString(value);
  if (!text) {
    return [];
  }
  return text
    .split(/\r?\n|,/u)
    .map(toTrimmedString)
    .filter(Boolean);
};

const normalizeTimeoutSeconds = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const redactEnvValues = (env: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.keys(env).sort().map((key) => [key, env[key] ? '***' : '']));

const isSensitiveArgFlag = (arg: string): boolean => {
  const flag = toTrimmedString(arg).split('=')[0].replace(/^-+/u, '').toLowerCase();
  return /(token|api-?key|secret|password|pass|credential)/iu.test(flag);
};

const redactSensitiveArgValues = (args: string[]): string[] => {
  const result: string[] = [];
  let redactNext = false;
  for (const arg of args) {
    const text = toTrimmedString(arg);
    if (!text) {
      continue;
    }
    if (redactNext && !text.startsWith('-')) {
      result.push('***');
      redactNext = false;
      continue;
    }
    redactNext = false;
    if (isSensitiveArgFlag(text)) {
      const equalsIndex = text.indexOf('=');
      if (equalsIndex >= 0) {
        result.push(`${text.slice(0, equalsIndex)}=***`);
      } else {
        result.push(text);
        redactNext = true;
      }
      continue;
    }
    result.push(text);
  }
  return result;
};

const buildRedactedFullCommand = (
  fullCommand: string,
  parsedCommand: ParseMCPCommandDraftResult | null,
  translate?: AIInspectionTranslator,
): string => {
  if (!fullCommand) {
    return '';
  }
  if (!parsedCommand?.ok || !parsedCommand.draft) {
    return translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.redacted_parse_failed',
      '[Parse failed, original command hidden]',
    );
  }
  return [
    ...Object.keys(parsedCommand.draft.env || {}).sort().map((key) => `${key}=***`),
    buildMCPLaunchPreview(parsedCommand.draft.command, redactSensitiveArgValues(parsedCommand.draft.args)),
  ].filter(Boolean).join(' ');
};

const getTemplateSeed = (templateKey: unknown): Partial<AIMCPServerConfig> => {
  const normalizedKey = toTrimmedString(templateKey).toLowerCase();
  if (!normalizedKey) {
    return {};
  }
  return MCP_SERVER_DRAFT_TEMPLATES.find((template) => template.key === normalizedKey)?.seed || {};
};

const resolveRecommendedTemplate = (
  command: string,
  args: string[],
  translate?: AIInspectionTranslator,
) => {
  const normalizedCommand = toTrimmedString(command).toLowerCase();
  if (!normalizedCommand) {
    return null;
  }

  const commandTemplate = MCP_SERVER_DRAFT_TEMPLATES.find((template) => {
    const seedCommand = toTrimmedString(template.seed.command).toLowerCase();
    if (seedCommand === normalizedCommand) {
      return true;
    }
    return template.key === 'exe' && /\.(exe|cmd|bat)$/iu.test(normalizedCommand);
  });
  if (!commandTemplate) {
    return null;
  }

  return {
    key: commandTemplate.key,
    title: translateMCPDraftCopy(
      translate,
      commandTemplate.titleKey,
      commandTemplate.title,
    ),
    description: translateMCPDraftCopy(
      translate,
      commandTemplate.descriptionKey,
      commandTemplate.description,
    ),
    exampleLaunchPreview: buildMCPLaunchPreview(
      toTrimmedString(commandTemplate.seed.command),
      Array.isArray(commandTemplate.seed.args) ? commandTemplate.seed.args : [],
    ),
    confidence: args.length > 0 ? 'high' : 'medium',
  };
};

const buildNextActions = (params: {
  errorCount: number;
  warningCount: number;
  issueKeys: Set<string>;
  hasFullCommand: boolean;
  translate?: AIInspectionTranslator;
}): string[] => {
  const { errorCount, warningCount, issueKeys, hasFullCommand, translate } = params;
  const actions: string[] = [];

  if (issueKeys.has('command-missing')) {
    actions.push(translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.next_action.command_missing',
      'Paste the full startup command from README first, or at least fill node, npx, uvx, python, or exe as command.',
    ));
  }
  if (issueKeys.has('command-whole-line')) {
    actions.push(translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.next_action.command_whole_line',
      'Put the whole command into the full command field for auto-splitting; keep only the executable in command, and put scripts, packages, and --stdio into args.',
    ));
  }
  if (issueKeys.has('args-missing-for-launcher')) {
    actions.push(translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.next_action.args_missing_for_launcher',
      'Complete launcher arguments: npx usually needs -y and a package name, node needs server.js, python needs -m and a module name, uvx needs a package name, and docker needs run, -i, and an image name.',
    ));
  }
  if (issueKeys.has('docker-run-missing')) {
    actions.push(translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.next_action.docker_run',
      'For Docker MCP, set command to docker and add run separately in args.',
    ));
  }
  if (issueKeys.has('docker-interactive-missing')) {
    actions.push(translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.next_action.docker_interactive',
      'Add -i or --interactive to Docker MCP args so the stdio connection does not close immediately.',
    ));
  }
  if (issueKeys.has('docker-image-missing')) {
    actions.push(translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.next_action.docker_image',
      'Add the image name from README to Docker MCP args, for example mcp/server-fetch:latest.',
    ));
  }
  if (issueKeys.has('args-contain-env-or-shell-glue') || issueKeys.has('env-invalid-lines')) {
    actions.push(translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.next_action.env_lines',
      'Write environment variables as one KEY=VALUE per line; do not put export, set, env, &&, or $env:KEY=VALUE; into args.',
    ));
  }
  if (issueKeys.has('timeout-out-of-range')) {
    actions.push(translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.next_action.timeout',
      'Set timeout to 20 seconds; slow-starting services can use 45 or 60 seconds.',
    ));
  }
  if (errorCount === 0 && warningCount === 0) {
    actions.push(translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.next_action.ready_to_save',
      'The current draft can be saved and tested for tool discovery; if it discovers 0 tools, check whether the service supports stdio.',
    ));
  } else if (errorCount === 0) {
    actions.push(translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.next_action.can_test_with_warnings',
      'The current draft can be tested, but handle warnings first to avoid tool discovery timeouts or discovering 0 tools.',
    ));
  }
  if (!hasFullCommand) {
    actions.push(translateMCPDraftCopy(
      translate,
      'ai_chat.inspection.mcp_draft.next_action.send_full_command',
      'If you are still unsure how to split it, pass the original full command to fullCommand and let GoNavi calculate it.',
    ));
  }

  return actions;
};

export const buildMCPDraftInspectionSnapshot = (args: Record<string, unknown> = {}) => {
  const translate = typeof args.translate === 'function' ? args.translate as AIInspectionTranslator : undefined;
  const templateSeed = getTemplateSeed(args.templateKey);
  const fullCommand = toTrimmedString(args.fullCommand ?? args.commandLine ?? args.rawCommand);
  const parsedCommand = fullCommand ? parseMCPCommandDraft(fullCommand) : null;
  const envDraftText = toTrimmedString(args.envText ?? args.envDraft);
  const parsedEnvDraft = envDraftText ? parseMCPEnvDraft(envDraftText) : undefined;

  const baseName = toTrimmedString(templateSeed.name) || translateMCPDraftCopy(
    translate,
    'ai_chat.inspection.mcp_draft.default_name',
    'MCP draft',
  );
  let command = toTrimmedString(templateSeed.command);
  let commandArgs = Array.isArray(templateSeed.args) ? templateSeed.args.map(toTrimmedString).filter(Boolean) : [];
  let env: Record<string, string> = { ...(templateSeed.env || {}) };

  if (parsedCommand?.ok && parsedCommand.draft) {
    command = parsedCommand.draft.command;
    commandArgs = parsedCommand.draft.args;
    env = {
      ...env,
      ...parsedCommand.draft.env,
    };
  }
  if (args.command !== undefined) {
    command = toTrimmedString(args.command);
  }
  if (args.args !== undefined) {
    commandArgs = normalizeArgs(args.args);
  }
  if (parsedEnvDraft) {
    env = {
      ...env,
      ...parsedEnvDraft.env,
    };
  }

  const server: Pick<AIMCPServerConfig, 'name' | 'transport' | 'command' | 'args' | 'timeoutSeconds'> = {
    name: toTrimmedString(args.name ?? args.serverName) || baseName,
    transport: 'stdio',
    command,
    args: commandArgs,
    timeoutSeconds: normalizeTimeoutSeconds(args.timeoutSeconds, Number(templateSeed.timeoutSeconds) || 20),
  };
  const validation = validateMCPServerDraft(server, parsedEnvDraft);
  const issueKeys = new Set(validation.issues.map((issue) => issue.key));
  const recommendedTemplate = resolveRecommendedTemplate(command, commandArgs, translate);
  const argumentHintProfile = buildMCPArgumentHintProfile(command, commandArgs, translate);
  const redactedCommandArgs = redactSensitiveArgValues(commandArgs);
  const envHintProfile = buildMCPEnvHintProfile(command, commandArgs, env, translate);
  const suggestedServerSeed = buildMCPServerDraftSeed({
    name: toTrimmedString(args.name ?? args.serverName) || undefined,
    command,
    args: commandArgs,
    env,
    timeoutSeconds: server.timeoutSeconds,
  }, translate);

  return {
    input: {
      hasFullCommand: Boolean(fullCommand),
      templateKey: toTrimmedString(args.templateKey),
      fullCommand: buildRedactedFullCommand(fullCommand, parsedCommand, translate),
    },
    parse: parsedCommand
      ? {
          ok: parsedCommand.ok,
          error: parsedCommand.error || '',
          command: parsedCommand.draft?.command || '',
          args: redactSensitiveArgValues(parsedCommand.draft?.args || []),
          argsRedacted: JSON.stringify(redactSensitiveArgValues(parsedCommand.draft?.args || [])) !== JSON.stringify(parsedCommand.draft?.args || []),
          envKeys: Object.keys(parsedCommand.draft?.env || {}).sort(),
        }
      : {
          ok: false,
          error: translateMCPDraftCopy(
            translate,
            'ai_chat.inspection.mcp_draft.parse.no_full_command',
            'No fullCommand was provided; validated the split-field draft instead.',
          ),
          command: '',
          args: [],
          envKeys: [],
        },
    draft: {
      name: server.name,
      transport: server.transport,
      command,
      args: redactedCommandArgs,
      argsRedacted: JSON.stringify(redactedCommandArgs) !== JSON.stringify(commandArgs),
      envKeys: Object.keys(env).sort(),
      envVarCount: Object.keys(env).length,
      argumentHints: argumentHintProfile ? {
        commandName: argumentHintProfile.commandName,
        title: argumentHintProfile.title,
        summary: argumentHintProfile.summary,
        orderHint: argumentHintProfile.orderHint,
        steps: argumentHintProfile.steps,
        argumentDetailHints: buildMCPArgumentDetailHints(argumentHintProfile.commandName, redactedCommandArgs, translate),
        businessHints: argumentHintProfile.businessHints,
        nextActions: argumentHintProfile.nextActions,
      } : null,
      envHints: envHintProfile ? {
        envVarCount: envHintProfile.envVarCount,
        secretLikeCount: envHintProfile.secretLikeCount,
        endpointLikeCount: envHintProfile.endpointLikeCount,
        items: envHintProfile.items.map((item) => ({
          key: item.key,
          category: item.category,
          label: item.label,
          detail: item.detail,
          valueHint: item.valueHint,
          sensitive: item.sensitive,
          known: item.known,
          empty: item.empty,
          placeholder: item.placeholder,
        })),
        warnings: envHintProfile.warnings,
        nextActions: envHintProfile.nextActions,
      } : null,
      invalidEnvLines: parsedEnvDraft?.invalidLines || [],
      timeoutSeconds: server.timeoutSeconds,
      launchCommandPreview: buildMCPLaunchPreview(command, redactedCommandArgs),
      recommendedTemplate,
      suggestedServerSeed: {
        ...suggestedServerSeed,
        args: redactSensitiveArgValues(suggestedServerSeed.args || []),
        env: redactEnvValues(env),
        envRedacted: Object.keys(env).length > 0,
        argsRedacted: JSON.stringify(redactSensitiveArgValues(suggestedServerSeed.args || [])) !== JSON.stringify(suggestedServerSeed.args || []),
      },
    },
    validation: {
      errorCount: validation.errorCount,
      warningCount: validation.warningCount,
      infoCount: validation.infoCount,
      canTest: validation.canTest,
      canSave: validation.canSave,
      issues: validation.issues,
    },
    nextActions: buildNextActions({
      errorCount: validation.errorCount,
      warningCount: validation.warningCount,
      issueKeys,
      hasFullCommand: Boolean(fullCommand),
      translate,
    }),
  };
};
