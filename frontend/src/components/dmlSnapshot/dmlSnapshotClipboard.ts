import { downloadBrowserTextFile } from '../../utils/browserFileTransfer';
import { buildReverseScript, type DMLSnapshotDetail } from './dmlSnapshotModel';

type ClipboardRuntimeHost = {
  runtime?: {
    ClipboardSetText?: (content: string) => Promise<void> | void;
  };
};

// 与 requestDiagnostics / 审计中心一致：先试浏览器剪贴板，再退回 Wails 运行时。
export const copyTextToClipboard = async (content: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }
  const runtimeClipboard = (window as Window & ClipboardRuntimeHost).runtime?.ClipboardSetText;
  if (typeof runtimeClipboard === 'function') {
    await runtimeClipboard(content);
    return;
  }
  throw new Error('Clipboard unavailable');
};

export const exportReverseScriptFile = (detail: DMLSnapshotDetail): boolean => {
  const script = buildReverseScript(detail);
  if (!script.trim()) return false;
  // 文件名只带表名与快照 ID：连接名可能含路径分隔符，直接拼进文件名会失败。
  const safeTable = detail.table.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'snapshot';
  const fileName = `gonavi-reverse-${safeTable}-${detail.id.replace(/[^a-zA-Z0-9_-]+/g, '_')}.sql`;
  return downloadBrowserTextFile(script, fileName, 'application/sql');
};
