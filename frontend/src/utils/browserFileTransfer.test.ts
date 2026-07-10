import { describe, expect, it } from 'vitest';
import { downloadBrowserTextFile } from './browserFileTransfer';

describe('downloadBrowserTextFile', () => {
  it('creates a browser download and releases its object URL', () => {
    const created: Array<{ href: string; download: string; clicked: boolean }> = [];
    const removed: unknown[] = [];
    const revoked: string[] = [];
    const body = {
      appendChild: (node: unknown) => { created.push(node as { href: string; download: string; clicked: boolean }); },
      removeChild: (node: unknown) => { removed.push(node); },
    };
    const documentLike = {
      body,
      createElement: () => ({
        href: '',
        download: '',
        clicked: false,
        click() { this.clicked = true; },
      }),
    } as unknown as Document;
    const urlLike = {
      createObjectURL: () => 'blob:connection-package',
      revokeObjectURL: (value: string) => { revoked.push(value); },
    } as unknown as typeof URL;

    const downloaded = downloadBrowserTextFile('package-content', 'connections.gonavi-conn', 'application/json', {
      document: documentLike,
      url: urlLike,
    });

    expect(downloaded).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ href: 'blob:connection-package', download: 'connections.gonavi-conn', clicked: true });
    expect(removed).toHaveLength(1);
    expect(revoked).toEqual(['blob:connection-package']);
  });
});
