import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform, release } from "node:os";
import path from "node:path";
import process from "node:process";

const TELEMETRY_ENDPOINT =
	process.env.CORAL_TELEMETRY_ENDPOINT?.trim() || "https://getcoral.dev/api/telemetry";
const TELEMETRY_TIMEOUT_MS = 1_000;
const TELEMETRY_VERSION = 1;

const ALLOWED_EVENTS = new Set([
	"cli.run",
	"cli.template-selected",
	"cli.install-completed",
	"cli.install-skipped",
	"cli.aborted",
	"cli.error",
]);

const CI_ENV_VARS = [
	"CI",
	"CONTINUOUS_INTEGRATION",
	"GITHUB_ACTIONS",
	"GITLAB_CI",
	"CIRCLECI",
	"TRAVIS",
	"BUILDKITE",
	"DRONE",
	"JENKINS_URL",
];

type TelemetryConfig = {
	disabled?: boolean;
	notified?: boolean;
	anonymousId?: string;
};

type EventProperties = Record<string, string | number | boolean>;

let cachedConfig: TelemetryConfig | null = null;
let configDirty = false;
let firstRunNotice = false;
let runtimeDisabled = false;
const pendingRequests = new Set<Promise<unknown>>();

function getConfigDir(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
	const baseDir = xdgConfigHome || path.join(homedir(), ".config");
	return path.join(baseDir, "coral");
}

function getConfigPath(): string {
	return path.join(getConfigDir(), "telemetry.json");
}

function readConfig(): TelemetryConfig {
	if (cachedConfig) return cachedConfig;
	const configPath = getConfigPath();
	if (!existsSync(configPath)) {
		cachedConfig = {};
		return cachedConfig;
	}
	try {
		const raw = readFileSync(configPath, "utf8");
		const parsed = JSON.parse(raw) as TelemetryConfig;
		cachedConfig = parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		cachedConfig = {};
	}
	return cachedConfig;
}

function persistConfig(): void {
	if (!configDirty || !cachedConfig) return;
	try {
		mkdirSync(getConfigDir(), { recursive: true });
		writeFileSync(getConfigPath(), `${JSON.stringify(cachedConfig, null, 2)}\n`);
		configDirty = false;
	} catch {
		// Persistence is best-effort. Don't fail the CLI if disk is read-only.
	}
}

function getOrCreateAnonymousId(): string {
	const config = readConfig();
	if (config.anonymousId && typeof config.anonymousId === "string") {
		return config.anonymousId;
	}
	const id = randomUUID();
	config.anonymousId = id;
	cachedConfig = config;
	configDirty = true;
	return id;
}

function isCi(): boolean {
	return CI_ENV_VARS.some((name) => Boolean(process.env[name]?.trim()));
}

function isOptedOutByEnv(): boolean {
	const truthy = (value: string | undefined) => {
		if (!value) return false;
		const normalized = value.trim().toLowerCase();
		return normalized === "1" || normalized === "true" || normalized === "yes";
	};
	if (truthy(process.env.CORAL_TELEMETRY_DISABLED)) return true;
	if (truthy(process.env.DO_NOT_TRACK)) return true;
	return false;
}

export function isTelemetryEnabled(): boolean {
	if (runtimeDisabled) return false;
	if (isOptedOutByEnv()) return false;
	if (isCi()) return false;
	const config = readConfig();
	if (config.disabled === true) return false;
	return true;
}

export function disableTelemetry(): void {
	runtimeDisabled = true;
}

export function setPersistentTelemetryDisabled(disabled: boolean): void {
	const config = readConfig();
	config.disabled = disabled;
	cachedConfig = config;
	configDirty = true;
	persistConfig();
}

export function shouldShowFirstRunNotice(): boolean {
	if (!isTelemetryEnabled()) return false;
	const config = readConfig();
	if (config.notified === true) return false;
	firstRunNotice = true;
	return true;
}

export function markFirstRunNoticeShown(): void {
	if (!firstRunNotice) return;
	const config = readConfig();
	config.notified = true;
	cachedConfig = config;
	configDirty = true;
	persistConfig();
}

function bucketModuleNameLength(value: string): string {
	const length = value.length;
	if (length <= 10) return "short";
	if (length <= 20) return "medium";
	if (length <= 40) return "long";
	return "very-long";
}

function nodeMajor(): string {
	const match = /^v?(\d+)/.exec(process.version);
	return match?.[1] ?? "unknown";
}

export function deriveModuleNameShape(name: string): EventProperties {
	const trimmed = name.trim();
	return {
		moduleName_isScoped: trimmed.startsWith("@"),
		moduleName_lengthBucket: bucketModuleNameLength(trimmed),
	};
}

export function deriveTemplateShape(repo: string, ref: string): EventProperties {
	const isDefault = repo === "Get-Coral/template" && ref === "main";
	return {
		template_isDefault: isDefault,
		template_refKind: /^[0-9a-f]{40}$/i.test(ref) ? "sha" : ref === "main" ? "main" : "named",
	};
}

function buildPayload(event: string, properties: EventProperties, version: string) {
	const payload = {
		v: TELEMETRY_VERSION,
		event,
		properties: {
			...properties,
			cliVersion: version,
			nodeMajor: nodeMajor(),
			platform: platform(),
			arch: process.arch,
			osRelease: release().split(".")[0] ?? "unknown",
			anonymousId: getOrCreateAnonymousId(),
		},
	};
	persistConfig();
	return payload;
}

export function sendEvent(event: string, properties: EventProperties, version: string): void {
	if (!isTelemetryEnabled()) return;
	if (!ALLOWED_EVENTS.has(event)) return;

	const payload = buildPayload(event, properties, version);
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, TELEMETRY_TIMEOUT_MS);

	const request = fetch(TELEMETRY_ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
		signal: controller.signal,
	})
		.catch(() => undefined)
		.finally(() => {
			clearTimeout(timer);
			pendingRequests.delete(request);
		});

	pendingRequests.add(request);
}

export async function flushTelemetry(maxWaitMs = 1_500): Promise<void> {
	if (pendingRequests.size === 0) return;
	const settled = Promise.allSettled([...pendingRequests]);
	const cap = new Promise<void>((resolve) => {
		setTimeout(resolve, maxWaitMs).unref?.();
	});
	await Promise.race([settled, cap]);
}

export function getTelemetryEndpoint(): string {
	return TELEMETRY_ENDPOINT;
}
