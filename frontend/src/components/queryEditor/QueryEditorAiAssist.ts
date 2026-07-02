import type {
    AIProviderConfig,
    AIUserPromptSettings,
} from '../../types';
import type {
    CompletionColumnMeta,
    CompletionTableMeta,
} from './QueryEditorHelpers';

export type QueryEditorAiApplyMode = 'insert' | 'replaceSelection' | 'replaceAll';

export interface QueryEditorAiService {
    AIGetProviders?: () => Promise<AIProviderConfig[]>;
    AIGetActiveProvider?: () => Promise<string>;
    AIGetUserPromptSettings?: () => Promise<Partial<AIUserPromptSettings>>;
    AIChatSend?: (messages: QueryEditorAiMessage[], tools?: any[]) => Promise<Record<string, any>>;
}

export interface QueryEditorAiMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface QueryEditorAiContext {
    connectionName?: string;
    sourceType?: string;
    currentDb?: string;
    visibleDbs?: string[];
    tables?: CompletionTableMeta[];
    columns?: CompletionColumnMeta[];
}

export interface QueryEditorAiEditorSnapshot {
    prefix: string;
    suffix: string;
    currentLineBeforeCursor: string;
    currentLineAfterCursor: string;
}

export interface QueryEditorAiRuntimeReadiness {
    ready: boolean;
    reason?: 'service_unavailable' | 'provider_missing' | 'model_missing';
    provider?: AIProviderConfig;
    userPromptSettings: AIUserPromptSettings;
}

const EMPTY_USER_PROMPT_SETTINGS: AIUserPromptSettings = {
    global: '',
    database: '',
    jvm: '',
    jvmDiagnostic: '',
};

const INLINE_PREFIX_LIMIT = 3600;
const INLINE_SUFFIX_LIMIT = 1200;
const TEXT_TO_SQL_PREFIX_LIMIT = 5000;
const TEXT_TO_SQL_SUFFIX_LIMIT = 1800;
const MAX_SCHEMA_SNAPSHOT_CHARS = 7000;
const MAX_SCHEMA_TABLES = 48;
const MAX_SCHEMA_COLUMNS_PER_TABLE = 14;
const MAX_INLINE_INSERT_CHARS = 1800;

const SQL_CODE_FENCE_RE = /```(?:sql|mysql|postgresql|postgres|oracle|plsql|sqlite|sqlserver|mssql|tsql|clickhouse|duckdb|starrocks|tdengine)?\s*([\s\S]*?)```/i;

export const getQueryEditorAiService = (): QueryEditorAiService | undefined =>
    (window as any)?.go?.aiservice?.Service;

export const resolveQueryEditorAiRuntimeReadiness = async (
    service: QueryEditorAiService | undefined,
): Promise<QueryEditorAiRuntimeReadiness> => {
    if (!service?.AIChatSend || !service?.AIGetProviders || !service?.AIGetActiveProvider) {
        return {
            ready: false,
            reason: 'service_unavailable',
            userPromptSettings: EMPTY_USER_PROMPT_SETTINGS,
        };
    }

    const [providers, activeProviderId, rawUserPromptSettings] = await Promise.all([
        service.AIGetProviders(),
        service.AIGetActiveProvider(),
        service.AIGetUserPromptSettings?.().catch(() => EMPTY_USER_PROMPT_SETTINGS),
    ]);
    const provider = Array.isArray(providers)
        ? providers.find((item) => item.id === activeProviderId)
        : undefined;
    const userPromptSettings = {
        ...EMPTY_USER_PROMPT_SETTINGS,
        ...(rawUserPromptSettings || {}),
    };

    if (!provider) {
        return {
            ready: false,
            reason: 'provider_missing',
            userPromptSettings,
        };
    }
    if (!String(provider.model || '').trim()) {
        return {
            ready: false,
            reason: 'model_missing',
            provider,
            userPromptSettings,
        };
    }

    return {
        ready: true,
        provider,
        userPromptSettings,
    };
};

export const shouldRequestQueryEditorInlineCompletion = (
    snapshot: QueryEditorAiEditorSnapshot,
): boolean => {
    const lineAfterCursor = String(snapshot.currentLineAfterCursor || '');
    if (lineAfterCursor.length > 0) {
        return false;
    }

    const prefix = String(snapshot.prefix || '');
    const currentStatement = getCurrentStatementPrefix(prefix);
    const trimmedStatement = currentStatement.trim();
    if (trimmedStatement.length < 3) {
        return false;
    }
    if (/[;)]\s*$/.test(trimmedStatement)) {
        return false;
    }

    const currentLine = String(snapshot.currentLineBeforeCursor || '');
    const trimmedLine = currentLine.trimStart();
    if (trimmedLine.startsWith('--') || trimmedLine.startsWith('#')) {
        return false;
    }
    if (currentLine.includes('--')) {
        return false;
    }
    if (hasUnclosedBlockComment(prefix) || hasUnclosedSqlString(currentStatement)) {
        return false;
    }

    return true;
};

export const requestQueryEditorInlineCompletion = async ({
    service,
    aiContext,
    editorSnapshot,
}: {
    service: QueryEditorAiService | undefined;
    aiContext: QueryEditorAiContext;
    editorSnapshot: QueryEditorAiEditorSnapshot;
}): Promise<string> => {
    if (!shouldRequestQueryEditorInlineCompletion(editorSnapshot)) {
        return '';
    }

    const readiness = await resolveQueryEditorAiRuntimeReadiness(service);
    if (!readiness.ready || !readiness.provider) {
        return '';
    }

    const messages = buildQueryEditorInlineCompletionMessages({
        aiContext,
        editorSnapshot,
        userPromptSettings: readiness.userPromptSettings,
    });
    const result = await service!.AIChatSend!(messages, []);
    if (!result?.success || !result.content) {
        return '';
    }

    const sanitized = sanitizeSqlAssistantResponse(String(result.content || ''));
    const insertText = resolveInlineSqlInsertText(sanitized, editorSnapshot.prefix);
    return limitInlineInsertText(insertText);
};

export const requestQueryEditorTextToSql = async ({
    service,
    aiContext,
    editorSnapshot,
    instruction,
}: {
    service: QueryEditorAiService | undefined;
    aiContext: QueryEditorAiContext;
    editorSnapshot: QueryEditorAiEditorSnapshot;
    instruction: string;
}): Promise<{ sql: string; readiness: QueryEditorAiRuntimeReadiness }> => {
    const readiness = await resolveQueryEditorAiRuntimeReadiness(service);
    if (!readiness.ready) {
        return { sql: '', readiness };
    }

    const messages = buildQueryEditorTextToSqlMessages({
        aiContext,
        editorSnapshot,
        instruction,
        userPromptSettings: readiness.userPromptSettings,
    });
    const result = await service!.AIChatSend!(messages, []);
    if (!result?.success) {
        throw new Error(String(result?.error || 'AI request failed'));
    }

    return {
        sql: sanitizeSqlAssistantResponse(String(result.content || '')),
        readiness,
    };
};

export const buildQueryEditorInlineCompletionMessages = ({
    aiContext,
    editorSnapshot,
    userPromptSettings,
}: {
    aiContext: QueryEditorAiContext;
    editorSnapshot: QueryEditorAiEditorSnapshot;
    userPromptSettings: AIUserPromptSettings;
}): QueryEditorAiMessage[] => [
    {
        role: 'system',
        content: [
            'You are GoNavi SQL inline completion.',
            'Return only the exact SQL text that should be inserted at the cursor.',
            'Do not use Markdown, code fences, explanations, comments about your answer, or natural language.',
            'Continue the current SQL instead of repeating text that already exists before the cursor.',
            'Respect the database dialect, current database, and schema hints. Prefer concise, executable SQL.',
        ].join('\n'),
    },
    ...buildCustomPromptMessages(userPromptSettings),
    {
        role: 'user',
        content: [
            buildQueryEditorAiContextBlock(aiContext),
            'Editor snapshot:',
            '<prefix_before_cursor>',
            truncateHead(editorSnapshot.prefix, INLINE_PREFIX_LIMIT),
            '</prefix_before_cursor>',
            '<suffix_after_cursor>',
            truncateTail(editorSnapshot.suffix, INLINE_SUFFIX_LIMIT),
            '</suffix_after_cursor>',
            'The cursor is at the end of prefix_before_cursor. Generate the continuation text only.',
        ].join('\n'),
    },
];

export const buildQueryEditorTextToSqlMessages = ({
    aiContext,
    editorSnapshot,
    instruction,
    userPromptSettings,
}: {
    aiContext: QueryEditorAiContext;
    editorSnapshot: QueryEditorAiEditorSnapshot;
    instruction: string;
    userPromptSettings: AIUserPromptSettings;
}): QueryEditorAiMessage[] => [
    {
        role: 'system',
        content: [
            'You are GoNavi Text-to-SQL.',
            'Generate SQL for the SQL editor from the user request.',
            'Return only SQL. Do not use Markdown, code fences, or explanations.',
            'Respect the database dialect, current database, schema hints, and existing editor context.',
            'Prefer read-only SQL unless the user explicitly asks for data or schema changes.',
        ].join('\n'),
    },
    ...buildCustomPromptMessages(userPromptSettings),
    {
        role: 'user',
        content: [
            buildQueryEditorAiContextBlock(aiContext),
            'User request:',
            instruction.trim(),
            '',
            'Current editor context:',
            '<prefix_before_cursor>',
            truncateHead(editorSnapshot.prefix, TEXT_TO_SQL_PREFIX_LIMIT),
            '</prefix_before_cursor>',
            '<suffix_after_cursor>',
            truncateTail(editorSnapshot.suffix, TEXT_TO_SQL_SUFFIX_LIMIT),
            '</suffix_after_cursor>',
        ].join('\n'),
    },
];

export const sanitizeSqlAssistantResponse = (raw: string): string => {
    let text = String(raw || '').trim();
    const fenceMatch = text.match(SQL_CODE_FENCE_RE);
    if (fenceMatch?.[1]) {
        text = fenceMatch[1].trim();
    }
    text = text
        .replace(/^\s*(?:sql|query|answer)\s*[:：]\s*/i, '')
        .replace(/^\s*Here is (?:the )?SQL\s*[:：]\s*/i, '')
        .trim();
    if (
        text.length >= 2
        && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
        && !text.includes('\n')
    ) {
        text = text.slice(1, -1).trim();
    }
    return text;
};

export const resolveInlineSqlInsertText = (generatedSql: string, prefix: string): string => {
    const generated = String(generatedSql || '').trimEnd();
    if (!generated.trim()) {
        return '';
    }

    const prefixText = String(prefix || '');
    const statementPrefix = getCurrentStatementPrefix(prefixText);
    const candidates = [
        prefixText.slice(-INLINE_PREFIX_LIMIT),
        statementPrefix,
        statementPrefix.trimStart(),
    ].filter(Boolean);

    for (const candidate of candidates) {
        const overlap = findCaseInsensitiveOverlap(candidate, generated);
        if (overlap > 0) {
            return generated.slice(overlap);
        }
    }

    if (/\w$/.test(prefixText) && /^\w/.test(generated)) {
        return ` ${generated}`;
    }
    return generated;
};

export const buildQueryEditorAiContextBlock = (context: QueryEditorAiContext): string => {
    const sourceType = String(context.sourceType || '').trim() || 'unknown';
    const connectionName = String(context.connectionName || '').trim() || 'unknown';
    const currentDb = String(context.currentDb || '').trim() || 'default';
    const visibleDbs = (context.visibleDbs || [])
        .map((db) => String(db || '').trim())
        .filter(Boolean)
        .slice(0, 24)
        .join(', ');

    return [
        'Database context:',
        `- source_type: ${sourceType}`,
        `- connection: ${connectionName}`,
        `- current_database: ${currentDb}`,
        visibleDbs ? `- visible_databases: ${visibleDbs}` : '',
        'Schema hints:',
        buildSchemaSnapshot(context),
    ].filter(Boolean).join('\n');
};

const buildCustomPromptMessages = (settings: AIUserPromptSettings): QueryEditorAiMessage[] => {
    const prompts = [
        String(settings.global || '').trim(),
        String(settings.database || '').trim(),
    ].filter(Boolean);
    if (!prompts.length) {
        return [];
    }
    return [{
        role: 'system',
        content: [
            'User configured GoNavi AI instructions:',
            ...prompts.map((prompt, index) => `Instruction ${index + 1}:\n${prompt}`),
        ].join('\n\n'),
    }];
};

const buildSchemaSnapshot = (context: QueryEditorAiContext): string => {
    const currentDb = String(context.currentDb || '').trim().toLowerCase();
    const columnsByTable = new Map<string, CompletionColumnMeta[]>();
    (context.columns || []).forEach((column) => {
        const key = schemaItemKey(column.dbName, column.tableName);
        const existing = columnsByTable.get(key) || [];
        if (existing.length < MAX_SCHEMA_COLUMNS_PER_TABLE) {
            existing.push(column);
            columnsByTable.set(key, existing);
        }
    });

    const tables = [...(context.tables || [])]
        .filter((table) => String(table.tableName || '').trim())
        .sort((left, right) => {
            const leftDb = String(left.dbName || '').trim().toLowerCase();
            const rightDb = String(right.dbName || '').trim().toLowerCase();
            if (leftDb === currentDb && rightDb !== currentDb) return -1;
            if (rightDb === currentDb && leftDb !== currentDb) return 1;
            return String(left.tableName || '').localeCompare(String(right.tableName || ''));
        })
        .slice(0, MAX_SCHEMA_TABLES);

    if (!tables.length) {
        return '- No table metadata is loaded yet. Use the current SQL and database name as context.';
    }

    const lines = tables.map((table) => {
        const dbName = String(table.dbName || context.currentDb || '').trim();
        const tableName = String(table.tableName || '').trim();
        const columns = columnsByTable.get(schemaItemKey(dbName, tableName)) || [];
        const columnText = columns.length
            ? columns.map((column) => {
                const type = String(column.type || '').trim();
                const comment = String(column.comment || '').trim();
                return [
                    String(column.name || '').trim(),
                    type ? ` ${type}` : '',
                    comment ? ` -- ${comment}` : '',
                ].join('');
            }).join(', ')
            : 'columns unavailable';
        const comment = String(table.comment || '').trim();
        return `- ${dbName ? `${dbName}.` : ''}${tableName}${comment ? ` -- ${comment}` : ''}; columns: ${columnText}`;
    });

    const snapshot = lines.join('\n');
    return snapshot.length > MAX_SCHEMA_SNAPSHOT_CHARS
        ? `${snapshot.slice(0, MAX_SCHEMA_SNAPSHOT_CHARS)}\n- ...schema snapshot truncated`
        : snapshot;
};

const schemaItemKey = (dbName: string, tableName: string): string =>
    `${String(dbName || '').trim().toLowerCase()}\u0000${String(tableName || '').trim().toLowerCase()}`;

const getCurrentStatementPrefix = (prefix: string): string => {
    const text = String(prefix || '');
    const semicolonIndex = text.lastIndexOf(';');
    return semicolonIndex >= 0 ? text.slice(semicolonIndex + 1) : text;
};

const hasUnclosedBlockComment = (text: string): boolean =>
    String(text || '').lastIndexOf('/*') > String(text || '').lastIndexOf('*/');

const hasUnclosedSqlString = (text: string): boolean => {
    let singleOpen = false;
    let doubleOpen = false;
    let backtickOpen = false;
    const value = String(text || '');
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        const next = value[index + 1];
        if (char === "'" && !doubleOpen && !backtickOpen) {
            if (next === "'") {
                index += 1;
            } else {
                singleOpen = !singleOpen;
            }
        } else if (char === '"' && !singleOpen && !backtickOpen) {
            doubleOpen = !doubleOpen;
        } else if (char === '`' && !singleOpen && !doubleOpen) {
            backtickOpen = !backtickOpen;
        }
    }
    return singleOpen || doubleOpen || backtickOpen;
};

const findCaseInsensitiveOverlap = (prefix: string, completion: string): number => {
    const left = String(prefix || '');
    const right = String(completion || '');
    const max = Math.min(left.length, right.length);
    const leftLower = left.toLowerCase();
    const rightLower = right.toLowerCase();
    for (let length = max; length > 0; length -= 1) {
        if (leftLower.slice(left.length - length) === rightLower.slice(0, length)) {
            return length;
        }
    }
    return 0;
};

const truncateHead = (text: string, limit: number): string => {
    const value = String(text || '');
    if (value.length <= limit) return value;
    return value.slice(value.length - limit);
};

const truncateTail = (text: string, limit: number): string => {
    const value = String(text || '');
    if (value.length <= limit) return value;
    return value.slice(0, limit);
};

const limitInlineInsertText = (text: string): string => {
    const value = String(text || '').trimEnd();
    if (value.length <= MAX_INLINE_INSERT_CHARS) {
        return value;
    }
    const truncated = value.slice(0, MAX_INLINE_INSERT_CHARS);
    const lastStatementEnd = Math.max(truncated.lastIndexOf(';'), truncated.lastIndexOf('\n'));
    return (lastStatementEnd > 80 ? truncated.slice(0, lastStatementEnd + 1) : truncated).trimEnd();
};
