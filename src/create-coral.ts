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
import {
	deriveModuleNameShape,
	deriveTemplateShape,
	disableTelemetry,
	flushTelemetry,
	getTelemetryEndpoint,
	isTelemetryEnabled,
	markFirstRunNoticeShown,
	sendEvent,
	setPersistentTelemetryDisabled,
	shouldShowFirstRunNotice,
} from "./telemetry.js";

const DEFAULT_TEMPLATE_REPO = "Get-Coral/template";
const DEFAULT_TEMPLATE_REF = "main";
const REEF = "🪸";
const WAVE = "🌊";

const PACKAGE_VERSION = readPackageVersion();

type Options = {
	yes: boolean;
	install: boolean | undefined;
	moduleName: string | undefined;
	targetDir: string | undefined;
	templateRepo: string;
	templateRef: string;
	telemetryAction: "scaffold" | "telemetry-disable" | "telemetry-enable" | "telemetry-status";
};

function readPackageVersion(): string {
	try {
		const packageJsonPath = new URL("../package.json", import.meta.url);
		const raw = readFileSync(packageJsonPath, "utf8");
		const parsed = JSON.parse(raw) as { version?: string };
		return parsed.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}

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
  --no-telemetry         Disable anonymous telemetry for this run
  --telemetry-status     Show telemetry status and exit
  --telemetry-disable    Persistently disable anonymous telemetry and exit
  --telemetry-enable     Re-enable anonymous telemetry and exit
  --help                 Show this help

Telemetry
  create-coral collects anonymous, opt-out usage data to help improve the CLI.
  Disable it any time with one of:
    --no-telemetry              (one run)
    --telemetry-disable         (persistent)
    CORAL_TELEMETRY_DISABLED=1  (env var)
    DO_NOT_TRACK=1              (industry-standard env var)
  Read more at https://getcoral.dev/telemetry
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
		telemetryAction: "scaffold",
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
		if (arg === "--no-telemetry") {
			disableTelemetry();
			continue;
		}
		if (arg === "--telemetry-status") {
			options.telemetryAction = "telemetry-status";
			continue;
		}
		if (arg === "--telemetry-disable") {
			options.telemetryAction = "telemetry-disable";
			continue;
		}
		if (arg === "--telemetry-enable") {
			options.telemetryAction = "telemetry-enable";
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

function classifyError(error: unknown): string {
	if (error instanceof Error) {
		const message = error.message.toLowerCase();
		if (message.includes("git ")) return "git-clone-failed";
		if (message.includes("pnpm install")) return "install-failed";
		if (message.includes("non-empty directory")) return "non-empty-target";
		if (message.includes("module name must be")) return "invalid-module-name";
		if (message.includes("template repo must be")) return "invalid-template-repo";
		if (message.includes("template ref is required")) return "missing-template-ref";
		if (message.includes("unknown option")) return "unknown-option";
		if (message.includes("unexpected argument")) return "unexpected-argument";
	}
	return "unknown";
}

function handleTelemetrySubcommand(action: Options["telemetryAction"]): void {
	if (action === "telemetry-status") {
		const enabled = isTelemetryEnabled();
		log.info(
			`Anonymous telemetry is ${enabled ? "enabled" : "disabled"}. Endpoint: ${getTelemetryEndpoint()}`,
		);
		log.info("More info: https://getcoral.dev/telemetry");
		return;
	}
	if (action === "telemetry-disable") {
		setPersistentTelemetryDisabled(true);
		log.success("Anonymous telemetry disabled.");
		return;
	}
	if (action === "telemetry-enable") {
		setPersistentTelemetryDisabled(false);
		log.success("Anonymous telemetry enabled.");
		return;
	}
}

function isValidModuleName(value: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isValidTemplateRepo(value: string): boolean {
	return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

class CliAbortError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CliAbortError";
	}
}

function unwrapPrompt<T>(value: T | symbol, message: string): T {
	if (isCancel(value)) {
		cancel(message);
		throw new CliAbortError(message);
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
		const details = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n");

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

function replaceInFile(filePath: string, replacements: Array<[string, string]>): void {
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

function cloneTemplateRepo(templateRepo: string, templateRef: string, tempDir: string): string {
	const sourceDir = path.join(tempDir, "template-src");
	const remoteUrl = `https://github.com/${templateRepo}.git`;

	run("git", ["clone", "--filter=blob:none", remoteUrl, sourceDir]);
	run("git", ["checkout", templateRef], sourceDir);
	rmSync(path.join(sourceDir, ".git"), { recursive: true, force: true });

	return sourceDir;
}

function normalizeWorkspaceDependencyRanges(packageJsonPath: string): void {
	if (!existsSync(packageJsonPath)) return;

	const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<
		string,
		Record<string, string>
	>;
	const dependencyFields = [
		"dependencies",
		"devDependencies",
		"peerDependencies",
		"optionalDependencies",
	];

	for (const field of dependencyFields) {
		const dependencies = packageJson[field];
		if (!dependencies) continue;

		for (const [name, range] of Object.entries(dependencies)) {
			if (typeof range === "string" && range.startsWith("workspace:")) {
				dependencies[name] = range.replace("workspace:", "");
			}
		}
	}

	writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));

	if (options.telemetryAction !== "scaffold") {
		handleTelemetrySubcommand(options.telemetryAction);
		return;
	}

	printBanner();

	if (shouldShowFirstRunNotice()) {
		note(
			[
				"create-coral collects anonymous usage data to help improve the CLI.",
				"Disable any time with --no-telemetry, --telemetry-disable, or CORAL_TELEMETRY_DISABLED=1.",
				"Details: https://getcoral.dev/telemetry",
			].join("\n"),
			"Anonymous telemetry",
		);
		markFirstRunNoticeShown();
	}

	sendEvent("cli.run", {}, PACKAGE_VERSION);

	const targetFallback =
		options.targetDir ?? (options.moduleName ? `./${options.moduleName}` : undefined);
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
		options.moduleName ?? (normalizedTargetArg === "." ? "coral-module" : path.basename(targetDir));

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
		throw new Error("Module name must be lowercase kebab-case, e.g. marquee or karaoke-queue.");
	}

	if (!isValidTemplateRepo(templateRepo)) {
		throw new Error("Template repo must be in owner/repo format, e.g. Get-Coral/template.");
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
		progress.start("Cloning the Coral template");
		const sourceDir = cloneTemplateRepo(templateRepo, templateRef, tempDir);
		progress.stop("Template cloned");

		sendEvent(
			"cli.template-selected",
			{
				...deriveModuleNameShape(moduleName),
				...deriveTemplateShape(templateRepo, templateRef),
			},
			PACKAGE_VERSION,
		);

		progress.start("Wiring up module files");
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
		normalizeWorkspaceDependencyRanges(path.join(targetDir, "package.json"));
		progress.stop(`${REEF} ${moduleName} scaffolded`);

		if (install) {
			progress.start("Installing dependencies with pnpm");
			run("pnpm", ["install"], targetDir);
			progress.stop("Dependencies installed");
			sendEvent("cli.install-completed", { result: "success" }, PACKAGE_VERSION);
		} else {
			log.step("Skipped dependency installation.");
			sendEvent("cli.install-skipped", {}, PACKAGE_VERSION);
		}

		const relativeTargetDir = path.relative(process.cwd(), targetDir);
		const displayTargetDir =
			!relativeTargetDir || relativeTargetDir.startsWith("..") ? targetDir : relativeTargetDir;

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

async function runAndExit(): Promise<never> {
	try {
		await main();
		await flushTelemetry();
		process.exit(0);
	} catch (error) {
		const isAbort =
			error instanceof CliAbortError ||
			(error instanceof Error && /refusing to scaffold/i.test(error.message));
		if (!(error instanceof CliAbortError)) {
			log.error(error instanceof Error ? error.message : String(error));
		}
		sendEvent(
			isAbort ? "cli.aborted" : "cli.error",
			{ errorClass: classifyError(error) },
			PACKAGE_VERSION,
		);
		await flushTelemetry();
		process.exit(isAbort ? 0 : 1);
	}
}

void runAndExit();
