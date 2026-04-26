# create-coral

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-ElianCodes-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/ElianCodes)
[![Discord](https://img.shields.io/discord/1495441903297237043?label=Discord&logo=discord&logoColor=white&color=5865F2)](https://discord.gg/M3wzFpGbzp)

Scaffold a new Coral module from the official template repository.

The CLI is interactive by default and ships a guided setup flow for naming, destination, and dependency installation.

The important bit: the template repository is the standard. That is where shared `package.json` scripts, GitHub workflows, Biome rules, and repository conventions should live so every new repo starts the same way.

## Usage

```bash
pnpm create coral@latest my-module
```

You can also run it interactively:

```bash
pnpm create coral@latest
```

## Options

```bash
pnpm create coral@latest my-module -- --no-install
```

Supported flags:

- `--module-name <name>`
- `--template-repo <org/repo>`
- `--template-ref <ref>`
- `--yes`
- `--install`
- `--no-install`
- `--no-telemetry` (one run)
- `--telemetry-status`
- `--telemetry-disable` (persistent)
- `--telemetry-enable`
- `--help`

## What it does

- clones a real GitHub template repository (defaults to `Get-Coral/template@main`)
- copies it into your target directory
- renames `coral-module` placeholders
- removes template git history so your new project starts clean
- keeps the template's release automation intact
- optionally runs `pnpm install`

Because it clones from a real repository, the fastest way to standardize 100 repos is to treat the template repo as the source of truth and cut versioned template refs when the standard changes.

## Reuse this style in your own org

Point `create-coral` at any template repository that encodes your team's standards.

```bash
pnpm create coral@latest my-module -- --template-repo YourOrg/your-template --template-ref main
```

`--template-ref` accepts a branch, tag, or commit SHA.

For stable team rollouts, prefer a tag or commit SHA instead of `main` so every developer gets the exact same starting point.

## Anonymous telemetry

`create-coral` collects anonymous, opt-out usage data so we can see which templates get picked, how often install succeeds, and which Node/OS combinations are in use. The first time you run the CLI you'll see a one-time notice with this same information.

### What we collect

- Event name (run started, template selected, install completed/skipped, error, aborted)
- CLI version
- Node major version
- OS family + arch
- Anonymous random ID stored in `~/.config/coral/telemetry.json` (a UUID, not your username)
- Module name **shape only** — whether it's scoped, and a length bucket. We never see the actual name.
- Template name **shape only** — whether it's the default Coral template and what kind of ref (main, tag, SHA).
- Run result and a coarse error class for failures.

### What we never collect

- File paths, directory names, or your project name
- Username, hostname, IP address
- Environment variable contents
- Stack traces or error messages

### How to opt out

Any of these will turn telemetry off:

```bash
# One run only
pnpm create coral@latest my-module -- --no-telemetry

# Persistent (writes to ~/.config/coral/telemetry.json)
pnpm create coral@latest -- --telemetry-disable

# Environment variables
CORAL_TELEMETRY_DISABLED=1 pnpm create coral@latest
DO_NOT_TRACK=1 pnpm create coral@latest
```

CI environments are detected automatically and skipped.

### Status & re-enable

```bash
pnpm create coral@latest -- --telemetry-status
pnpm create coral@latest -- --telemetry-enable
```

More details: <https://getcoral.dev/telemetry>.
