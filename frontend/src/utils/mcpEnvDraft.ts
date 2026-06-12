export interface ParsedMCPEnvDraft {
  env: Record<string, string>;
  invalidLines: string[];
  totalLines: number;
  validLines: number;
}

export const formatMCPEnvDraft = (env?: Record<string, string>): string =>
  Object.entries(env || {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

export const parseMCPEnvDraft = (input: string): ParsedMCPEnvDraft => {
  const env: Record<string, string> = {};
  const invalidLines: string[] = [];
  let totalLines = 0;
  let validLines = 0;

  String(input || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line) {
        return;
      }
      totalLines += 1;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        invalidLines.push(line);
        return;
      }
      const key = line.slice(0, separatorIndex).trim();
      if (!key || /\s/u.test(key)) {
        invalidLines.push(line);
        return;
      }
      env[key] = line.slice(separatorIndex + 1);
      validLines += 1;
    });

  return {
    env,
    invalidLines,
    totalLines,
    validLines,
  };
};
