import type { AIMCPServerConfig } from '../types';
import type { ParsedMCPEnvDraft } from './mcpEnvDraft';
import { splitShellLikeCommand } from './mcpCommandDraft';

export type MCPServerDraftIssueSeverity = 'error' | 'warning' | 'info';

export interface MCPServerDraftIssue {
  key: string;
  severity: MCPServerDraftIssueSeverity;
  title: string;
  detail: string;
}

export interface MCPServerDraftValidation {
  issues: MCPServerDraftIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  canTest: boolean;
  canSave: boolean;
}

const KNOWN_LAUNCHER_COMMANDS = new Set([
  'node',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'bun',
  'deno',
  'python',
  'python3',
  'py',
  'uv',
  'uvx',
  'go',
  'java',
  'cmd',
  'powershell',
  'pwsh',
]);

const ENV_ASSIGNMENT_RE = /^(\$env:)?[A-Za-z_][A-Za-z0-9_]*=/u;

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

const countIssues = (issues: MCPServerDraftIssue[], severity: MCPServerDraftIssueSeverity): number =>
  issues.filter((issue) => issue.severity === severity).length;

const firstShellToken = (value: string): string => {
  const { tokens } = splitShellLikeCommand(value);
  return toTrimmedString(tokens[0]).toLowerCase();
};

const commandLooksLikeWholeLine = (command: string): boolean => {
  const text = toTrimmedString(command);
  if (!text) return false;
  const { tokens } = splitShellLikeCommand(text);
  if (tokens.length <= 1) return false;

  const firstToken = toTrimmedString(tokens[0]).toLowerCase();
  if (KNOWN_LAUNCHER_COMMANDS.has(firstToken)) return true;
  if (ENV_ASSIGNMENT_RE.test(tokens[0])) return true;
  return tokens.some((token, index) => index > 0 && String(token || '').startsWith('--'));
};

const argsContainEnvOrShellGlue = (args: string[]): boolean =>
  args.some((arg) => {
    const text = toTrimmedString(arg);
    if (!text) return false;
    const lower = text.toLowerCase();
    return ENV_ASSIGNMENT_RE.test(text) || lower === 'env' || lower === 'set' || text === '&&' || text === ';';
  });

const launcherUsuallyNeedsArgs = (command: string): boolean => {
  const firstToken = firstShellToken(command);
  return ['node', 'python', 'python3', 'py', 'uvx', 'npx', 'bun', 'deno', 'go', 'java'].includes(firstToken);
};

export const validateMCPServerDraft = (
  server: Pick<AIMCPServerConfig, 'name' | 'transport' | 'command' | 'args' | 'timeoutSeconds'>,
  parsedEnvDraft?: Pick<ParsedMCPEnvDraft, 'invalidLines'>,
): MCPServerDraftValidation => {
  const issues: MCPServerDraftIssue[] = [];
  const command = toTrimmedString(server.command);
  const args = Array.isArray(server.args) ? server.args.map(toTrimmedString).filter(Boolean) : [];
  const timeoutSeconds = Number(server.timeoutSeconds);

  if (!toTrimmedString(server.name)) {
    issues.push({
      key: 'name-missing',
      severity: 'warning',
      title: '服务名称为空',
      detail: '建议写成 Browser、GitHub、Filesystem 这类用途名；否则保存后只能靠命令名识别。',
    });
  }

  if (server.transport !== 'stdio') {
    issues.push({
      key: 'transport-unsupported',
      severity: 'error',
      title: '传输方式不支持',
      detail: '当前 GoNavi 新增 MCP 服务只支持 stdio，请保持传输方式为 stdio。',
    });
  }

  if (!command) {
    issues.push({
      key: 'command-missing',
      severity: 'error',
      title: '启动命令未填写',
      detail: '至少填写 node、uvx、python 或本机 exe 路径；脚本名和 --stdio 放到命令参数里。',
    });
  } else if (commandLooksLikeWholeLine(command)) {
    issues.push({
      key: 'command-whole-line',
      severity: 'warning',
      title: '启动命令可能填成了整行命令',
      detail: '启动命令只填可执行程序本身；把脚本名、模块名、--stdio 和环境变量拆到命令参数或环境变量里。',
    });
  }

  if (command && launcherUsuallyNeedsArgs(command) && args.length === 0) {
    issues.push({
      key: 'args-missing-for-launcher',
      severity: 'warning',
      title: '命令参数可能缺少脚本或模块名',
      detail: 'node、python、uvx、npx 这类启动器通常还需要 server.js、-m your_server 或包名作为参数。',
    });
  }

  if (argsContainEnvOrShellGlue(args)) {
    issues.push({
      key: 'args-contain-env-or-shell-glue',
      severity: 'warning',
      title: '命令参数里疑似混入环境变量或 Shell 连接符',
      detail: 'KEY=VALUE、$env:KEY=VALUE、set、env、&& 这类内容应放到完整命令自动拆分或环境变量输入框里。',
    });
  }

  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 3 || timeoutSeconds > 120) {
    issues.push({
      key: 'timeout-out-of-range',
      severity: 'warning',
      title: '超时时间不在推荐范围内',
      detail: 'GoNavi 最终会限制在 3 到 120 秒之间；本机常规服务建议 20 秒，慢启动服务建议 45 或 60 秒。',
    });
  }

  const invalidEnvLines = parsedEnvDraft?.invalidLines || [];
  if (invalidEnvLines.length > 0) {
    issues.push({
      key: 'env-invalid-lines',
      severity: 'error',
      title: '环境变量存在无效行',
      detail: `每行必须是 KEY=VALUE，当前有 ${invalidEnvLines.length} 行不会保存：${invalidEnvLines.slice(0, 2).join(' / ')}`,
    });
  }

  const errorCount = countIssues(issues, 'error');
  const warningCount = countIssues(issues, 'warning');
  const infoCount = countIssues(issues, 'info');

  return {
    issues,
    errorCount,
    warningCount,
    infoCount,
    canTest: errorCount === 0,
    canSave: errorCount === 0,
  };
};
