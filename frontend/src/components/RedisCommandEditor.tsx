import React, { useState, useCallback, useRef } from 'react';
import { Button, Space, message } from 'antd';
import { PlayCircleOutlined, ClearOutlined } from '@ant-design/icons';
import { useStore } from '../store';
import Editor, { OnMount } from '@monaco-editor/react';

interface RedisCommandEditorProps {
    connectionId: string;
    redisDB: number;
}

interface CommandResult {
    command: string;
    result: any;
    error?: string;
    timestamp: number;
}

const RedisCommandEditor: React.FC<RedisCommandEditorProps> = ({ connectionId, redisDB }) => {
    const { connections } = useStore();
    const connection = connections.find(c => c.id === connectionId);

    const [command, setCommand] = useState('');
    const [results, setResults] = useState<CommandResult[]>([]);
    const [loading, setLoading] = useState(false);
    const editorRef = useRef<any>(null);

    const getConfig = useCallback(() => {
        if (!connection) return null;
        return {
            ...connection.config,
            port: Number(connection.config.port),
            password: connection.config.password || "",
            useSSH: connection.config.useSSH || false,
            ssh: connection.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" },
            redisDB: redisDB
        };
    }, [connection, redisDB]);

    const handleEditorMount: OnMount = (editor) => {
        editorRef.current = editor;
        // Add keyboard shortcut for execute
        editor.addCommand(
            // Ctrl/Cmd + Enter
            2048 | 3, // KeyMod.CtrlCmd | KeyCode.Enter
            () => handleExecute()
        );
    };

    const handleExecute = async () => {
        const config = getConfig();
        if (!config) return;

        const cmdToExecute = command.trim();
        if (!cmdToExecute) {
            message.warning('请输入命令');
            return;
        }

        // Support multiple commands separated by newlines
        const commands = cmdToExecute.split('\n').filter(c => c.trim() && !c.trim().startsWith('//') && !c.trim().startsWith('#'));

        setLoading(true);
        const newResults: CommandResult[] = [];

        for (const cmd of commands) {
            const trimmedCmd = cmd.trim();
            if (!trimmedCmd) continue;

            try {
                const res = await (window as any).go.app.App.RedisExecuteCommand(config, trimmedCmd);
                newResults.push({
                    command: trimmedCmd,
                    result: res.success ? res.data : null,
                    error: res.success ? undefined : res.message,
                    timestamp: Date.now()
                });
            } catch (e: any) {
                newResults.push({
                    command: trimmedCmd,
                    result: null,
                    error: e?.message || String(e),
                    timestamp: Date.now()
                });
            }
        }

        setResults(prev => [...newResults, ...prev]);
        setLoading(false);
    };

    const handleClear = () => {
        setResults([]);
    };

    const formatResult = (result: any): string => {
        if (result === null || result === undefined) {
            return '(nil)';
        }
        if (typeof result === 'string') {
            return `"${result}"`;
        }
        if (typeof result === 'number') {
            return `(integer) ${result}`;
        }
        if (Array.isArray(result)) {
            if (result.length === 0) {
                return '(empty array)';
            }
            return result.map((item, index) => `${index + 1}) ${formatResult(item)}`).join('\n');
        }
        if (typeof result === 'object') {
            return JSON.stringify(result, null, 2);
        }
        return String(result);
    };

    if (!connection) {
        return <div style={{ padding: 20 }}>连接不存在</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Command Input */}
            <div style={{ borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                        <span style={{ fontWeight: 500 }}>Redis 命令</span>
                        <span style={{ color: '#999', fontSize: 12 }}>db{redisDB}</span>
                    </Space>
                    <Space>
                        <Button
                            type="primary"
                            icon={<PlayCircleOutlined />}
                            onClick={handleExecute}
                            loading={loading}
                        >
                            执行 (Ctrl+Enter)
                        </Button>
                        <Button icon={<ClearOutlined />} onClick={handleClear}>清空结果</Button>
                    </Space>
                </div>
                <Editor
                    height="150px"
                    defaultLanguage="plaintext"
                    value={command}
                    onChange={(value) => setCommand(value || '')}
                    onMount={handleEditorMount}
                    options={{
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        fontSize: 14,
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2
                    }}
                />
            </div>

            {/* Results */}
            <div style={{ flex: 1, overflow: 'auto', background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace' }}>
                {results.length === 0 ? (
                    <div style={{ padding: 20, color: '#666', textAlign: 'center' }}>
                        输入 Redis 命令并按 Ctrl+Enter 执行
                        <br />
                        <span style={{ fontSize: 12 }}>支持多行命令，每行一个命令</span>
                    </div>
                ) : (
                    results.map((item, index) => (
                        <div key={item.timestamp + index} style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
                            <div style={{ color: '#569cd6', marginBottom: 4 }}>
                                &gt; {item.command}
                            </div>
                            {item.error ? (
                                <div style={{ color: '#f14c4c', whiteSpace: 'pre-wrap' }}>
                                    (error) {item.error}
                                </div>
                            ) : (
                                <div style={{ color: '#ce9178', whiteSpace: 'pre-wrap' }}>
                                    {formatResult(item.result)}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Common Commands Help */}
            <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0', background: '#fafafa', fontSize: 12, color: '#666' }}>
                常用命令:
                <span style={{ marginLeft: 8 }}>
                    <code>KEYS *</code> |
                    <code style={{ marginLeft: 8 }}>GET key</code> |
                    <code style={{ marginLeft: 8 }}>SET key value</code> |
                    <code style={{ marginLeft: 8 }}>HGETALL key</code> |
                    <code style={{ marginLeft: 8 }}>INFO</code> |
                    <code style={{ marginLeft: 8 }}>DBSIZE</code>
                </span>
            </div>
        </div>
    );
};

export default RedisCommandEditor;
