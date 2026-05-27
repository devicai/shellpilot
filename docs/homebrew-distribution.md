# Distributing the wrapper via Homebrew

The ShellPilot CLI wrapper (`devic-cli-wrapper`, the Go binary that intercepts and
governs agent CLI calls) is distributed to end machines through a **public
Homebrew tap**. This document is the source of truth for that channel: how it is
laid out, why, and how to cut a new version.

> The wrapper source lives in the **private** repo `devicai/devic-cli-wrapper-prototipe`
> (`prototype/`). It is not part of this `shellpilot` repo. Only the **compiled
> binaries** are published, as release assets on the public tap repo.

## Install (for users / testers)

```sh
brew tap devicai/tap
brew install devic-cli-wrapper
devic-cli-wrapper version          # -> devic-cli-wrapper prototype X.Y.Z
devic-cli-wrapper install          # install + shim the CLIs declared in policy
```

Upgrades: `brew update && brew upgrade devic-cli-wrapper`.

## Why Homebrew (and why unsigned is fine here)

Code-signing / notarization is **only needed for direct-download installers**
(`.dmg` / `.pkg`), which trigger the macOS Gatekeeper "unidentified developer"
prompt. Homebrew downloads release assets with `curl` and strips the download
quarantine attribute, so an **unsigned** binary installs without any Gatekeeper
friction. That makes brew the right channel for distributing the wrapper today,
and defers signing/notarization to a future public direct-download installer.

## Layout

- **Tap repo:** [`devicai/homebrew-tap`](https://github.com/devicai/homebrew-tap)
  — public. The `homebrew-` prefix is what lets `brew tap devicai/tap` resolve it.
- **Formula:** `Formula/devic-cli-wrapper.rb` in that repo. Uses
  `on_macos`/`on_linux` + `on_arm`/`on_intel` to select the right tarball and
  sha256, then `bin.install "devic-cli-wrapper"`.
- **Binaries:** attached as assets to a GitHub Release **on the tap repo itself**
  (e.g. tag `v0.4.0`), so the private source repo stays private. Each release
  carries 4 tarballs + a `checksums.txt`:
  - `devic-cli-wrapper_<ver>_darwin_arm64.tar.gz`
  - `devic-cli-wrapper_<ver>_darwin_amd64.tar.gz`
  - `devic-cli-wrapper_<ver>_linux_amd64.tar.gz`
  - `devic-cli-wrapper_<ver>_linux_arm64.tar.gz`

## Build tooling (in the private wrapper repo)

- `prototype/main.go` — `wrapperVersion` is a `var` (not `const`) so the version
  is injectable at build time via `-ldflags "-X main.wrapperVersion=<ver>"`.
- `prototype/build-release.sh` — cross-compiles the 4 targets. Pure-Go build
  (`CGO_ENABLED=0`, `-trimpath`, `-ldflags "-s -w -X main.wrapperVersion=<ver>"`),
  so everything cross-compiles from a single Mac. Output lands in `dist/` with a
  `checksums.txt`.

## Cutting a new version

1. In the wrapper repo, bump `wrapperVersion` in `prototype/main.go`
   (or pass the version as `$1` to the script).
2. `cd prototype && ./build-release.sh` → artifacts + `dist/checksums.txt`.
3. In the tap repo, edit `Formula/devic-cli-wrapper.rb`: update `version`, the
   four `url`s (new tag) and the four `sha256` from `dist/checksums.txt`.
   Commit & push.
4. Publish the release:
   ```sh
   gh release create vX.Y.Z --repo devicai/homebrew-tap \
     dist/devic-cli-wrapper_X.Y.Z_*.tar.gz dist/checksums.txt
   ```
5. Verify: `brew update && brew upgrade devic-cli-wrapper` (or a fresh
   `brew install`), then `devic-cli-wrapper version`. `brew test
   devic-cli-wrapper` runs the formula's smoke test.

## Decisions on record

- **Public tap + public release assets** over a private tap requiring each tester
  to set `HOMEBREW_GITHUB_API_TOKEN`. Source code stays private regardless.
- **Manual `build-release.sh`** over goreleaser — zero new dependencies, enough
  for the current cadence. goreleaser (run locally, no GitHub Actions per repo
  policy) remains the upgrade path if releases become frequent.

## Future

- `goreleaser` local config if release cadence increases.
- Code-signing + notarization for a public direct-download installer (not needed
  for the brew channel).
- A check that the formula's sha256 values match the published release assets.
