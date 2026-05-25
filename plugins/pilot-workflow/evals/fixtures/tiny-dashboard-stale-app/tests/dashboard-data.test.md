# Dashboard Data Checks

Known expectations:

- `getDashboardData` may cache by user for performance.
- A second `getDashboardData` call for the same user without `clearDashboardCache` is expected to return the cached payload.
- `clearDashboardCache` should invalidate one user's dashboard cache.
- There is no recorded reproduction for the reported random stale-data issue.
- Before changing cache behavior, capture which path returns stale data and under what trigger, such as stale data after a documented invalidation or refresh boundary.
