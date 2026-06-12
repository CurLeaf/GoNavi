export interface ParsedMCPCommandDraft {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface ParseMCPCommandDraftResult {
  ok: boolean;
  draft?: ParsedMCPCommandDraft;
  error?: string;
}

const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=.*/u;
const POWERSHELL_ENV_ASSIGNMENT_RE = /^\$env:([A-Za-z_][A-Za-z0-9_]*)=(.*)$/iu;

const pushToken = (tokens: string[], current: string) => {
  if (current) {
    tokens.push(current);
  }
};

export const splitShellLikeCommand = (input: string): { tokens: string[]; error?: string } => {
  const text = String(input || '').trim();
  if (!text) {
    return { tokens: [] };
  }

  const tokens: string[] = [];
  let current = '';
  let quoteMode: '"' | "'" | null = null;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoteMode) {
      if (char === quoteMode) {
        quoteMode = null;
        continue;
      }
      if (char === '\\' && quoteMode === '"' && index + 1 < text.length) {
        const nextChar = text[index + 1];
        if (nextChar === '"' || nextChar === '\\') {
          current += nextChar;
          index += 1;
          continue;
        }
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quoteMode = char;
      continue;
    }

    if (char === ';') {
      pushToken(tokens, current);
      current = '';
      continue;
    }

    if (char === '&' && text[index + 1] === '&') {
      pushToken(tokens, current);
      current = '';
      index += 1;
      continue;
    }

    if (/\s/u.test(char)) {
      pushToken(tokens, current);
      current = '';
      continue;
    }

    if (char === '\\' && index + 1 < text.length) {
      const nextChar = text[index + 1];
      if (/\s/u.test(nextChar) || nextChar === '"' || nextChar === "'" || nextChar === '\\') {
        current += nextChar;
        index += 1;
        continue;
      }
    }

    current += char;
  }

  if (quoteMode) {
    return {
      tokens,
      error: '命令中存在未闭合的引号，请检查后重试。',
    };
  }

  pushToken(tokens, current);
  return { tokens };
};

const consumeEnvAssignmentToken = (token: string, env: Record<string, string>): boolean => {
  const text = String(token || '').trim();
  if (!text) return false;

  const powershellMatch = text.match(POWERSHELL_ENV_ASSIGNMENT_RE);
  if (powershellMatch) {
    env[powershellMatch[1]] = powershellMatch[2] || '';
    return true;
  }

  if (!ENV_ASSIGNMENT_RE.test(text)) return false;
  const separatorIndex = text.indexOf('=');
  const key = text.slice(0, separatorIndex).trim();
  if (!key) return false;
  env[key] = text.slice(separatorIndex + 1);
  return true;
};

const isEnvAssignmentToken = (token: string): boolean => {
  const text = String(token || '').trim();
  return Boolean(text.match(POWERSHELL_ENV_ASSIGNMENT_RE)) || ENV_ASSIGNMENT_RE.test(text);
};

const consumeLeadingEnvAssignments = (tokens: string[], env: Record<string, string>): number => {
  let commandIndex = 0;

  while (commandIndex < tokens.length) {
    const token = tokens[commandIndex];
    const normalizedToken = String(token || '').trim().toLowerCase();

    if (normalizedToken === 'set' && tokens[commandIndex + 1] && isEnvAssignmentToken(tokens[commandIndex + 1])) {
      consumeEnvAssignmentToken(tokens[commandIndex + 1], env);
      commandIndex += 2;
      continue;
    }

    if (normalizedToken === 'env' && tokens[commandIndex + 1] && isEnvAssignmentToken(tokens[commandIndex + 1])) {
      commandIndex += 1;
      while (commandIndex < tokens.length && consumeEnvAssignmentToken(tokens[commandIndex], env)) {
        commandIndex += 1;
      }
      continue;
    }

    if (consumeEnvAssignmentToken(token, env)) {
      commandIndex += 1;
      continue;
    }

    break;
  }

  return commandIndex;
};

export const parseMCPCommandDraft = (input: string): ParseMCPCommandDraftResult => {
  const { tokens, error } = splitShellLikeCommand(input);
  if (error) {
    return { ok: false, error };
  }
  if (tokens.length === 0) {
    return { ok: false, error: '请先粘贴完整命令。' };
  }

  const env: Record<string, string> = {};
  const commandIndex = consumeLeadingEnvAssignments(tokens, env);

  const command = String(tokens[commandIndex] || '').trim();
  if (!command) {
    return {
      ok: false,
      error: '没有解析出启动命令，请至少提供可执行程序名。',
    };
  }

  return {
    ok: true,
    draft: {
      command,
      args: tokens.slice(commandIndex + 1),
      env,
    },
  };
};
