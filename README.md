# create-coral

Scaffold a new Coral module from the official `template/` in the Coral repository.

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
pnpm create coral@latest my-module -- --assignee ElianCodes --no-install
```

Supported flags:

- `--assignee <github-user>`
- `--module-name <name>`
- `--yes`
- `--install`
- `--no-install`
- `--help`

## What it does

- fetches the latest `template/` from `Get-Coral/coral`
- copies it into your target directory
- renames `coral-module` placeholders
- updates the Release Please assignee
- optionally runs `pnpm install`
