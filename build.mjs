import { rollup, watch as rollupWatch } from "rollup";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const watch = process.argv.includes("--watch");
const outFile = path.join(root, "main.js");

const staticFiles = ["manifest.json", "versions.json"];

async function readDeployConfig() {
  try {
    return JSON.parse(await fsp.readFile(path.join(root, "deploy.config.json"), "utf8"));
  } catch {
    return null;
  }
}

async function deploy() {
  const config = await readDeployConfig();
  if (!config?.vault) {
    console.warn("[deploy] deploy.config.json not found, skipping deployment.");
    return;
  }

  const pluginId = config.pluginId || "video-library";
  const target = path.join(config.vault, ".obsidian", "plugins", pluginId);
  await fsp.mkdir(target, { recursive: true });

  const targetReal = await fsp.realpath(target).catch(() => path.resolve(target));
  const rootReal = await fsp.realpath(root);
  if (targetReal === rootReal) {
    console.log(`[deploy] ${pluginId} is linked to this source folder; nothing to copy.`);
    return;
  }

  const outputs = ["main.js", "styles.css", ...staticFiles];
  for (const file of outputs) {
    try {
      await fsp.copyFile(path.join(root, file), path.join(target, file));
    } catch (error) {
      if (file === "versions.json") continue;
      throw error;
    }
  }
  console.log(`[deploy] ${pluginId} -> ${target}`);
}

function stylesPlugin() {
  return {
    name: "video-library-styles",
    buildStart() {
      this.addWatchFile(path.join(root, "src", "styles.css"));
      this.addWatchFile(path.join(root, "manifest.json"));
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "styles.css",
        source: fs.readFileSync(path.join(root, "src", "styles.css"), "utf8")
      });
    }
  };
}

function deployPlugin() {
  return {
    name: "video-library-deploy",
    async writeBundle() {
      await deploy();
    }
  };
}

function external(id) {
  return (
    id === "obsidian" ||
    id === "electron" ||
    id.startsWith("node:") ||
    id.startsWith("@codemirror/") ||
    id.startsWith("@lezer/")
  );
}

const config = {
  input: path.join(root, "src", "main.ts"),
  external,
  plugins: [
    stylesPlugin(),
    nodeResolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    typescript({
      tsconfig: path.join(root, "tsconfig.json"),
      compilerOptions: {
        module: "ESNext",
        target: "ES2018",
        sourceMap: false,
        inlineSources: false,
        declaration: false,
        declarationMap: false,
        noEmit: false
      }
    }),
    deployPlugin()
  ],
  onwarn(warning, warn) {
    if (warning.code === "CIRCULAR_DEPENDENCY") return;
    warn(warning);
  }
};

const output = {
  file: outFile,
  format: "cjs",
  exports: "default",
  sourcemap: watch ? "inline" : false,
  generatedCode: "es2015"
};

if (watch) {
  const watcher = rollupWatch({ ...config, output });
  watcher.on("event", (event) => {
    if (event.code === "START") {
      console.log("[watch] Building…");
    } else if (event.code === "BUNDLE_END") {
      void event.result?.close();
    } else if (event.code === "END") {
      console.log("[watch] Build finished. Waiting for changes…");
    } else if (event.code === "ERROR") {
      console.error("[watch]", event.error);
    }
  });
  console.log("[watch] Watching src/ and manifest.json. Press Ctrl+C to stop.");
} else {
  const bundle = await rollup(config);
  await bundle.write(output);
  await bundle.close();
  console.log("[build] main.js and styles.css written.");
}
