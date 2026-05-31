# VibeSec Docker Scanner

The Docker image bundles VibeSec's CLI scanner with Semgrep, so users can scan a project without installing Semgrep on the host.

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

The Docker workflow publishes images to GitHub Container Registry on pushes to `main` and version tags:

```bash
docker pull ghcr.io/mosec2525/vibesec:latest
docker run --rm -v "$PWD:/workspace" ghcr.io/mosec2525/vibesec:latest
```
