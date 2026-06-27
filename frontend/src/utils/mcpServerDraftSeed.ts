import type { AIMCPServerConfig } from '../types';
import type { ParsedMCPCommandDraft } from './mcpCommandDraft';

export interface MCPServerDraftSeedInput {
  args?: string[];
  command: string;
  enabled?: boolean;
  env?: Record<string, string>;
  name?: string;
  timeoutSeconds?: number;
}

export type MCPServerDraftSeedTranslator = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>,
) => string;

const stripCommandSuffix = (value: string): string =>
  value.replace(/\.(exe|cmd|bat|ps1|c?m?[jt]s|py)$/iu, '');

const translateDraftSeedCopy = (
  translate: MCPServerDraftSeedTranslator | undefined,
  key: string,
  fallback: string,
): string => {
  if (!translate) return fallback;
  const translated = translate(key);
  return translated && translated !== key ? translated : fallback;
};

const toDisplayNamePart = (value: string): string => {
  const text = String(value || '').trim();
  if (!text) return '';
  const lastPathPart = text.split(/[\\/]/u).filter(Boolean).pop() || text;
  const packagePart = lastPathPart.includes('/') ? lastPathPart.split('/').filter(Boolean).pop() || lastPathPart : lastPathPart;
  return stripCommandSuffix(packagePart).replace(/^@/u, '').trim();
};

const findDockerImageArg = (args: string[]): string => {
  const runIndex = args.findIndex((arg) => arg.toLowerCase() === 'run');
  const candidates = runIndex >= 0 ? args.slice(runIndex + 1) : args;
  const optionsWithValue = new Set([
    '-e',
    '--env',
    '--name',
    '--network',
    '-v',
    '--volume',
    '-p',
    '--publish',
    '--entrypoint',
    '-w',
    '--workdir',
    '-u',
    '--user',
    '--platform',
    '-h',
    '--hostname',
  ]);

  for (let index = 0; index < candidates.length; index += 1) {
    const arg = String(candidates[index] || '').trim();
    if (!arg) continue;
    if (arg.startsWith('-')) {
      if (optionsWithValue.has(arg.toLowerCase())) {
        index += 1;
      }
      continue;
    }
    if (arg.includes('=') || arg.toLowerCase() === 'run') {
      continue;
    }
    return arg;
  }
  return '';
};

const pickDraftNameCandidate = (command: string, args: string[]): string => {
  const commandName = toDisplayNamePart(command).toLowerCase();

  if (['npx', 'npm', 'pnpm', 'yarn', 'uvx', 'uv'].includes(commandName)) {
    return args.find((arg) => arg && !arg.startsWith('-') && arg.toLowerCase() !== 'stdio') || command;
  }
  if (['node', 'bun', 'deno'].includes(commandName)) {
    return args.find((arg) => arg && !arg.startsWith('-') && arg.toLowerCase() !== 'stdio') || command;
  }
  if (['python', 'python3', 'py'].includes(commandName)) {
    const moduleFlagIndex = args.findIndex((arg) => arg === '-m');
    return (moduleFlagIndex >= 0 ? args[moduleFlagIndex + 1] : '') || args.find((arg) => arg && !arg.startsWith('-')) || command;
  }
  if (commandName === 'docker') {
    return findDockerImageArg(args) || command;
  }
  return command;
};

export const buildMCPServerDraftSeed = ({
  args = [],
  command,
  enabled = true,
  env = {},
  name,
  timeoutSeconds,
}: MCPServerDraftSeedInput, translate?: MCPServerDraftSeedTranslator): Partial<AIMCPServerConfig> => {
  const normalizedArgs = args.map((arg) => String(arg || '').trim()).filter(Boolean);
  const commandName = toDisplayNamePart(command).toLowerCase();
  const namePart = toDisplayNamePart(name || pickDraftNameCandidate(command, normalizedArgs)) || translateDraftSeedCopy(
    translate,
    'ai_settings.mcp_server.draft.default_name',
    'MCP service',
  );

  return {
    name: namePart,
    transport: 'stdio',
    command,
    args: normalizedArgs,
    env,
    enabled,
    timeoutSeconds: timeoutSeconds ?? (commandName === 'docker' ? 45 : 20),
  };
};

export const buildMCPQuickAddServerSeed = (
  draft: ParsedMCPCommandDraft,
  translate?: MCPServerDraftSeedTranslator,
): Partial<AIMCPServerConfig> => buildMCPServerDraftSeed({
  command: draft.command,
  args: draft.args,
  env: draft.env,
}, translate);
