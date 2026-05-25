export interface RequestContext {
  sessionToken?: string;
  userRole?: "guest" | "member" | "admin";
}

export function canAccessDashboard(ctx: RequestContext): boolean {
  return Boolean(ctx.sessionToken);
}

export function canAccessAdmin(ctx: RequestContext): boolean {
  return Boolean(ctx.sessionToken) && ctx.userRole === "admin";
}
