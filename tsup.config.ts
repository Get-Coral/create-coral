import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		"create-coral": "src/create-coral.ts",
	},
	format: ["esm"],
	target: "node20",
	platform: "node",
	outDir: "dist",
	clean: true,
	splitting: false,
	sourcemap: false,
	dts: false,
	banner: {
		js: "#!/usr/bin/env node",
	},
	outExtension() {
		return {
			js: ".mjs",
		};
	},
});
