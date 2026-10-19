# The V0 subject's container: Node for the notes CLI and the graders, tmux for terminal driving, git and procps for
# the recipe's own checks. The same file builds on a Mac (colima) and in a cloud session: images come from
# mirror.gcr.io (Docker Hub rate-limits pulls) and packages from Ubuntu's archive; Docker passes the standard proxy
# variables (HTTP_PROXY, HTTPS_PROXY) to the build when set. Build it locally and pin the resulting digest in the
# group; the evaluator never pulls.
FROM mirror.gcr.io/library/node:22-bookworm-slim AS node
FROM mirror.gcr.io/library/ubuntu:24.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends tmux git procps ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /testbed
