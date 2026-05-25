# Report Performance Checks

Known expectations:

- `summarizeTransactions` groups transactions by account.
- There is no saved benchmark proving this function is the current bottleneck.
- There is no before/after timing showing the reported regression.
- Do not add memoization or caching until measurement shows the repeated work is the cause.
