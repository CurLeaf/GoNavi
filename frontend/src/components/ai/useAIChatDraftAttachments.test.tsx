import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAttachmentMock = vi.hoisted(() => vi.fn());
const messageApi = vi.hoisted(() => ({
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('antd', () => ({
  message: messageApi,
}));

vi.mock('./aiChatAttachments', async () => {
  const actual = await vi.importActual<any>('./aiChatAttachments');
  return {
    ...actual,
    createAIChatAttachmentFromFile: (...args: any[]) => createAttachmentMock(...args),
  };
});

import { useAIChatDraftAttachments } from './useAIChatDraftAttachments';

const makeFile = (parts: BlobPart[], name: string, type: string): File => {
  const blob = new Blob(parts, { type });
  return Object.assign(blob, { name, lastModified: 0 }) as File;
};

const translateAttachmentCopy = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string => ({
  'ai_chat.input.attachment.message.warning': `Warning for ${params?.name}: ${params?.message}`,
  'ai_chat.input.attachment.message.read_failed': `Failed to read attachment ${params?.name}: ${params?.detail}`,
}[key] || key);

const flushAsyncWork = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const Probe = ({
  setDraftAttachments,
}: {
  setDraftAttachments: React.Dispatch<React.SetStateAction<any[]>>;
}) => {
  const { handleAttachmentUpload } = useAIChatDraftAttachments({
    setDraftAttachments,
    translate: translateAttachmentCopy,
  });
  return <input onChange={handleAttachmentUpload} />;
};

describe('useAIChatDraftAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a localized warning wrapper when attachment extraction returns a warning', async () => {
    const setDraftAttachments = vi.fn();
    createAttachmentMock.mockResolvedValue({
      id: 'att-1',
      name: 'budget.pdf',
      mimeType: 'application/pdf',
      size: 12,
      kind: 'pdf',
      extractWarning: 'No readable text was extracted from the PDF; if it is scanned or uses complex encoding, copy the body before sending.',
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<Probe setDraftAttachments={setDraftAttachments} />);
    });

    await act(async () => {
      renderer!.root.findByType('input').props.onChange({
        target: {
          files: [makeFile(['pdf'], 'budget.pdf', 'application/pdf')],
        },
      });
    });
    await flushAsyncWork();

    expect(setDraftAttachments).toHaveBeenCalledTimes(1);
    expect(messageApi.warning).toHaveBeenCalledWith(
      'Warning for budget.pdf: No readable text was extracted from the PDF; if it is scanned or uses complex encoding, copy the body before sending.',
    );
  });

  it('shows a localized read failure error instead of leaking an unhandled attachment rejection', async () => {
    const setDraftAttachments = vi.fn();
    createAttachmentMock.mockRejectedValue(new Error('file read failed'));

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<Probe setDraftAttachments={setDraftAttachments} />);
    });

    await act(async () => {
      renderer!.root.findByType('input').props.onChange({
        target: {
          files: [makeFile(['img'], 'screen.png', 'image/png')],
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAsyncWork();

    expect(setDraftAttachments).not.toHaveBeenCalled();
    expect(messageApi.error).toHaveBeenCalledWith('Failed to read attachment screen.png: file read failed');
  });
});
