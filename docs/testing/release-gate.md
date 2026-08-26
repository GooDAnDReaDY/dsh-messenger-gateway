# Release gate (maintainers)

Public npm/GitHub version lives in `package.json` (this line is independent of any private iteration tags).

Before `npm publish` / GitHub Release:

1. `npm test` green
2. `npm pack --dry-run` — only `lib/`, `cordis.patch.yml`, `README.md`, `LICENSE`, `package.json`
3. README matches shipped features; no host paths, IPs, or secrets
4. `package.json` version == git tag `vX.Y.Z`
5. Scoped name matches in `package.json`, `cordis.patch.yml`, and `lib/client.js` ModuleLoader `id`
