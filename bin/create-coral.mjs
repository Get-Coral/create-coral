#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

const ARCHIVE_URL =
  'https://codeload.github.com/Get-Coral/template/tar.gz/refs/heads/main';
const DEFAULT_ASSIGNEE = 'ElianCodes';
const coral = '\x1b[38;5;209m';
const teal = '\x1b[38;5;80m';
const ink = '\x1b[97m';
const faint = '\x1b[90m';
const reset = '\x1b[0m';
const bold = '\x1b[1m';

function showHelp() {
  console.log(`
${bold}${coral}create-coral${reset}

${ink}Usage${reset}
  pnpm create coral@latest my-module
  pnpm create coral@latest

${ink}Options${reset}
  --module-name <name>   Override the module/package name
  --assignee <user>      GitHub username for Release Please PR assignment
  --yes                  Skip prompts and use defaults
  --install              Run pnpm install after scaffolding
  --no-install           Skip pnpm install
  --help                 Show this help
`);
}

function printBanner() {
  console.log(`
${bold}${coral}Coral${reset} ${teal}module scaffolder${reset}`);
  console.log(
    `${faint}Create a new Jellyfin module from the official Coral template.${reset}\n`,
  );
}

function parseArgs(argv) {
  const options = {
    yes: false,
    install: undefined,
    moduleName: undefined,
    assignee: undefined,
    targetDir: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
    if (arg === '--yes' || arg === '-y') {
      options.yes = true;
      continue;
    }
    if (arg === '--install') {
      options.install = true;
      continue;
    }
    if (arg === '--no-install') {
      options.install = false;
      continue;
    }
    if (arg === '--module-name') {
      options.moduleName = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--assignee') {
      options.assignee = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!options.targetDir) {
      options.targetDir = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  return options;
}

function isValidModuleName(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`,
    );
  }
}

function copyTemplate(sourceDir, targetDir) {
  cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
  });
}

function replaceInFile(filePath, replacements) {
  if (!existsSync(filePath)) return;
  let content = readFileSync(filePath, 'utf8');
  for (const [searchValue, replaceValue] of replacements) {
    content = content.split(searchValue).join(replaceValue);
  }
  writeFileSync(filePath, content);
}

function isDirectoryEmpty(dirPath) {
  return !existsSync(dirPath) || readdirSync(dirPath).length === 0;
}

async function ask(rl, question, fallback) {
  const suffix = fallback ? ` ${faint}(${fallback})${reset}` : '';
  const answer = await rl.question(`${ink}${question}${reset}${suffix}: `);
  return answer.trim() || fallback;
}

async function confirm(rl, question, fallback = true) {
  const label = fallback ? 'Y/n' : 'y/N';
  const answer = (
    await rl.question(`${ink}${question}${reset} ${faint}[${label}]${reset}: `)
  )
    .trim()
    .toLowerCase();
  if (!answer) return fallback;
  return answer === 'y' || answer === 'yes';
}

async function main() {
  printBanner();

  const options = parseArgs(process.argv.slice(2));
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const targetArg = options.targetDir ?? '.';
    const targetDir = path.resolve(process.cwd(), targetArg);
    const defaultModuleName =
      options.moduleName ??
      (targetArg === '.' ? 'coral-module' : path.basename(targetDir));

    let moduleName = options.moduleName;
    if (!moduleName && !options.yes) {
      moduleName = await ask(rl, 'Module name', defaultModuleName);
    }
    moduleName ||= defaultModuleName;

    if (!isValidModuleName(moduleName)) {
      throw new Error(
        'Module name must be lowercase kebab-case, e.g. marquee or karaoke-queue.',
      );
    }

    let assignee = options.assignee;
    if (!assignee && !options.yes) {
      assignee = await ask(rl, 'Release PR assignee', DEFAULT_ASSIGNEE);
    }
    assignee ||= DEFAULT_ASSIGNEE;

    let install = options.install;
    if (install === undefined) {
      install = options.yes
        ? true
        : await confirm(rl, 'Install dependencies after scaffolding?', true);
    }

    if (!isDirectoryEmpty(targetDir)) {
      const ok = options.yes
        ? false
        : await confirm(
            rl,
            `Target directory ${path.basename(targetDir)} is not empty. Continue anyway?`,
            false,
          );
      if (!ok) {
        throw new Error('Refusing to scaffold into a non-empty directory.');
      }
    }

    console.log(`${teal}Fetching template from ${ARCHIVE_URL}${reset}`);
    const tempDir = mkdtempSync(path.join(tmpdir(), 'create-coral-'));

    try {
      const archivePath = path.join(tempDir, 'coral-main.tar.gz');
      run('curl', ['-L', ARCHIVE_URL, '-o', archivePath]);
      run('tar', ['-xzf', archivePath, '-C', tempDir]);

      const extractedRoot = readdirSync(tempDir, { withFileTypes: true }).find(
        (entry) => entry.isDirectory() && entry.name.endsWith('-main'),
      )?.name;

      if (!extractedRoot) {
        throw new Error('Could not find extracted template directory.');
      }

      const sourceDir = path.join(tempDir, extractedRoot);
      copyTemplate(sourceDir, targetDir);

      const replacements = [
        ['coral-module', moduleName],
        ['ASSIGNEE: ElianCodes', `ASSIGNEE: ${assignee}`],
        ['Getting started from this template', 'Getting started'],
      ];

      const filesToRewrite = [
        'package.json',
        'README.md',
        '.github/workflows/ci.yml',
        '.github/workflows/docker-publish.yml',
        '.github/workflows/release-please.yml',
      ];

      for (const relativePath of filesToRewrite) {
        replaceInFile(path.join(targetDir, relativePath), replacements);
      }

      console.log(
        `${coral}Scaffolded ${bold}${moduleName}${reset}${coral} in ${targetDir}${reset}`,
      );

      if (install) {
        console.log(`${teal}Installing dependencies with pnpm...${reset}`);
        run('pnpm', ['install'], targetDir);
      }

      const relativeTargetDir = path.relative(process.cwd(), targetDir);
      const displayTargetDir =
        !relativeTargetDir || relativeTargetDir.startsWith('..')
          ? targetDir
          : relativeTargetDir;

      console.log(`\n${bold}${ink}Next steps${reset}`);
      console.log(`  cd ${displayTargetDir}`);
      if (!install) {
        console.log('  pnpm install');
      }
      console.log('  cp .env.example .env');
      console.log('  pnpm dev\n');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`\n${bold}\x1b[31mError:${reset} ${error.message}`);
  process.exit(1);
});
