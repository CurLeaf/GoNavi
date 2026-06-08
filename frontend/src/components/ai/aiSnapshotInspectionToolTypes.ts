import type {
  AIMCPClientInstallStatus,
  AIMCPServerConfig,
  AIProviderConfig,
  AISafetyLevel,
} from '../../types';

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
  readSQLFile?: (filePath: string) => Promise<any>;
}

export interface SnapshotInspectionResult {
  content: string;
  success: boolean;
}
