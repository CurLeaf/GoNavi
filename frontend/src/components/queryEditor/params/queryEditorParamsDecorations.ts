import type * as MonacoNS from 'monaco-editor';
import { optionsForDBType, scanQueryParams } from './queryEditorParamsScan';

const decorationPools = new WeakMap<MonacoNS.editor.IStandaloneCodeEditor, string[]>();

export function applyParamNameDecorations(
  editor: MonacoNS.editor.IStandaloneCodeEditor | null | undefined,
  monaco: typeof MonacoNS | null | undefined,
  paramNames: string[],
  dbType = '',
): void {
  if (!editor || !monaco) {
    return;
  }
  const model = editor.getModel();
  if (!model) {
    return;
  }
  const decorations: MonacoNS.editor.IModelDeltaDecoration[] = [];
  if (paramNames.length > 0) {
    const allowed = new Set(paramNames);
    const spans = scanQueryParams(model.getValue(), optionsForDBType(dbType));
    for (const span of spans) {
      if (!allowed.has(span.name)) {
        continue;
      }
      const start = model.getPositionAt(span.start);
      const end = model.getPositionAt(span.end);
      decorations.push({
        range: new monaco.Range(
          start.lineNumber,
          start.column,
          end.lineNumber,
          end.column,
        ),
        options: {
          inlineClassName: 'gn-query-param-token',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    }
  }
  decorationPools.set(editor, editor.deltaDecorations(decorationPools.get(editor) || [], decorations));
}

export function clearParamNameDecorations(
  editor: MonacoNS.editor.IStandaloneCodeEditor | null | undefined,
): void {
  if (!editor) {
    return;
  }
  decorationPools.set(editor, editor.deltaDecorations(decorationPools.get(editor) || [], []));
}
