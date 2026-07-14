export interface DashboardPayload {
  userId: string;
  totalCents: number;
  fetchedAt: string;
}

export async function fetchDashboardPayload(userId: string): Promise<DashboardPayload> {
  return {
    userId,
    totalCents: 12500,
    fetchedAt: new Date().toISOString(),
  };
}
