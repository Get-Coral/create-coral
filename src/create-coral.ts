import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	log,
	note,
	outro,
	select,
	spinner,
	text,
} from "@clack/prompts";

const DEFAULT_TEMPLATE_REPO = "Get-Coral/template";
const DEFAULT_TEMPLATE_REF = "main";
const REEF = "🪸";
const WAVE = "🌊";

type Options = {
	yes: boolean;
	install: boolean | undefined;
	moduleName: string | undefined;
	targetDir: string | undefined;
	templateRepo: string;
	templateRef: string;
};

function showHelp(): void {
	console.log(`
${REEF} create-coral

Usage
  pnpm create coral@latest my-module
  pnpm create coral@latest

Options
  --module-name <name>   Override the module/package name
	--template-repo <org/repo>
												 Use a custom template repository
	--template-ref <ref>   Template git ref (branch, tag, or SHA)
  --yes                  Skip prompts and use defaults
  --install              Run pnpm install after scaffolding
  --no-install           Skip pnpm install
  --help                 Show this help
`);
}

function printBanner(): void {
	intro(`${REEF} create-coral`);
	note(
		`${WAVE} Spin up a Coral module from the official template.\n${REEF} Guided, minimal, and ready to ship.`,
		"Fresh reef",
	);
}

function parseArgs(argv: string[]): Options {
	const options: Options = {
		yes: false,
		install: undefined,
		moduleName: undefined,
		targetDir: undefined,
		templateRepo: DEFAULT_TEMPLATE_REPO,
		templateRef: DEFAULT_TEMPLATE_REF,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--help" || arg === "-h") {
			showHelp();
			process.exit(0);
		}
		if (arg === "--yes" || arg === "-y") {
			options.yes = true;
			continue;
		}
		if (arg === "--install") {
			options.install = true;
			continue;
		}
		if (arg === "--no-install") {
			options.install = false;
			continue;
		}
		if (arg === "--module-name") {
			options.moduleName = argv[index + 1];
			index += 1;
			continue;
		}
		if (arg === "--template-repo") {
			options.templateRepo = argv[index + 1] ?? "";
			index += 1;
			continue;
		}
		if (arg === "--template-ref") {
			options.templateRef = argv[index + 1] ?? "";
			index += 1;
			continue;
		}
		if (arg.startsWith("-")) {
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

function isValidModuleName(value: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isValidTemplateRepo(value: string): boolean {
	return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function buildArchiveUrl(templateRepo: string, templateRef: string): string {
	const encodedRef = encodeURIComponent(templateRef);
	return `https://codeload.github.com/${templateRepo}/tar.gz/${encodedRef}`;
}

function unwrapPrompt<T>(value: T | symbol, message: string): T {
	if (isCancel(value)) {
		cancel(message);
		process.exit(0);
	}

	return value;
}

function formatCommand(command: string, args: string[]): string {
	return [command, ...args].join(" ");
}

function run(command: string, args: string[], cwd?: string): string {
	const result = spawnSync(command, args, {
		cwd,
		stdio: "pipe",
		env: process.env,
		encoding: "utf8",
	});

	if (result.status !== 0) {
		const details = [result.stdout?.trim(), result.stderr?.trim()]
			.filter(Boolean)
			.join("\n");

		throw new Error(
			details
				? `${formatCommand(command, args)} failed.\n${details}`
				: `${formatCommand(command, args)} failed with exit code ${result.status ?? "unknown"}`,
		);
	}

	return result.stdout?.trim() ?? "";
}

function copyTemplate(sourceDir: string, targetDir: string): void {
	cpSync(sourceDir, targetDir, {
		recursive: true,
		force: true,
	});
}

function replaceInFile(
	filePath: string,
	replacements: Array<[string, string]>,
): void {
	if (!existsSync(filePath)) return;
	let content = readFileSync(filePath, "utf8");
	for (const [searchValue, replaceValue] of replacements) {
		content = content.split(searchValue).join(replaceValue);
	}
	writeFileSync(filePath, content);
}

function isDirectoryEmpty(dirPath: string): boolean {
	return !existsSync(dirPath) || readdirSync(dirPath).length === 0;
}

async function main(): Promise<void> {
	printBanner();

	const options = parseArgs(process.argv.slice(2));
	const targetFallback =
		options.targetDir ??
		(options.moduleName ? `./${options.moduleName}` : undefined);
	const targetArg =
		targetFallback ??
		(options.yes
			? "."
			: unwrapPrompt(
					await text({
						message: "Where should we create the module?",
						placeholder: "./coral-module",
						initialValue: "./coral-module",
					}),
					"Scaffolding cancelled.",
				));

	const normalizedTargetArg = targetArg.trim() || ".";
	const targetDir = path.resolve(process.cwd(), normalizedTargetArg);
	const defaultModuleName =
		options.moduleName ??
		(normalizedTargetArg === "." ? "coral-module" : path.basename(targetDir));

	let moduleName = options.moduleName;
	if (!moduleName && !options.yes) {
		moduleName = unwrapPrompt(
			await text({
				message: "What should the module be called?",
				placeholder: defaultModuleName,
				initialValue: defaultModuleName,
				validate(value) {
					const normalizedValue = value.trim();
					if (!normalizedValue) {
						return "Module name is required.";
					}

					if (!isValidModuleName(normalizedValue)) {
						return "Use lowercase kebab-case, for example marquee or karaoke-queue.";
					}

					return undefined;
				},
			}),
			"Scaffolding cancelled.",
		);
	}
	moduleName = (moduleName ?? defaultModuleName).trim();
	const templateRepo = options.templateRepo.trim();
	const templateRef = options.templateRef.trim();

	if (!isValidModuleName(moduleName)) {
		throw new Error(
			"Module name must be lowercase kebab-case, e.g. marquee or karaoke-queue.",
		);
	}

	if (!isValidTemplateRepo(templateRepo)) {
		throw new Error(
			"Template repo must be in owner/repo format, e.g. Get-Coral/template.",
		);
	}

	if (!templateRef) {
		throw new Error("Template ref is required.");
	}

	let install = options.install;
	if (install === undefined) {
		install = options.yes
			? true
			: unwrapPrompt(
					await select({
						message: "Install dependencies after scaffolding?",
						options: [
							{ value: true, label: "Yes", hint: "Recommended" },
							{ value: false, label: "No", hint: "I will do it manually" },
						],
					}),
					"Scaffolding cancelled.",
				);
	}

	if (!isDirectoryEmpty(targetDir)) {
		const ok = options.yes
			? false
			: unwrapPrompt(
					await confirm({
						message: `Target directory ${path.basename(targetDir)} is not empty. Continue anyway?`,
						initialValue: false,
					}),
					"Scaffolding cancelled.",
				);
		if (!ok) {
			throw new Error("Refusing to scaffold into a non-empty directory.");
		}
	}

	note(
		[
			`Module: ${moduleName}`,
			`Directory: ${targetDir}`,
			`Template: ${templateRepo}@${templateRef}`,
			`Install dependencies: ${install ? "Yes" : "No"}`,
		].join("\n"),
		"Scaffold plan",
	);

	const progress = spinner();
	const tempDir = mkdtempSync(path.join(tmpdir(), "create-coral-"));

	try {
		const archivePath = path.join(tempDir, "template.tar.gz");
		const archiveUrl = buildArchiveUrl(templateRepo, templateRef);

		progress.start("Downloading the Coral template");
		run("curl", ["-L", archiveUrl, "-o", archivePath]);
		run("tar", ["-xzf", archivePath, "-C", tempDir]);
		progress.stop("Template downloaded");

		const extractedRoot = readdirSync(tempDir, { withFileTypes: true }).find(
			(entry) => entry.isDirectory() && entry.name.endsWith("-main"),
		)?.name;

		if (!extractedRoot) {
			throw new Error("Could not find extracted template directory.");
		}

		progress.start("Wiring up module files");
		const sourceDir = path.join(tempDir, extractedRoot);
		copyTemplate(sourceDir, targetDir);

		const replacements: Array<[string, string]> = [
			["coral-module", moduleName],
			["Getting started from this template", "Getting started"],
		];

		const filesToRewrite = [
			"package.json",
			"README.md",
			".github/workflows/ci.yml",
			".github/workflows/docker-publish.yml",
			".github/workflows/release-please.yml",
		];

		for (const relativePath of filesToRewrite) {
			replaceInFile(path.join(targetDir, relativePath), replacements);
		}
		progress.stop(`${REEF} ${moduleName} scaffolded`);

		if (install) {
			progress.start("Installing dependencies with pnpm");
			run("pnpm", ["install"], targetDir);
			progress.stop("Dependencies installed");
		} else {
			log.step("Skipped dependency installation.");
		}

		const relativeTargetDir = path.relative(process.cwd(), targetDir);
		const displayTargetDir =
			!relativeTargetDir || relativeTargetDir.startsWith("..")
				? targetDir
				: relativeTargetDir;

		note(
			[
				`cd ${displayTargetDir}`,
				...(install ? [] : ["pnpm install"]),
				"cp .env.example .env",
				"pnpm dev",
			].join("\n"),
			"Next steps",
		);

		outro(`${REEF} ${moduleName} is ready.`);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

void main().catch((error: Error) => {
	log.error(error.message);
	process.exit(1);
});
