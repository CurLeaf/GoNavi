import React from 'react';

interface UseAIChatDraftImagesParams {
  setDraftImages: React.Dispatch<React.SetStateAction<string[]>>;
}

export const useAIChatDraftImages = ({
  setDraftImages,
}: UseAIChatDraftImagesParams) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const appendDraftImage = React.useCallback((blob: Blob) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setDraftImages((prev) => [...prev, event.target!.result as string]);
      }
    };
    reader.readAsDataURL(blob);
  }, [setDraftImages]);

  const handleImageUpload = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    files.forEach((file) => {
      if (file.type.includes('image')) {
        appendDraftImage(file);
      }
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [appendDraftImage]);

  const handlePasteImages = React.useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }
    for (let index = 0; index < items.length; index += 1) {
      if (items[index].type.includes('image')) {
        event.preventDefault();
        const blob = items[index].getAsFile();
        if (blob) {
          appendDraftImage(blob);
        }
      }
    }
  }, [appendDraftImage]);

  const handleRemoveDraftImage = React.useCallback((index: number) => {
    setDraftImages((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }, [setDraftImages]);

  return {
    fileInputRef,
    handleImageUpload,
    handlePasteImages,
    handleRemoveDraftImage,
  };
};
