export const shouldEnableMacWindowDiagnostics = (
  isMacRuntime: boolean,
  isDevBuild: boolean,
): boolean => {
  return isMacRuntime && isDevBuild;
};
