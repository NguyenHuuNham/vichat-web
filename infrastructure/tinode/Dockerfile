ARG TINODE_BASE_IMAGE=tinode/tinode-postgres:0.25.3@sha256:0df104ad2a96438b7581f71168518ffa103d0c9a5ec6ce2db6ef8649bd9e0ca5
ARG TINODE_VERSION=0.25.3

FROM golang:1.26-alpine AS build
ARG TINODE_VERSION
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch "v${TINODE_VERSION}" https://github.com/tinode/chat.git .
COPY fcm-silent-push.patch /tmp/fcm-silent-push.patch
RUN git apply /tmp/fcm-silent-push.patch
RUN GOTOOLCHAIN=local CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags "-s -w -X main.buildstamp=v${TINODE_VERSION}" \
    -tags postgres -o /out/tinode ./server

FROM ${TINODE_BASE_IMAGE}
COPY --from=build /out/tinode /opt/tinode/tinode
