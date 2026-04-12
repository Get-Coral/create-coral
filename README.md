# create-coral

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
