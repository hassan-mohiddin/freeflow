# The top-line suite's container where packages can be fetched: Node 22 and Git, with an identity for commits made in
# the container and every folder trusted. build-offline.mjs makes the same tools with no network, from this machine's
# Git; either way, pin the built image's digest in ../configuration.json. The evaluator never pulls.
FROM mirror.gcr.io/library/node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && printf '[user]\n\tname = skill-eval\n\temail = skill-eval@localhost\n[safe]\n\tdirectory = *\n[init]\n\tdefaultBranch = main\n' > /etc/gitconfig \
 && cp /etc/gitconfig /root/.gitconfig
