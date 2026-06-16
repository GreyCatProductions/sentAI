/// <reference types="node" />
import { writeFileSync } from "node:fs";
import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";

export default defineConfig({
  source: ["src", "addon"],
  dist: ".scaffold/build",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/release/${pkg.version.includes("-") ? "update-beta.json" : "update.json"
    }`,
  xpiDownloadLink:
    "https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",

  build: {
    assets: ["addon/**/*.*"],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: pkg.homepage,
      buildVersion: pkg.version,
      buildTime: "{{buildTime}}",
      serverUrl: process.env.SERVER_URL ?? "",
    },
    prefs: {
      prefix: `extensions.zotero.${pkg.config.addonRef}`,
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
          __server_url__: `"${process.env.SERVER_URL ?? ""}"`,
        },
        bundle: true,
        target: "firefox115",
        outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
      },
      {
        entryPoints: ["src/chatPanel.ts"],
        bundle: true,
        target: "firefox115",
        define: {
          __server_url__: `"${process.env.SERVER_URL ?? ""}"`,
        },
        outfile: `.scaffold/build/addon/content/scripts/chatPanel.js`,
      },
    ],
  },

  test: {
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}.data.initialized`,
    hooks: {
      "test:prebuild": () => {
        const url = process.env.SERVER_URL ?? "";
        writeFileSync(
          "./test/00_setup.test.ts",
          `(globalThis as any).__server_url__ = ${JSON.stringify(url)};\n`,
        );
      },
    },
  },

  // If you need to see a more detailed log, uncomment the following line:
  // logLevel: "trace",
});
