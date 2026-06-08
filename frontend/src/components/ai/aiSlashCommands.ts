import type { AISlashCommandDefinition } from './AISlashCommandMenu';

export const DEFAULT_AI_SLASH_COMMANDS: AISlashCommandDefinition[] = [
  { cmd: '/query', label: '🔍 自然语言查询', desc: '用中文描述你想查什么', prompt: '帮我写一条 SQL 查询：' },
  { cmd: '/sql', label: '📝 生成 SQL', desc: '描述需求自动生成语句', prompt: '请根据以下需求生成 SQL：' },
  { cmd: '/explain', label: '💡 解释 SQL', desc: '解释选中 SQL 的逻辑', prompt: '请解释以下 SQL 的执行逻辑和每一步的作用：\n```sql\n\n```' },
  { cmd: '/optimize', label: '⚡ 优化分析', desc: '分析 SQL 性能瓶颈', prompt: '请分析以下 SQL 的性能问题，并给出优化后的版本：\n```sql\n\n```' },
  { cmd: '/schema', label: '🏗️ 表设计评审', desc: '评审表结构设计质量', prompt: '请全面评审当前关联表的设计，包括字段类型、范式、索引策略等方面的改进建议：' },
  { cmd: '/index', label: '📊 索引建议', desc: '推荐最优索引方案', prompt: '请基于当前表结构和常见查询场景，推荐最优的索引方案并给出建表语句：' },
  { cmd: '/diff', label: '🔄 表对比', desc: '对比两表差异生成变更', prompt: '请对比以下两张表的结构差异，并生成从旧版本迁移到新版本的 ALTER 语句：' },
  { cmd: '/mock', label: '🎲 造测试数据', desc: '生成 INSERT 测试数据', prompt: '请为当前关联的表生成 10 条符合业务语义的测试数据 INSERT 语句：' },
];

export const filterAISlashCommands = (filter: string): AISlashCommandDefinition[] => {
  const normalized = String(filter || '').trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_AI_SLASH_COMMANDS;
  }
  return DEFAULT_AI_SLASH_COMMANDS.filter((command) => command.cmd.startsWith(normalized));
};
