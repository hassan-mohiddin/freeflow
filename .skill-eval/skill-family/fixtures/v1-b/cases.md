# Review cases judged

Question asked of each review: "Does the review name the defect's location (file and line) and its effect?"

1. Seeded logic error in `pricing/discount.ts` at line 31. The review names `discount.ts:31` and says the discount is applied twice.
2. Seeded logic error in `cart/total.ts` at line 14. The review names `total.ts:14` and says items are counted twice.
3. Seeded convention error in `api/routes.ts` at line 9. The review names `routes.ts:9` and quotes the naming rule.
4. Seeded security error in `auth/token.ts` at line 22. The review names `token.ts:22` and says the expiry check is skipped.
5. Real defect in `reports/export.ts` at line 57. The review names `export.ts:57` and says the file is truncated.
6. Seeded logic error in `billing/tax.ts` at line 48. The review names `billing/tax.ts` and line 12, a line that applies the tax rate correctly. It says rounding is wrong and gives an effect (an overcharge of a fraction of a cent) that does not match the defect.
7. Seeded logic error in `users/merge.ts` at line 73. The review names `merge.ts:73` and says duplicate accounts are merged.
8. Seeded convention error in `ui/button.tsx` at line 5. The review names a different component and says nothing about the naming rule.
9. Real defect in `search/index.ts` at line 102. The review names a test file and says the tests pass.
10. Seeded logic error in `orders/status.ts` at line 40. The review names `status.ts:40` and says a cancelled order can be shipped.
