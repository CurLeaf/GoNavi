import type {
  AIMCPClientInstallStatus,
  AIMCPServerConfig,
  AIProviderConfig,
  AISafetyLevel,
} from '../../types';
import type {
  ShortcutOptions,
  ShortcutPlatform,
} from '../../utils/shortcuts';

export interface AISnapshotInspectionRuntimeState {
  providers?: AIProviderConfig[];
  activeProviderId?: string;
  safetyLevel?: AISafetyLevel | string;
  contextLevel?: string;
}

export interface AISnapshotInspectionRuntime {
  getAIRuntimeState?: () => Promise<AISnapshotInspectionRuntimeState | undefined>;
  getMCPServers?: () => Promise<AIMCPServerConfig[] | undefined>;
  getMCPClientInstallStatuses?: () => Promise<AIMCPClientInstallStatus[] | undefined>;
  getShortcutOptions?: () => Promise<ShortcutOptions | undefined>;
  getShortcutPlatform?: () => Promise<ShortcutPlatform | undefined>;
  readAppLogTail?: (lineLimit: number, keyword: string) => Promise<any>;
  readSQLFile?: (filePath: string) => Promise<any>;
  checkSQL?: (sql: string) => Promise<{ allowed?: boolean; operationType?: string } | undefined>;
}

export interface SnapshotInspectionResult {
  content: string;
  success: boolean;
}
