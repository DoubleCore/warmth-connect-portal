VERSION ?= 0.1.0
COMMIT  := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DATE    := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.buildDate=$(DATE)

OUTDIR  := dist

.PHONY: all clean build-all windows linux

all: build-all

clean:
	rm -rf $(OUTDIR)

# ---------- 单平台构建 ----------

windows:
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(OUTDIR)/agentruntime-windows-amd64.exe ./cmd/agent/

linux:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(OUTDIR)/agentruntime-linux-amd64 ./cmd/agent/

linux-arm64:
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o $(OUTDIR)/agentruntime-linux-arm64 ./cmd/agent/

# ---------- 全平台构建 ----------

build-all: windows linux linux-arm64
	@echo "Build complete. Binaries in $(OUTDIR)/"
	@ls -lh $(OUTDIR)/
