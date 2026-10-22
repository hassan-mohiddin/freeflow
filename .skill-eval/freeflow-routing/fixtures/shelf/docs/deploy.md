# Deploying shelf

The hosted web view runs on fly.io as the app `shelf-prod`, from the `main` branch.

- **Deploy:** `npm run deploy` (runs `scripts/deploy.sh`: tests, then `flyctl deploy --app shelf-prod`).
- **Check:** open https://shelf-prod.fly.dev/ and the list page loads; `flyctl status --app shelf-prod`.
- **Roll back:** `flyctl releases --app shelf-prod`, then `flyctl deploy --app shelf-prod --image <previous image>`.
- **Data:** each user's `bookmarks.json` lives on the `shelf_data` volume, snapshotted daily
  (`flyctl volumes snapshots list shelf_data`). Restoring means creating a volume from a snapshot and attaching it.
