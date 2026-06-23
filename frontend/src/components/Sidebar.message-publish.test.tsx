import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sidebarSource = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const contextMenuSource = readFileSync(new URL('./V2TableContextMenu.tsx', import.meta.url), 'utf8');
const modalSource = readFileSync(new URL('./MessagePublishModal.tsx', import.meta.url), 'utf8');

describe('Sidebar Kafka publish entry', () => {
  it('adds a Kafka topic publish action in both legacy and v2 table menus', () => {
    expect(sidebarSource).toContain("key: 'publish-message'");
    expect(sidebarSource).toContain("label: '测试发送消息'");
    expect(sidebarSource).toContain('openMessagePublishModal(node)');
    expect(contextMenuSource).toContain("| 'publish-message'");
    expect(contextMenuSource).toContain("title: '测试发送消息'");
  });

  it('renders the dedicated message publish modal and executes DBQuery through the encoder', () => {
    expect(sidebarSource).toContain('<MessagePublishModal');
    expect(modalSource).toContain('buildMessagePublishCommand');
    expect(modalSource).toContain('DBQuery(');
    expect(modalSource).toContain("t('message_publish_modal.field.body.label')");
  });
});
