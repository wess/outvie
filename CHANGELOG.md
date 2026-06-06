# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.3] - 2026-05-31

### Added

- Local owner-account login: a fresh install can sign in without an external
  IdP. New `/api/auth/setup` (first-run probe + owner creation, closed once any
  user exists) and `/api/auth/login` (email-or-username + password) routes, an
  `OWNER_EMAIL`/`OWNER_PASSWORD` boot-time seed, and a web login screen that
  offers password login / first-run owner creation alongside the SSO button.
- Owner/admin library management: owner-gated ROM upload (multipart stream into
  the existing ingest pipeline), delete, and title/system metadata edit, exposed
  through the library UI (upload button, per-card edit/delete menu) and guarded
  server-side by an owner-only pipe.
- Store `update` method and `GamePatch` type for editing game metadata.
- Server route tests covering the upload -> list -> edit -> delete round-trip and
  auth rejection (anonymous 401, non-owner 403), plus the local auth flow
  (needsSetup probe, setup, setup-closed, login success, wrong-password 401).

## [0.2.2] - 2026-05-31

### Added

- Unit test suite (`bun test`) covering the riskiest pure logic:
  ROM system detection (NES/Genesis magic bytes plus extension fallback),
  `titleFromFilename` filename cleanup, the canonical `paths`/`romPath`/`savePath`
  layout helpers, `ingestRom` result branches (empty, unsupported, sha1 dedupe),
  and HTTP Range parsing for the ROM endpoint.
- GitHub Actions CI workflow that installs with Bun and runs lint, typecheck,
  tests, and the build on every push to `main` and on pull requests.
- Root `typecheck` script (`tsc --noEmit`) so the type check runs consistently
  in CI and locally.
- This changelog.

### Changed

- Web bundle is now code-split: React, Mantine, React Query, and the emulator
  (nostalgist) are emitted as separate vendor chunks, and the player route is
  loaded on demand. This clears the single-bundle size warning.

### Fixed

- License metadata mismatch: `package.json` now declares `Apache-2.0`, matching
  the `LICENSE` file and README.

## [0.2.1] - 2026-05

### Added

- Self-hosted retro-game library serving NES, SNES, and Genesis ROMs played
  in-browser via WASM libretro cores.
- Bun API server with Postgres metadata storage and on-disk ROM/save layout.
- React 19 + Mantine v7 single-page web client.
- ROM ingest with system sniffing, sha1 deduplication, and title cleanup.
- HTTP Range support on the ROM endpoint for the WASM emulator.
- Optional OIDC SSO authentication.
- Optional Rust libretro streaming engine.

[Unreleased]: https://github.com/wess/outvie/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/wess/outvie/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/wess/outvie/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/wess/outvie/releases/tag/v0.2.1
