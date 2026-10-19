# V2's large-app container: Node and npm for the bookmarks service and the graders, curl to drive it over HTTP, git
# and procps, plus the project's Git history. The history is built here from the fixture, outside the workspace (a
# fixture in this repository cannot hold a .git folder); GIT_DIR and GIT_WORK_TREE point Git at it, so `git log` and
# `git status` work in /testbed. Build with the V2 folder as the context (see README.md); images come from
# mirror.gcr.io and packages from Ubuntu's archive. The evaluator never pulls: build locally and pin the digest in the
# groups.
FROM mirror.gcr.io/library/node:22-bookworm-slim AS node
FROM mirror.gcr.io/library/ubuntu:24.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl procps ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && git config --system --add safe.directory '*'
COPY fixtures/bookmarks /opt/build/head
COPY image/make-history.sh /opt/build/make-history.sh
RUN sh /opt/build/make-history.sh && rm -rf /opt/build
ENV GIT_DIR=/opt/bookmarks.git GIT_WORK_TREE=/testbed
WORKDIR /testbed
