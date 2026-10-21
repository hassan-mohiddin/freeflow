#!/bin/sh
# Deploys the hosted web view (see docs/deploy.md).
set -e
npm test
flyctl deploy --app shelf-prod
