import { fetchDashboardPayload, type DashboardPayload } from "./api-client";

const dashboardCache = new Map<string, DashboardPayload>();

export async function getDashboardData(userId: string): Promise<DashboardPayload> {
  const cached = dashboardCache.get(userId);

  if (cached) {
    return cached;
  }

  const payload = await fetchDashboardPayload(userId);
  dashboardCache.set(userId, payload);
  return payload;
}

export function clearDashboardCache(userId: string): void {
  dashboardCache.delete(userId);
}
