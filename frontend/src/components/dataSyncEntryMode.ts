export type DataSyncEntryMode = 'sync' | 'schemaCompare' | 'dataCompare';

export type DataSyncEntryModePresentation = {
  title: string;
  description: string;
  heroTitle: string;
  heroDescription: string;
  optionTitle: string;
  tableSelectLabel: string;
  analyzeButtonText: string;
  closeButtonText: string;
  badgeText: string;
  resultTitle: string;
  readOnly: boolean;
};

export const resolveDataSyncEntryModePresentation = (entryMode: DataSyncEntryMode): DataSyncEntryModePresentation => {
  switch (entryMode) {
    case 'schemaCompare':
      return {
        title: '表结构比对',
        description: '按源表与目标表生成结构差异、兼容风险和可审阅 SQL。',
        heroTitle: '表结构比对',
        heroDescription: '适合发布前核对两端表结构差异，只做分析与预览，不执行结构变更。',
        optionTitle: '比对选项',
        tableSelectLabel: '请选择需要比对结构的表：',
        analyzeButtonText: '开始比对',
        closeButtonText: '关闭',
        badgeText: '结构比对',
        resultTitle: '比对结果',
        readOnly: true,
      };
    case 'dataCompare':
      return {
        title: '数据比对',
        description: '按主键对比源表与目标表的数据差异，查看新增、更新和删除明细。',
        heroTitle: '数据比对',
        heroDescription: '适合核对两端数据一致性，只做差异分析与行级预览，不执行写入。',
        optionTitle: '比对选项',
        tableSelectLabel: '请选择需要比对数据的表：',
        analyzeButtonText: '开始比对',
        closeButtonText: '关闭',
        badgeText: '数据比对',
        resultTitle: '比对结果',
        readOnly: true,
      };
    default:
      return {
        title: '数据同步工作台',
        description: '按已有目标表完成差异对比、同步执行与结果确认。',
        heroTitle: '数据同步',
        heroDescription: '适合目标表已存在的场景，先做差异分析，再按勾选执行插入、更新或删除。',
        optionTitle: '同步选项',
        tableSelectLabel: '请选择需要同步的表：',
        analyzeButtonText: '对比差异',
        closeButtonText: '关闭',
        badgeText: '同步模式',
        resultTitle: '执行结果',
        readOnly: false,
      };
  }
};
