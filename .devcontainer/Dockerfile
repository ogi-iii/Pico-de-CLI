FROM oven/bun:1.3

RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash chef
USER chef
WORKDIR /pico-de-cli

ENV DEVCONTAINER=true
ENV PATH="/home/chef/.bun/bin:$PATH"

ENV BUN_INSTALL_CACHE=/home/chef/.bun-cache
RUN mkdir -p $BUN_INSTALL_CACHE

CMD ["bash"]
