# create-coral

Scaffold a new Coral module from the official template repository.

The CLI is interactive by default and ships a guided setup flow for naming, destination, and dependency installation.

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

- fetches a template archive from a real GitHub repository (defaults to `Get-Coral/template@main`)
- copies it into your target directory
- renames `coral-module` placeholders
- keeps the template's release automation intact
- optionally runs `pnpm install`

## Reuse this style in your own org

Point `create-coral` at any template repository that encodes your team's standards.

```bash
pnpm create coral@latest my-module -- --template-repo YourOrg/your-template --template-ref main
```

`--template-ref` accepts a branch, tag, or commit SHA.
