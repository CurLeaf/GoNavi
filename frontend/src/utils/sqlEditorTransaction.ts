const SQL_EDITOR_DML_KEYWORDS = new Set(['insert', 'update', 'delete', 'replace', 'merge', 'upsert']);
const SQL_EDITOR_READ_KEYWORDS = new Set(['select', 'with', 'show', 'describe', 'desc', 'explain', 'pragma', 'values']);
const SQL_EDITOR_TRANSACTION_CONTROL_KEYWORDS = new Set(['begin', 'commit', 'rollback', 'savepoint', 'release']);

const isSqlEditorKeywordChar = (char: string | undefined): boolean => !!char && /[A-Za-z0-9_]/.test(char);

const skipSqlEditorTrivia = (text: string, start: number): number => {
    let pos = start;
    while (pos < text.length) {
        const char = text[pos];
        if (/\s/.test(char || '')) {
            pos++;
            continue;
        }
        if (text.startsWith('--', pos) || text.startsWith('#', pos)) {
            const nextLine = text.indexOf('\n', pos);
            if (nextLine < 0) return text.length;
            pos = nextLine + 1;
            continue;
        }
        if (text.startsWith('/*', pos)) {
            const blockEnd = text.indexOf('*/', pos + 2);
            if (blockEnd < 0) return text.length;
            pos = blockEnd + 2;
            continue;
        }
        return pos;
    }
    return pos;
};

const readSqlEditorKeyword = (text: string, start: number): { keyword: string; end: number } => {
    const pos = skipSqlEditorTrivia(text, start);
    if (!isSqlEditorKeywordChar(text[pos])) {
        return { keyword: '', end: pos };
    }
    let end = pos + 1;
    while (isSqlEditorKeywordChar(text[end])) {
        end++;
    }
    return { keyword: text.slice(pos, end).toLowerCase(), end };
};

const skipSqlEditorDelimited = (text: string, start: number, delimiter: string): number => {
    let pos = start + 1;
    while (pos < text.length) {
        if (text[pos] === delimiter) {
            if (text[pos + 1] === delimiter) {
                pos += 2;
                continue;
            }
            return pos + 1;
        }
        pos++;
    }
    return text.length;
};

const resolveSqlEditorDollarQuoteTag = (text: string, start: number): string => {
    if (text[start] !== '$') return '';
    let end = start + 1;
    while (isSqlEditorKeywordChar(text[end])) {
        end++;
    }
    return text[end] === '$' ? text.slice(start, end + 1) : '';
};

const skipSqlEditorQuotedOrComment = (text: string, start: number): number | null => {
    if (text.startsWith('--', start) || text.startsWith('#', start)) {
        const nextLine = text.indexOf('\n', start);
        return nextLine < 0 ? text.length : nextLine + 1;
    }
    if (text.startsWith('/*', start)) {
        const blockEnd = text.indexOf('*/', start + 2);
        return blockEnd < 0 ? text.length : blockEnd + 2;
    }
    const char = text[start];
    if (char === '\'' || char === '"' || char === '`') {
        return skipSqlEditorDelimited(text, start, char);
    }
    if (char === '[') {
        const bracketEnd = text.indexOf(']', start + 1);
        return bracketEnd < 0 ? text.length : bracketEnd + 1;
    }
    const dollarTag = resolveSqlEditorDollarQuoteTag(text, start);
    if (dollarTag) {
        const dollarEnd = text.indexOf(dollarTag, start + dollarTag.length);
        return dollarEnd < 0 ? text.length : dollarEnd + dollarTag.length;
    }
    return null;
};

const skipBalancedSqlEditorParens = (text: string, start: number): number => {
    if (text[start] !== '(') return -1;
    let depth = 0;
    let pos = start;
    while (pos < text.length) {
        const skipped = skipSqlEditorQuotedOrComment(text, pos);
        if (skipped !== null) {
            pos = skipped;
            continue;
        }
        if (text[pos] === '(') {
            depth++;
            pos++;
            continue;
        }
        if (text[pos] === ')') {
            depth--;
            pos++;
            if (depth === 0) return pos;
            continue;
        }
        pos++;
    }
    return -1;
};

const skipSqlEditorIdentifierToken = (text: string, start: number): number => {
    if (start >= text.length) return -1;
    const char = text[start];
    if (char === '"' || char === '`') return skipSqlEditorDelimited(text, start, char);
    if (char === '[') {
        const bracketEnd = text.indexOf(']', start + 1);
        return bracketEnd < 0 ? text.length : bracketEnd + 1;
    }
    if (!isSqlEditorKeywordChar(char)) return -1;
    let end = start + 1;
    while (isSqlEditorKeywordChar(text[end])) {
        end++;
    }
    return end;
};

const findTopLevelSqlEditorKeyword = (text: string, start: number, keyword: string): number => {
    let depth = 0;
    let pos = start;
    while (pos < text.length) {
        const skipped = skipSqlEditorQuotedOrComment(text, pos);
        if (skipped !== null) {
            pos = skipped;
            continue;
        }
        if (text[pos] === '(') {
            depth++;
            pos++;
            continue;
        }
        if (text[pos] === ')') {
            if (depth > 0) depth--;
            pos++;
            continue;
        }
        if (depth === 0 && isSqlEditorKeywordChar(text[pos])) {
            let end = pos + 1;
            while (isSqlEditorKeywordChar(text[end])) {
                end++;
            }
            if (text.slice(pos, end).toLowerCase() === keyword) {
                return end;
            }
            pos = end;
            continue;
        }
        pos++;
    }
    return -1;
};

const resolveSqlEditorKeywordAfterWith = (text: string, start: number): string => {
    let pos = skipSqlEditorTrivia(text, start);
    const recursive = readSqlEditorKeyword(text, pos);
    if (recursive.keyword === 'recursive') {
        pos = recursive.end;
    }

    while (pos < text.length) {
        pos = skipSqlEditorTrivia(text, pos);
        const identifierEnd = skipSqlEditorIdentifierToken(text, pos);
        if (identifierEnd < 0) return '';
        pos = skipSqlEditorTrivia(text, identifierEnd);
        if (text[pos] === '(') {
            const columnsEnd = skipBalancedSqlEditorParens(text, pos);
            if (columnsEnd < 0) return '';
            pos = skipSqlEditorTrivia(text, columnsEnd);
        }

        const asEnd = findTopLevelSqlEditorKeyword(text, pos, 'as');
        if (asEnd < 0) return '';
        pos = skipSqlEditorTrivia(text, asEnd);
        const materialized = readSqlEditorKeyword(text, pos);
        if (materialized.keyword === 'not') {
            const next = readSqlEditorKeyword(text, materialized.end);
            if (next.keyword === 'materialized') {
                pos = next.end;
            }
        } else if (materialized.keyword === 'materialized') {
            pos = materialized.end;
        }

        pos = skipSqlEditorTrivia(text, pos);
        if (text[pos] !== '(') return '';
        const cteEnd = skipBalancedSqlEditorParens(text, pos);
        if (cteEnd < 0) return '';
        pos = skipSqlEditorTrivia(text, cteEnd);
        if (text[pos] === ',') {
            pos++;
            continue;
        }

        return readSqlEditorKeyword(text, pos).keyword;
    }
    return '';
};

export const resolveSqlEditorOperationKeyword = (statement: string): string => {
    const text = String(statement || '');
    const leading = readSqlEditorKeyword(text, 0);
    if (leading.keyword !== 'with') {
        return leading.keyword;
    }
    return resolveSqlEditorKeywordAfterWith(text, leading.end) || leading.keyword;
};

const isSqlEditorTransactionControlStatement = (statement: string): boolean => {
    const keyword = readSqlEditorKeyword(String(statement || ''), 0).keyword;
    if (SQL_EDITOR_TRANSACTION_CONTROL_KEYWORDS.has(keyword)) return true;
    return keyword === 'start' && /\btransaction\b/i.test(statement);
};

export const shouldUseSqlEditorManagedTransaction = (statements: string[]): boolean => {
    let hasManagedWrite = false;
    for (const statement of statements) {
        const trimmed = String(statement || '').trim();
        if (!trimmed) continue;
        if (isSqlEditorTransactionControlStatement(trimmed)) return false;
        const keyword = resolveSqlEditorOperationKeyword(trimmed);
        if (SQL_EDITOR_READ_KEYWORDS.has(keyword)) continue;
        if (SQL_EDITOR_DML_KEYWORDS.has(keyword)) {
            hasManagedWrite = true;
            continue;
        }
        return false;
    }
    return hasManagedWrite;
};
