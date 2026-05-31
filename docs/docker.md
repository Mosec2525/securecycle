# VibeSec Docker Scanner

The Docker image bundles VibeSec's CLI scanner with Semgrep, so users can scan a project without installing Semgrep on the host. Users only need Docker.

## Install And Run From Docker Hub

From any project directory:

```bash
docker run --rm -v "$PWD:/workspace" mosec2525/vibesec:latest
```

PowerShell:

```powershell
docker run --rm -v "${PWD}:/workspace" mosec2525/vibesec:latest
```

Docker pulls the image automatically the first time. After that, the image is cached locally and runs faster.

## Build Locally

```bash
docker build -t vibesec:local .
```

## Scan A Project

From a project directory:

```bash
docker run --rm -v "$PWD:/workspace" vibesec:local
```

PowerShell:

```powershell
docker run --rm -v "${PWD}:/workspace" vibesec:local
```

The container scans `/workspace` by default. It uses the mounted project's `.vibesec.yaml` when present, otherwise it falls back to the bundled `vibesec:default` policy.

## JSON Output

```bash
docker run --rm -v "$PWD:/workspace" vibesec:local --json
```

## Exit Codes

- `0`: scan completed with no findings
- `1`: scan completed and found issues
- `2`: scan failed

Use `--no-fail-on-findings` when you want findings reported but a zero exit code:

```bash
docker run --rm -v "$PWD:/workspace" vibesec:local --no-fail-on-findings
```

## Published Image

The public image is available on Docker Hub:

<https://hub.docker.com/r/mosec2525/vibesec>

```bash
docker pull mosec2525/vibesec:latest
docker run --rm -v "$PWD:/workspace" mosec2525/vibesec:latest
```

The GitHub workflow also publishes a mirror to GitHub Container Registry on pushes to `main` and version tags.
