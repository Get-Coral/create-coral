import { coralFmt } from "@get-coral/oxfmt-config";
import { coralLint } from "@get-coral/oxlint-config";
import { defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		entry: { "create-coral": "src/create-coral.ts" },
		format: ["esm"],
		platform: "node",
		target: "node20",
		// dist/create-coral.mjs, the bin in package.json.
		fixedExtension: true,
		dts: false,
		banner: { js: "#!/usr/bin/env node" },
		publint: true,
	},
	lint: {
		extends: [coralLint],
		jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
		rules: {
			"vite-plus/prefer-vite-plus-imports": "error",
			// A CLI talks to the terminal.
			"no-console": "off",
			complexity: "off",
		},
		options: { typeAware: true, typeCheck: true },
	},
	fmt: {
		...coralFmt,
		ignorePatterns: ["CHANGELOG.md"],
	},
});
