export function logNotificationFailure(kind: string, recipient: string, error: unknown) {
  return { kind, recipient, error };
}
