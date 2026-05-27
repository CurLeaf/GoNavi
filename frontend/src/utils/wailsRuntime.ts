export const safeWindowRuntimeCall = async <T>(
  invoke: () => T | Promise<T>,
  fallback: T,
): Promise<T> => {
  try {
    return await Promise.resolve().then(invoke);
  } catch {
    return fallback;
  }
};
