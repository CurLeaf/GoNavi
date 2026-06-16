import { describe, expect, it } from 'vitest';

import { validateMCPServerDraft } from './mcpServerValidation';

describe('mcpServerValidation', () => {
  it('blocks testing and saving when required MCP launch fields are invalid', () => {
    const validation = validateMCPServerDraft({
      name: 'GitHub',
      transport: 'stdio',
      command: '',
      args: ['--stdio'],
      timeoutSeconds: 20,
    }, { invalidLines: [] });

    expect(validation.canTest).toBe(false);
    expect(validation.canSave).toBe(false);
    expect(validation.errorCount).toBe(1);
    expect(validation.issues.map((issue) => issue.key)).toContain('command-missing');
  });

  it('warns when users paste a whole command into the command field', () => {
    const validation = validateMCPServerDraft({
      name: 'Node',
      transport: 'stdio',
      command: 'node server.js --stdio',
      args: [],
      timeoutSeconds: 20,
    }, { invalidLines: [] });

    expect(validation.canTest).toBe(true);
    expect(validation.warningCount).toBeGreaterThanOrEqual(1);
    expect(validation.issues.map((issue) => issue.key)).toContain('command-whole-line');
    expect(validation.issues.map((issue) => issue.key)).toContain('args-missing-for-launcher');
  });

  it('blocks save when env draft contains lines that would be silently dropped', () => {
    const validation = validateMCPServerDraft({
      name: 'GitHub',
      transport: 'stdio',
      command: 'uvx',
      args: ['mcp-server-github', '--stdio'],
      timeoutSeconds: 45,
    }, { invalidLines: ['export GITHUB_TOKEN=abc'] });

    expect(validation.canTest).toBe(false);
    expect(validation.canSave).toBe(false);
    expect(validation.errorCount).toBe(1);
    expect(validation.issues.find((issue) => issue.key === 'env-invalid-lines')?.detail).toContain('export GITHUB_TOKEN=abc');
  });

  it('keeps valid drafts testable and saveable', () => {
    const validation = validateMCPServerDraft({
      name: 'Filesystem',
      transport: 'stdio',
      command: 'node',
      args: ['server.js', '--stdio'],
      timeoutSeconds: 20,
    }, { invalidLines: [] });

    expect(validation.canTest).toBe(true);
    expect(validation.canSave).toBe(true);
    expect(validation.errorCount).toBe(0);
  });

  it('warns when docker MCP launch args miss run, stdin, or image', () => {
    const validation = validateMCPServerDraft({
      name: 'Docker MCP',
      transport: 'stdio',
      command: 'docker',
      args: ['--rm'],
      timeoutSeconds: 45,
    }, { invalidLines: [] });

    expect(validation.canTest).toBe(true);
    expect(validation.warningCount).toBeGreaterThanOrEqual(3);
    expect(validation.issues.map((issue) => issue.key)).toContain('docker-run-missing');
    expect(validation.issues.map((issue) => issue.key)).toContain('docker-interactive-missing');
    expect(validation.issues.map((issue) => issue.key)).toContain('docker-image-missing');
  });

  it('accepts complete docker MCP launch args without docker-specific warnings', () => {
    const validation = validateMCPServerDraft({
      name: 'Docker MCP',
      transport: 'stdio',
      command: 'docker',
      args: ['run', '--rm', '-i', '-e', 'API_KEY=...', 'mcp/server-fetch:latest'],
      timeoutSeconds: 45,
    }, { invalidLines: [] });

    expect(validation.canTest).toBe(true);
    expect(validation.canSave).toBe(true);
    expect(validation.issues.map((issue) => issue.key)).not.toContain('docker-run-missing');
    expect(validation.issues.map((issue) => issue.key)).not.toContain('docker-interactive-missing');
    expect(validation.issues.map((issue) => issue.key)).not.toContain('docker-image-missing');
  });
});
