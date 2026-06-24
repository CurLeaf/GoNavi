import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

const DEFAULT_APP_LOG_LIMIT = 80;
const MAX_APP_LOG_LIMIT = 200;

const normalizeAppLogLimit = (input: unknown): number => {
  const value = Math.floor(Number(input) || DEFAULT_APP_LOG_LIMIT);
  if (value < 1) return 1;
  if (value > MAX_APP_LOG_LIMIT) return MAX_APP_LOG_LIMIT;
  return value;
};

const normalizeLogLines = (input: unknown): string[] =>
  Array.isArray(input)
    ? input.map((line) => String(line || '').trim()).filter(Boolean)
    : [];

const buildLevelBreakdown = (lines: string[]) => {
  const breakdown = {
    INFO: 0,
    WARN: 0,
    ERROR: 0,
    OTHER: 0,
  };
  lines.forEach((line) => {
    if (line.includes('[INFO]')) {
      breakdown.INFO += 1;
    } else if (line.includes('[WARN]')) {
      breakdown.WARN += 1;
    } else if (line.includes('[ERROR]')) {
      breakdown.ERROR += 1;
    } else {
      breakdown.OTHER += 1;
    }
  });
  return breakdown;
};

export const buildAppLogSnapshot = (params: {
  readResult?: any;
  keyword?: unknown;
  lineLimit?: unknown;
  translate?: AIInspectionTranslator;
}) => {
  const data = params.readResult?.data && typeof params.readResult.data === 'object'
    ? params.readResult.data as Record<string, unknown>
    : {};
  const lines = normalizeLogLines(data.lines);
  const levelBreakdown = buildLevelBreakdown(lines);
  const keyword = String(data.keyword || params.keyword || '').trim();
  const requestedLineLimit = normalizeAppLogLimit(data.requestedLineLimit ?? params.lineLimit);

  return {
    logPath: String(data.logPath || ''),
    keyword,
    requestedLineLimit,
    returnedLineCount: lines.length,
    fileWindowTruncated: data.fileWindowTruncated === true,
    matchedLinesTruncated: data.matchedLinesTruncated === true,
    levelBreakdown,
    hasWarnings: levelBreakdown.WARN > 0,
    hasErrors: levelBreakdown.ERROR > 0,
    lines,
    message: lines.length > 0
      ? ''
      : keyword
        ? translateInspectionCopy(
          params.translate,
          'ai_chat.inspection.app_log.message.no_keyword_match',
          `No recent log entries matched keyword "${keyword}".`,
          { keyword },
        )
        : translateInspectionCopy(
          params.translate,
          'ai_chat.inspection.app_log.message.no_readable_entries',
          'No readable recent log entries are available.',
        ),
  };
};
