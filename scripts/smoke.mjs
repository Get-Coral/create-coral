// Scaffolds a module with the built CLI and checks the result.
//
//   node scripts/smoke.mjs          scaffold only (fast)
//   node scripts/smoke.mjs --full   also install, check and build the module,
//                                   so a broken template fails here
//
// CORAL_TEMPLATE_REF picks the template branch, tag or SHA (default: main).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const full = process.argv.includes("--full");
const templateRef = process.env.CORAL_TEMPLATE_REF ?? "main";
const tempDir = mkdtempSync(path.join(tmpdir(), "create-coral-smoke-"));
const moduleDir = path.join(tempDir, "module");

function run(command, args, cwd) {
	console.log(`$ ${command} ${args.join(" ")}`);
	const result = spawnSync(command, args, { cwd, stdio: "inherit" });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
	}
}

try {
	run(
		process.execPath,
		[
			path.resolve("dist/create-coral.mjs"),
			moduleDir,
			"--module-name",
			"smoke-module",
			"--template-ref",
			templateRef,
			"--yes",
			"--no-install",
		],
		process.cwd(),
	);
	if (!existsSync(path.join(moduleDir, "package.json"))) {
		throw new Error("The scaffolded module has no package.json");
	}

	if (full) {
		run("pnpm", ["install"], moduleDir);
		run("pnpm", ["check"], moduleDir);
		run("pnpm", ["build"], moduleDir);
	}
	console.log(`Smoke test passed (template ${templateRef}${full ? ", full" : ""}).`);
} finally {
	rmSync(tempDir, { recursive: true, force: true });
}
