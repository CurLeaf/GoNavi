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

export const parseMCPCommandDraft = (input: string): ParseMCPCommandDraftResult => {
  const { tokens, error } = splitShellLikeCommand(input);
  if (error) {
    return { ok: false, error };
  }
  if (tokens.length === 0) {
    return { ok: false, error: '请先粘贴完整命令。' };
  }

  const env: Record<string, string> = {};
  let commandIndex = 0;

  while (commandIndex < tokens.length && ENV_ASSIGNMENT_RE.test(tokens[commandIndex])) {
    const token = tokens[commandIndex];
    const separatorIndex = token.indexOf('=');
    const key = token.slice(0, separatorIndex).trim();
    if (key) {
      env[key] = token.slice(separatorIndex + 1);
    }
    commandIndex += 1;
  }

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
