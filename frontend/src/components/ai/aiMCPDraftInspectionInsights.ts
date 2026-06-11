import type { AIMCPServerConfig } from '../../types';
import { buildMCPArgumentHintProfile } from '../../utils/mcpArgumentHints';
import { parseMCPCommandDraft, type ParseMCPCommandDraftResult } from '../../utils/mcpCommandDraft';
import { buildMCPEnvHintProfile } from '../../utils/mcpEnvHints';
import { parseMCPEnvDraft } from '../../utils/mcpEnvDraft';
import { buildMCPLaunchPreview } from '../../utils/mcpServerGuidance';
import { buildMCPServerDraftSeed } from '../../utils/mcpServerDraftSeed';
import { MCP_SERVER_DRAFT_TEMPLATES } from '../../utils/mcpServerTemplates';
import { validateMCPServerDraft } from '../../utils/mcpServerValidation';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

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
): string => {
  if (!fullCommand) {
    return '';
  }
  if (!parsedCommand?.ok || !parsedCommand.draft) {
    return '[解析失败，原始命令已隐藏]';
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

const resolveRecommendedTemplate = (command: string, args: string[]) => {
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
    title: commandTemplate.title,
    description: commandTemplate.description,
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
}): string[] => {
  const { errorCount, warningCount, issueKeys, hasFullCommand } = params;
  const actions: string[] = [];

  if (issueKeys.has('command-missing')) {
    actions.push('先粘贴 README 里的完整启动命令，或至少填写 node、npx、uvx、python、exe 之一作为 command。');
  }
  if (issueKeys.has('command-whole-line')) {
    actions.push('把整行命令放到完整命令框自动拆分；command 只保留可执行程序，脚本名、包名和 --stdio 放到 args。');
  }
  if (issueKeys.has('args-missing-for-launcher')) {
    actions.push('给启动器补齐参数：npx 通常需要 -y 和包名，node 需要 server.js，python 需要 -m 模块名，uvx 需要包名，docker 需要 run、-i 和镜像名。');
  }
  if (issueKeys.has('docker-run-missing')) {
    actions.push('Docker MCP 的 command 填 docker，args 里单独补 run。');
  }
  if (issueKeys.has('docker-interactive-missing')) {
    actions.push('Docker MCP 的 args 里补 -i 或 --interactive，避免 stdio 连接立即断开。');
  }
  if (issueKeys.has('docker-image-missing')) {
    actions.push('Docker MCP 的 args 里补 README 提供的镜像名，例如 mcp/server-fetch:latest。');
  }
  if (issueKeys.has('args-contain-env-or-shell-glue') || issueKeys.has('env-invalid-lines')) {
    actions.push('环境变量改成每行 KEY=VALUE；不要把 export、set、env、&& 或 $env:KEY=VALUE; 放进 args。');
  }
  if (issueKeys.has('timeout-out-of-range')) {
    actions.push('把 timeout 调整到 20 秒；慢启动服务可改成 45 或 60 秒。');
  }
  if (errorCount === 0 && warningCount === 0) {
    actions.push('当前草稿可以保存并测试工具发现；如果发现 0 个工具，再检查服务是否支持 stdio。');
  } else if (errorCount === 0) {
    actions.push('当前草稿可以测试，但建议先处理 warning，避免工具发现超时或发现 0 个工具。');
  }
  if (!hasFullCommand) {
    actions.push('如果仍不确定怎么拆，优先把原始完整命令传给 fullCommand 让 GoNavi 试算。');
  }

  return actions;
};

export const buildMCPDraftInspectionSnapshot = (args: Record<string, unknown> = {}) => {
  const templateSeed = getTemplateSeed(args.templateKey);
  const fullCommand = toTrimmedString(args.fullCommand ?? args.commandLine ?? args.rawCommand);
  const parsedCommand = fullCommand ? parseMCPCommandDraft(fullCommand) : null;
  const envDraftText = toTrimmedString(args.envText ?? args.envDraft);
  const parsedEnvDraft = envDraftText ? parseMCPEnvDraft(envDraftText) : undefined;

  const baseName = toTrimmedString(templateSeed.name) || 'MCP 草稿';
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
  const recommendedTemplate = resolveRecommendedTemplate(command, commandArgs);
  const argumentHintProfile = buildMCPArgumentHintProfile(command, commandArgs);
  const redactedCommandArgs = redactSensitiveArgValues(commandArgs);
  const envHintProfile = buildMCPEnvHintProfile(command, commandArgs, env);
  const suggestedServerSeed = buildMCPServerDraftSeed({
    name: toTrimmedString(args.name ?? args.serverName) || undefined,
    command,
    args: commandArgs,
    env,
    timeoutSeconds: server.timeoutSeconds,
  });

  return {
    input: {
      hasFullCommand: Boolean(fullCommand),
      templateKey: toTrimmedString(args.templateKey),
      fullCommand: buildRedactedFullCommand(fullCommand, parsedCommand),
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
          error: '未提供 fullCommand，已按分字段草稿校验。',
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
    }),
  };
};
