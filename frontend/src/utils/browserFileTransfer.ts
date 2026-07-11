type BrowserFileDownloadEnvironment = {
  document?: Pick<Document, 'body' | 'createElement'>;
  url?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
};

/** Trigger a local browser download without asking the server to write a client-side path. */
export const downloadBrowserTextFile = (
  content: string,
  filename: string,
  contentType: string,
  environment: BrowserFileDownloadEnvironment = {},
): boolean => {
  const documentRef = environment.document ?? (typeof document === 'undefined' ? undefined : document);
  const urlRef = environment.url ?? (typeof URL === 'undefined' ? undefined : URL);
  if (!documentRef?.body || !urlRef?.createObjectURL || !urlRef.revokeObjectURL) {
    return false;
  }

  const url = urlRef.createObjectURL(new Blob([content], { type: contentType }));
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  documentRef.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    documentRef.body.removeChild(anchor);
    urlRef.revokeObjectURL(url);
  }
  return true;
};
