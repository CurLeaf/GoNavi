import { quoteIdentPart, type FilterCondition } from './sql';
import { t } from '../i18n';

export type WhereConditionSuggestionKind = 'column' | 'operator' | 'keyword';

export type WhereConditionSuggestion = {
  label: string;
  value: string;
  insertText: string;
  detail: string;
  kind: WhereConditionSuggestionKind;
};

const QUICK_WHERE_CONDITION_ID = -1;

const WHERE_KEYWORDS = [
  'AND',
  'OR',
  'NOT',
  'IS',
  'NULL',
  'TRUE',
  'FALSE',
  'IN',
  'LIKE',
  'BETWEEN',
  'EXISTS',
];

const WHERE_OPERATORS = [
  '=',
  '!=',
  '<>',
  '>',
  '>=',
  '<',
  '<=',
  'LIKE',
  'NOT LIKE',
  'IN',
  'BETWEEN',
  'IS NULL',
  'IS NOT NULL',
];

const WHERE_CONTINUATION_KEYWORDS = ['AND', 'OR'];
const WHERE_OPERATOR_CONTEXT_PATTERN = /\bNOT\s+LIKE\b|\bIS\s+NOT\s+NULL\b|\bIS\s+NULL\b|\bIS\s+NOT\b|\bBETWEEN\b|\bLIKE\b|\bIN\b|>=|<=|<>|!=|=|>|</gi;
const WHERE_COMPLETE_SUFFIX_OPERATOR_PATTERN = /\bIS\s+(?:NOT\s+)?NULL\s*$/i;

const toTrimmedString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
};

const normalizeSuggestionPrefix = (value: string): string => {
  const text = String(value || '');
  if (!text || /\s$/.test(text)) return '';

  const identifierMatch = text.match(/([A-Za-z_][A-Za-z0-9_$]*)$/);
  if (identifierMatch) return identifierMatch[1];

  const isBoundary = (char: string | undefined) => !char || /[\s([,{=<>!]/.test(char);
  const boundaryIndex = Math.max(
    text.lastIndexOf(' '),
    text.lastIndexOf('\t'),
    text.lastIndexOf('\n'),
    text.lastIndexOf('('),
    text.lastIndexOf('['),
    text.lastIndexOf(','),
    text.lastIndexOf('{'),
    text.lastIndexOf('='),
    text.lastIndexOf('<'),
    text.lastIndexOf('>'),
    text.lastIndexOf('!'),
  );

  for (const quote of ['`', '"']) {
    const start = text.lastIndexOf(quote);
    if (start < 0 || !isBoundary(text[start - 1])) continue;
    const tokenStart = boundaryIndex + 1;
    const tokenHead = text.slice(tokenStart, start);
    if (tokenHead.includes(quote)) continue;
    return text.slice(start);
  }

  return '';
};

const shouldSuggestOperators = (input: string): boolean => {
  return /\s$/.test(input) && /(?:[A-Za-z_][A-Za-z0-9_$]*|"[^"]+"|`[^`]+`)\s$/.test(input);
};

const isLogicalConnectorCursor = (value: string): boolean => {
  return /(?:^|[\s(])(?:AND|OR|NOT)\s*$/i.test(String(value || ''));
};

const getLastWhereOperatorMatch = (value: string): RegExpMatchArray | null => {
  const matches = [...String(value || '').matchAll(WHERE_OPERATOR_CONTEXT_PATTERN)];
  return matches.length > 0 ? matches[matches.length - 1] : null;
};

const isAwaitingValueAfterOperator = (value: string): boolean => {
  const text = String(value || '');
  if (isLogicalConnectorCursor(text)) return false;
  const operatorMatch = getLastWhereOperatorMatch(text);
  if (!operatorMatch || operatorMatch.index === undefined) return false;
  const afterOperator = text.slice(operatorMatch.index + operatorMatch[0].length);
  return !/\S/.test(afterOperator);
};

const hasCompletedPredicateBeforeCursor = (value: string): boolean => {
  const text = String(value || '');
  if (isLogicalConnectorCursor(text)) return false;
  if (WHERE_COMPLETE_SUFFIX_OPERATOR_PATTERN.test(text)) return true;

  const operatorMatch = getLastWhereOperatorMatch(text);
  if (!operatorMatch || operatorMatch.index === undefined) return false;
  const afterOperator = text.slice(operatorMatch.index + operatorMatch[0].length);
  return /\S/.test(afterOperator);
};

const toOperatorInsertText = (operator: string): string => {
  if (operator === 'IN') return 'IN ()';
  if (operator === 'BETWEEN') return 'BETWEEN  AND ';
  return `${operator} `;
};

export const normalizeQuickWhereCondition = (value: unknown): string => {
  let text = toTrimmedString(value);
  text = text.replace(/^where\b/i, '').trim();
  text = text.replace(/;+\s*$/, '').trim();
  return text;
};

export const validateQuickWhereCondition = (
  value: unknown,
): { ok: true } | { ok: false; message: string } => {
  const text = normalizeQuickWhereCondition(value);
  if (!text) {
    return { ok: true };
  }
  if (/[;]/.test(text) || /--|\/\*/.test(text)) {
    return {
      ok: false,
      message: t('data_grid.filter.invalid_quick_where'),
    };
  }
  return { ok: true };
};

export const buildQuickWhereFilterCondition = (
  value: unknown,
): FilterCondition | null => {
  const text = normalizeQuickWhereCondition(value);
  if (!text) return null;
  return {
    id: QUICK_WHERE_CONDITION_ID,
    enabled: true,
    logic: 'AND',
    column: '',
    op: 'CUSTOM',
    value: text,
    value2: '',
  };
};

export const buildEffectiveFilterConditions = (
  conditions: FilterCondition[] | undefined,
  quickWhereCondition: unknown,
): FilterCondition[] => {
  const baseConditions = Array.isArray(conditions) ? conditions : [];
  const quickCondition = buildQuickWhereFilterCondition(quickWhereCondition);
  if (!quickCondition) {
    return baseConditions;
  }
  return [...baseConditions, quickCondition];
};

export const applyWhereConditionSuggestion = (
  input: string,
  insertText: string,
): string => {
  const text = String(input || '');
  const prefix = normalizeSuggestionPrefix(text);
  if (!prefix) {
    if (text && !/\s$/.test(text) && !/[([,{=<>!]$/.test(text)) {
      return `${text} ${insertText}`;
    }
    return `${text}${insertText}`;
  }
  return `${text.slice(0, text.length - prefix.length)}${insertText}`;
};

export const resolveWhereConditionSelectedValue = ({
  selectedValue,
  currentInput,
  insertText,
}: {
  selectedValue: unknown;
  currentInput: unknown;
  insertText?: unknown;
}): string => {
  const selectedText = String(selectedValue ?? '');
  if (selectedText) {
    return selectedText;
  }
  const insertTextValue = String(insertText ?? '');
  if (!insertTextValue) {
    return String(currentInput ?? '');
  }
  return applyWhereConditionSuggestion(String(currentInput ?? ''), insertTextValue);
};

export const shouldApplyQuickWhereOnEnter = ({
  key,
  shiftKey = false,
  isComposing = false,
  suggestionsOpen = false,
  suggestionCount = 0,
  activeSuggestionId = '',
}: {
  key: unknown;
  shiftKey?: boolean;
  isComposing?: boolean;
  suggestionsOpen?: boolean;
  suggestionCount?: number;
  activeSuggestionId?: unknown;
}): boolean => {
  if (String(key || '') !== 'Enter') return false;
  if (shiftKey || isComposing) return false;
  return !(suggestionsOpen && suggestionCount > 0 && String(activeSuggestionId ?? '').trim());
};

export const resolveWhereConditionSuggestions = ({
  input,
  columnNames,
  dbType,
}: {
  input: string;
  columnNames: string[];
  dbType: string;
}): WhereConditionSuggestion[] => {
  const text = String(input || '');
  const rawPrefix = normalizeSuggestionPrefix(text);
  const prefix = rawPrefix.replace(/^["`]/, '').toLowerCase();
  const textBeforePrefix = rawPrefix ? text.slice(0, text.length - rawPrefix.length) : text;
  const options: WhereConditionSuggestion[] = [];

  if (!isLogicalConnectorCursor(text) && shouldSuggestOperators(text)) {
    WHERE_OPERATORS.forEach((operator) => {
      const insertText = toOperatorInsertText(operator);
      options.push({
        label: operator,
        insertText,
        value: applyWhereConditionSuggestion(text, insertText),
        detail: t('data_grid.filter.suggestion.operator'),
        kind: 'operator',
      });
    });
    return options;
  }

  if (isAwaitingValueAfterOperator(textBeforePrefix)) {
    return options;
  }

  if (hasCompletedPredicateBeforeCursor(textBeforePrefix)) {
    if (!prefix && !/\s$/.test(text)) {
      return options;
    }
    WHERE_CONTINUATION_KEYWORDS
      .filter((keyword) => !prefix || keyword.toLowerCase().startsWith(prefix))
      .forEach((keyword) => {
        const insertText = `${keyword} `;
        options.push({
          label: keyword,
          insertText,
          value: applyWhereConditionSuggestion(text, insertText),
          detail: t('data_grid.filter.suggestion.keyword'),
          kind: 'keyword',
        });
      });
    return options;
  }

  (columnNames || [])
    .map((column) => toTrimmedString(column))
    .filter(Boolean)
    .filter((column) => !prefix || column.toLowerCase().startsWith(prefix))
    .slice(0, 30)
    .forEach((column) => {
      const insertText = quoteIdentPart(dbType, column);
      options.push({
        label: column,
        insertText,
        value: applyWhereConditionSuggestion(text, insertText),
        detail: t('data_grid.filter.suggestion.column'),
        kind: 'column',
      });
    });

  WHERE_KEYWORDS
    .filter((keyword) => !prefix || keyword.toLowerCase().startsWith(prefix))
    .forEach((keyword) => {
      const insertText = `${keyword} `;
      options.push({
        label: keyword,
        insertText,
        value: applyWhereConditionSuggestion(text, insertText),
        detail: t('data_grid.filter.suggestion.keyword'),
        kind: 'keyword',
      });
    });

  return options;
};
