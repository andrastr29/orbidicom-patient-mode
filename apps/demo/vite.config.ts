import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [
    vue(),
    {
      // Inject the runtime-config <script> at build/serve time rather than hard-
      // coding it in index.html. config.js is a classic, runtime-GENERATED global
      // (the CLI/container rewrites it per deploy), so it must NOT be bundled.
      // Injecting via the hook keeps the relative "./config.js" path (sub-path
      // deploys) while avoiding Vite's "can't be bundled without type=module"
      // warning. Classic script → runs before the deferred app module regardless
      // of position; body-prepend keeps it ahead of the bundle entry.
      name: "orbidicom-runtime-config",
      transformIndexHtml() {
        return [{ tag: "script", attrs: { src: "./config.js" }, injectTo: "body-prepend" }];
      },
    },
  ],
  base: "./",
  // @orbidicom/vue is shipped as source in the monorepo; let the vue plugin compile it.
  // Only @cornerstonejs/dicom-image-loader (WASM + web workers) breaks esbuild's dep
  // optimizer, so exclude just that and serve it as native ESM. Keep @cornerstonejs/
  // core + tools OPTIMIZED so esbuild bundles their CommonJS deps (vtk.js, globalthis…)
  // with proper ESM interop; excluding them too made the browser throw
  // "does not provide an export named 'default'" for globalthis.
  optimizeDeps: {
    exclude: ["@orbidicom/vue", "@cornerstonejs/dicom-image-loader"],
    // The raw-served loader default-imports these UMD/CJS WASM codec glue modules
    // (`module.exports = …`, no ESM default). Force them through esbuild so they
    // get CJS->ESM interop; otherwise the browser throws "does not provide an
    // export named 'default'". The matching `.wasm` is loaded via new URL(), not
    // imported, so it still resolves from node_modules.
    include: [
      "dicom-parser",
      "@cornerstonejs/codec-charls/decodewasmjs",
      "@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs",
      "@cornerstonejs/codec-openjpeg/decodewasmjs",
      "@cornerstonejs/codec-openjph/wasmjs",
    ],
  },
  // Cornerstone's dicom-image-loader spawns a web worker that code-splits; the
  // default "iife" worker format can't, so emit ES-module workers.
  worker: { format: "es" },
});
