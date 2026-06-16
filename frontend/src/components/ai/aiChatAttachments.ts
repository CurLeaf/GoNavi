import { strFromU8, unzipSync } from 'fflate';
import type { AIChatAttachment, AIChatAttachmentKind } from '../../types';

export const AI_CHAT_ATTACHMENT_ACCEPT = [
  'image/*',
  '.md',
  '.markdown',
  '.txt',
  '.csv',
  '.tsv',
  '.json',
  '.sql',
  '.log',
  '.xml',
  '.yaml',
  '.yml',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
].join(',');

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT_CHARS = 60000;
const MAX_PROMPT_TEXT_CHARS = 50000;

const textExtensions = new Set([
  'md',
  'markdown',
  'txt',
  'csv',
  'tsv',
  'json',
  'sql',
  'log',
  'xml',
  'yaml',
  'yml',
]);

const nextAttachmentId = () => `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const formatAIChatAttachmentSize = (size: number): string => {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const getFileExtension = (name: string): string => {
  const match = String(name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
};

export const resolveAIChatAttachmentKind = (file: Pick<File, 'name' | 'type'>): AIChatAttachmentKind => {
  const mimeType = String(file.type || '').toLowerCase();
  const extension = getFileExtension(file.name);
  if (mimeType.startsWith('image/')) return 'image';
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (extension === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (extension === 'doc' || extension === 'docx' || mimeType.includes('word')) return 'word';
  if (extension === 'xls' || extension === 'xlsx' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'excel';
  if (textExtensions.has(extension) || mimeType.startsWith('text/')) return 'text';
  return 'document';
};

const clampExtractedText = (raw: string): { text: string; truncated: boolean } => {
  const normalized = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (normalized.length <= MAX_ATTACHMENT_TEXT_CHARS) {
    return { text: normalized, truncated: false };
  }
  return {
    text: normalized.slice(0, MAX_ATTACHMENT_TEXT_CHARS).trimEnd(),
    truncated: true,
  };
};

const decodeXmlEntities = (value: string): string => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'");

const collectXmlTextTags = (xml: string): string[] => {
  const values: string[] = [];
  const tagPattern = /<(?:[a-zA-Z0-9_]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?t>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(xml))) {
    values.push(decodeXmlEntities(match[1].replace(/<[^>]+>/g, '')));
  }
  return values;
};

const extractDocxText = (entries: Record<string, Uint8Array>): string => {
  const xmlPaths = Object.keys(entries)
    .filter((path) => /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(path))
    .sort((left, right) => {
      if (left === 'word/document.xml') return -1;
      if (right === 'word/document.xml') return 1;
      return left.localeCompare(right);
    });
  return xmlPaths.map((path) => {
    const xml = strFromU8(entries[path]);
    const prepared = xml
      .replace(/<w:tab\s*\/>/g, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n');
    return collectXmlTextTags(prepared).join('');
  }).filter(Boolean).join('\n\n');
};

const extractSharedStrings = (entries: Record<string, Uint8Array>): string[] => {
  const sharedStrings = entries['xl/sharedStrings.xml'];
  if (!sharedStrings) return [];
  const xml = strFromU8(sharedStrings);
  const blocks = xml.match(/<si\b[\s\S]*?<\/si>/g) || [];
  return blocks.map((block: string) => collectXmlTextTags(block).join(''));
};

const extractCellValue = (cellXml: string, sharedStrings: string[]): string => {
  const type = cellXml.match(/\bt="([^"]+)"/)?.[1] || '';
  if (type === 'inlineStr') {
    return collectXmlTextTags(cellXml).join('');
  }
  const value = decodeXmlEntities(cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '').trim();
  if (type === 's') {
    const index = Number.parseInt(value, 10);
    return Number.isFinite(index) ? (sharedStrings[index] || '') : value;
  }
  return value;
};

const extractXlsxText = (entries: Record<string, Uint8Array>): string => {
  const sharedStrings = extractSharedStrings(entries);
  const sheetPaths = Object.keys(entries)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  return sheetPaths.map((path) => {
    const xml = strFromU8(entries[path]);
    const rows = xml.match(/<row\b[\s\S]*?<\/row>/g) || [];
    const lines = rows.map((rowXml: string) => {
      const cells = rowXml.match(/<c\b[\s\S]*?<\/c>/g) || [];
      return cells.map((cellXml: string) => extractCellValue(cellXml, sharedStrings)).join('\t').trimEnd();
    }).filter((line: string) => line.trim().length > 0);
    if (lines.length === 0) return '';
    const sheetName = path.replace(/^xl\/worksheets\//i, '').replace(/\.xml$/i, '');
    return `[工作表: ${sheetName}]\n${lines.join('\n')}`;
  }).filter(Boolean).join('\n\n');
};

const decodePdfLiteralString = (value: string): string => value
  .slice(1, -1)
  .replace(/\\n/g, '\n')
  .replace(/\\r/g, '\n')
  .replace(/\\t/g, '\t')
  .replace(/\\([()\\])/g, '$1')
  .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));

const bytesToBinaryString = (bytes: Uint8Array): string => {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.slice(offset, offset + chunkSize)));
  }
  return chunks.join('');
};

const extractPdfText = (bytes: Uint8Array): { text: string; warning?: string } => {
  const raw = bytesToBinaryString(bytes);
  const values: string[] = [];
  const literalPattern = /\((?:\\.|[^\\)]){1,2000}\)/g;
  let match: RegExpExecArray | null;
  while ((match = literalPattern.exec(raw)) && values.length < 5000) {
    const decoded = decodePdfLiteralString(match[0]).trim();
    if (decoded && /[\p{L}\p{N}\u4e00-\u9fa5]/u.test(decoded)) {
      values.push(decoded);
    }
  }
  const text = values.join('\n');
  const warning = text
    ? 'PDF 已使用轻量文本提取；扫描件或压缩字体内容可能无法完整读取。'
    : '未从 PDF 中提取到可读文本；如果是扫描件或复杂编码 PDF，请复制正文后再发送。';
  return { text, warning };
};

const extractLegacyOfficeText = (bytes: Uint8Array): { text: string; warning: string } => {
  const raw = bytesToBinaryString(bytes);
  const matches = raw.match(/[A-Za-z0-9\u4e00-\u9fa5][\x20-\x7E\u4e00-\u9fa5]{3,}/g) || [];
  return {
    text: Array.from(new Set(matches)).join('\n'),
    warning: '旧版 Office 二进制格式仅做轻量文本片段提取；建议转为 docx/xlsx 后上传以获得更完整正文。',
  };
};

const extractOfficeOpenXmlText = (bytes: Uint8Array, kind: AIChatAttachmentKind): string => {
  const entries = unzipSync(bytes);
  if (kind === 'word') return extractDocxText(entries);
  if (kind === 'excel') return extractXlsxText(entries);
  return '';
};

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
  reader.readAsDataURL(file);
});

export const createAIChatAttachmentFromFile = async (file: File): Promise<AIChatAttachment> => {
  const kind = resolveAIChatAttachmentKind(file);
  const base: Omit<AIChatAttachment, 'kind'> = {
    id: nextAttachmentId(),
    name: file.name || 'unnamed',
    mimeType: file.type || 'application/octet-stream',
    size: file.size || 0,
  };
  if (kind === 'image') {
    return { ...base, kind, dataUrl: await readFileAsDataUrl(file) };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ...base,
      kind,
      extractWarning: `文件超过 ${formatAIChatAttachmentSize(MAX_ATTACHMENT_BYTES)}，已附加文件信息但未读取正文。`,
    };
  }
  try {
    if (kind === 'text' || kind === 'markdown') {
      const { text, truncated } = clampExtractedText(await file.text());
      return { ...base, kind, text, textTruncated: truncated };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = getFileExtension(file.name);
    if ((kind === 'word' || kind === 'excel') && (extension === 'docx' || extension === 'xlsx')) {
      const { text, truncated } = clampExtractedText(extractOfficeOpenXmlText(bytes, kind));
      return { ...base, kind, text, textTruncated: truncated };
    }
    if (kind === 'pdf') {
      const extracted = extractPdfText(bytes);
      const { text, truncated } = clampExtractedText(extracted.text);
      return { ...base, kind, text, textTruncated: truncated, extractWarning: extracted.warning };
    }
    if ((kind === 'word' || kind === 'excel') && (extension === 'doc' || extension === 'xls')) {
      const extracted = extractLegacyOfficeText(bytes);
      const { text, truncated } = clampExtractedText(extracted.text);
      return { ...base, kind, text, textTruncated: truncated, extractWarning: extracted.warning };
    }
    return {
      ...base,
      kind,
      extractWarning: '当前文件类型已附加，但暂未提取正文；如需模型分析内容，请改用 markdown、txt、docx、xlsx 或 pdf。',
    };
  } catch (error: any) {
    return {
      ...base,
      kind,
      extractWarning: `附件正文提取失败：${error?.message || String(error)}`,
    };
  }
};

export const buildAIChatAttachmentPromptText = (attachments: AIChatAttachment[] = []): string => {
  const documentAttachments = attachments.filter((attachment) => attachment.kind !== 'image');
  if (documentAttachments.length === 0) return '';
  return documentAttachments.map((attachment, index) => {
    const content = String(attachment.text || '').trim();
    const truncatedContent = content.length > MAX_PROMPT_TEXT_CHARS
      ? `${content.slice(0, MAX_PROMPT_TEXT_CHARS).trimEnd()}\n\n[附件正文过长，已截断]`
      : content;
    const fence = truncatedContent.includes('```') ? '~~~' : '```';
    const lines = [
      `### 附件 ${index + 1}: ${attachment.name}`,
      `- 类型: ${attachment.kind}`,
      `- MIME: ${attachment.mimeType || 'unknown'}`,
      `- 大小: ${formatAIChatAttachmentSize(attachment.size)}`,
    ];
    if (attachment.extractWarning) {
      lines.push(`- 提取说明: ${attachment.extractWarning}`);
    }
    if (attachment.textTruncated) {
      lines.push('- 提取说明: 附件正文较长，已截断后发送。');
    }
    if (truncatedContent) {
      lines.push('', fence, truncatedContent, fence);
    } else {
      lines.push('', '未提取到可发送的附件正文。');
    }
    return lines.join('\n');
  }).join('\n\n');
};

export const appendAIChatAttachmentsToContent = (content: string, attachments: AIChatAttachment[] = []): string => {
  const attachmentPrompt = buildAIChatAttachmentPromptText(attachments);
  if (!attachmentPrompt) return content;
  const userContent = String(content || '').trim();
  return [
    userContent || '请根据以下附件内容继续处理。',
    '',
    '<用户上传附件>',
    attachmentPrompt,
    '</用户上传附件>',
  ].join('\n');
};
