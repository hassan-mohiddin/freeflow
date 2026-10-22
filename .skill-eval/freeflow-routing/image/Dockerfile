# The freeflow-routing suite's container: Node and npm, Python 3, Git, tmux, procps and curl, plus the shelf project's
# history at /opt/project.git (branch feature/tag-rename checked out, two files changed and not committed). The history
# is built here from the fixture and image/history, outside the workspace (a fixture in this repository cannot hold a
# .git folder); GIT_DIR and GIT_WORK_TREE point Git at it, so `git status`, `git log` and `git diff main` work in
# /testbed. Build with the suite folder as the context (see ../README.md). Images come from mirror.gcr.io and packages
# from Ubuntu's archive; the evaluator never pulls, so build locally and pin the digest in the groups.
FROM mirror.gcr.io/library/node:22-bookworm-slim AS node
FROM mirror.gcr.io/library/ubuntu:24.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends tmux git procps ca-certificates python3 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && git config --system --add safe.directory '*'
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
COPY fixtures/shelf /opt/build/head
COPY image/history /opt/build/history
COPY image/make-history.mjs /opt/build/make-history.mjs
RUN node /opt/build/make-history.mjs /opt/build /opt/project.git && rm -rf /opt/build
ENV GIT_DIR=/opt/project.git GIT_WORK_TREE=/testbed
WORKDIR /testbed
