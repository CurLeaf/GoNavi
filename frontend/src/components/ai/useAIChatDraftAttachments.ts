import React from 'react';
import { message } from 'antd';
import type { AIChatAttachment } from '../../types';
import { createAIChatAttachmentFromFile } from './aiChatAttachments';

interface UseAIChatDraftAttachmentsParams {
  setDraftAttachments: React.Dispatch<React.SetStateAction<AIChatAttachment[]>>;
}

export const useAIChatDraftAttachments = ({
  setDraftAttachments,
}: UseAIChatDraftAttachmentsParams) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const appendDraftFiles = React.useCallback(async (files: File[]) => {
    for (const file of files) {
      const attachment = await createAIChatAttachmentFromFile(file);
      setDraftAttachments((prev) => [...prev, attachment]);
      if (attachment.extractWarning) {
        message.warning(`${attachment.name}: ${attachment.extractWarning}`);
      }
    }
  }, [setDraftAttachments]);

  const handleAttachmentUpload = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      void appendDraftFiles(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [appendDraftFiles]);

  const handlePasteImages = React.useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }
    const imageFiles: File[] = [];
    for (let index = 0; index < items.length; index += 1) {
      if (items[index].type.includes('image')) {
        const blob = items[index].getAsFile();
        if (blob) {
          imageFiles.push(blob);
        }
      }
    }
    if (imageFiles.length > 0) {
      event.preventDefault();
      void appendDraftFiles(imageFiles);
    }
  }, [appendDraftFiles]);

  const handleRemoveDraftAttachment = React.useCallback((index: number) => {
    setDraftAttachments((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }, [setDraftAttachments]);

  return {
    fileInputRef,
    handleAttachmentUpload,
    handlePasteImages,
    handleRemoveDraftAttachment,
  };
};
