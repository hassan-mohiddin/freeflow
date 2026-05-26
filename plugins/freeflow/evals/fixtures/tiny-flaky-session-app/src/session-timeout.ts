export type SessionState = {
  expiresAtMs: number;
  nowMs: number;
  path: string;
};

export function nextSessionPath(state: SessionState): string {
  if (state.nowMs >= state.expiresAtMs) {
    return "/login?reason=timeout";
  }

  return state.path;
}
