FROM golang:1.26.6-alpine3.23@sha256:e57c41c1d5864341031181b0db34b9a537bb5773eb6428e4e5bdaea0f9135406 AS build

WORKDIR /src

RUN apk add --no-cache ca-certificates git \
  && git init . \
  && git remote add origin https://github.com/caddyserver/caddy.git \
  && git fetch --depth 1 origin refs/tags/v2.11.4:refs/tags/v2.11.4 \
  && git checkout --detach refs/tags/v2.11.4 \
  && test "$(git rev-parse HEAD)" = "e2eee6a7fce366321294c9c2a79f3146891dcbdf" \
  && go get \
    golang.org/x/net@v0.56.0 \
    golang.org/x/text@v0.39.0 \
    google.golang.org/grpc@v1.82.1 \
  && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/caddy ./cmd/caddy \
  && mkdir -p /out/data /out/config \
  && chown 1000:1000 /out/data /out/config

FROM scratch

ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
LABEL org.opencontainers.image.source=https://github.com/caddyserver/caddy
LABEL org.opencontainers.image.version=2.11.4-jingtang.1

ENV XDG_CONFIG_HOME=/config
ENV XDG_DATA_HOME=/data
ENV HOME=/data

COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/caddy /usr/bin/caddy
COPY --from=build --chown=1000:1000 /out/data /data
COPY --from=build --chown=1000:1000 /out/config /config

VOLUME ["/data", "/config"]
EXPOSE 80 443 443/udp 2019
USER 1000:1000
ENTRYPOINT ["/usr/bin/caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
