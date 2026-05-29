# VibeSec Release Checklist

Use this checklist before creating a VibeSec release tag or publishing a VSIX.

## 1. Version and Metadata

- Confirm `package.json` `version` matches the intended release tag.
- Confirm Marketplace metadata is present:
  - `publisher`
  - `license`
  - `repository`
  - `homepage`
  - `bugs`
  - `categories`
  - `keywords`
  - `galleryBanner`
- Confirm README screenshots and command names match the current extension UI.
- Confirm `CHANGELOG.md` has a release entry with user-facing changes and build/pipeline notes.

## 2. Local Validation

Run the complete dry run from a clean working tree:

```bash
npm ci
npm run release:dry-run
```

This validates:

- TypeScript compilation
- webview bundle generation
- Node tests
- dependency audit at moderate severity or higher
- VSIX file listing

## 3. Package Audit

Inspect the output of:

```bash
npm run package:ls
```

Required files:

- `package.json`
- `README.md`
- `LICENSE`
- `out/**`
- `media/**`
- `rules/**`
- production dependencies under `node_modules/**`

Files that should not ship:

- `src/**`
- `design/**`
- `test/**`
- `.github/**`
- `test-samples/**`
- build scripts such as `esbuild.design.mjs`
- generated `.vsix` files

## 4. Build a VSIX

```bash
npm run release:vsix
```

Install the package in a clean VS Code window and smoke test:

- `VibeSec: Scan Current File`
- `VibeSec: Scan Whole Project`
- `VibeSec: Open Control Center`
- `VibeSec: Open Policy File`
- `VibeSec: Generate Prompts` with a configured provider

## 5. Tag and Publish

Create and push the release tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The release workflow will:

- install dependencies
- run tests
- run dependency audit
- build a VSIX
- upload the VSIX as a workflow artifact
- attach the VSIX to the matching GitHub release when one exists

If the release already exists, the workflow updates the attached VSIX with `--clobber`.
