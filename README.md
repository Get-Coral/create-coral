# create-coral

Scaffold a new Coral module from the official `template/` in the Coral repository.

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
- `--yes`
- `--install`
- `--no-install`
- `--help`

## What it does

- fetches the latest `template/` from `Get-Coral/coral`
- copies it into your target directory
- renames `coral-module` placeholders
- keeps the template's release automation intact
- optionally runs `pnpm install`
