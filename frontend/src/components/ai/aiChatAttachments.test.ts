import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  appendAIChatAttachmentsToContent,
  buildAIChatAttachmentPromptText,
  createAIChatAttachmentFromFile,
  resolveAIChatAttachmentKind,
} from './aiChatAttachments';

const makeFile = (parts: BlobPart[], name: string, type: string): File => {
  const blob = new Blob(parts, { type });
  return Object.assign(blob, { name, lastModified: 0 }) as File;
};

describe('aiChatAttachments', () => {
  it('extracts markdown text so it can be sent to AI', async () => {
    const attachment = await createAIChatAttachmentFromFile(makeFile(['# Report\n\nhello'], 'report.md', 'text/markdown'));

    expect(attachment.kind).toBe('markdown');
    expect(attachment.text).toContain('# Report');
    expect(buildAIChatAttachmentPromptText([attachment])).toContain('hello');
  });

  it('extracts docx document text from Office Open XML', async () => {
    const bytes = zipSync({
      'word/document.xml': strToU8('<w:document><w:body><w:p><w:r><w:t>用户增长</w:t></w:r></w:p><w:p><w:r><w:t>GMV &amp; 留存</w:t></w:r></w:p></w:body></w:document>'),
    });
    const attachment = await createAIChatAttachmentFromFile(makeFile([bytes], 'plan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));

    expect(attachment.kind).toBe('word');
    expect(attachment.text).toContain('用户增长');
    expect(attachment.text).toContain('GMV & 留存');
  });

  it('extracts xlsx worksheet rows with shared strings', async () => {
    const bytes = zipSync({
      'xl/sharedStrings.xml': strToU8('<sst><si><t>姓名</t></si><si><t>张三</t></si></sst>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row><c t="s"><v>0</v></c><c><v>100</v></c></row><row><c t="s"><v>1</v></c><c><v>88</v></c></row></sheetData></worksheet>'),
    });
    const attachment = await createAIChatAttachmentFromFile(makeFile([bytes], 'score.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));

    expect(attachment.kind).toBe('excel');
    expect(attachment.text).toContain('姓名\t100');
    expect(attachment.text).toContain('张三\t88');
  });

  it('extracts lightweight PDF literal text and keeps a warning about limitations', async () => {
    const attachment = await createAIChatAttachmentFromFile(makeFile(['%PDF-1.4\nBT (Invoice total 42) Tj ET\n%%EOF'], 'invoice.pdf', 'application/pdf'));

    expect(attachment.kind).toBe('pdf');
    expect(attachment.text).toContain('Invoice total 42');
    expect(attachment.extractWarning).toContain('轻量文本提取');
  });

  it('appends non-image attachments to the upstream user content', () => {
    const content = appendAIChatAttachmentsToContent('帮我总结', [{
      id: 'att-1',
      name: 'report.txt',
      mimeType: 'text/plain',
      size: 12,
      kind: 'text',
      text: '核心指标下降',
    }]);

    expect(content).toContain('帮我总结');
    expect(content).toContain('<用户上传附件>');
    expect(content).toContain('核心指标下降');
  });

  it('keeps images out of the prompt text because they are sent through multimodal payload fields', () => {
    expect(resolveAIChatAttachmentKind({ name: 'screen.png', type: 'image/png' })).toBe('image');
    expect(buildAIChatAttachmentPromptText([{
      id: 'att-img',
      name: 'screen.png',
      mimeType: 'image/png',
      size: 10,
      kind: 'image',
      dataUrl: 'data:image/png;base64,abc',
    }])).toBe('');
  });
});
