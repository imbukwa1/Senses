import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const manualVendorChunks: Record<string, string[]> = {
  forms: ["@hookform/resolvers", "react-hook-form", "zod"],
  radix: [
    "@radix-ui/react-alert-dialog",
    "@radix-ui/react-avatar",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-label",
    "@radix-ui/react-popover",
    "@radix-ui/react-progress",
    "@radix-ui/react-select",
    "@radix-ui/react-separator",
    "@radix-ui/react-slot",
    "@radix-ui/react-toast",
    "@radix-ui/react-tooltip",
  ],
  query: ["@tanstack/react-query"],
  react: ["react", "react-dom", "react-router-dom"],
  tiptap: ["@tiptap/pm", "@tiptap/react", "@tiptap/starter-kit"],
  ui: ["class-variance-authority", "clsx", "lucide-react", "tailwind-merge"],
};

function manualChunks(id: string) {
  const normalizedId = id.replace(/\\/g, "/");

  for (const [chunkName, packages] of Object.entries(manualVendorChunks)) {
    if (packages.some((packageName) => normalizedId.includes(`/node_modules/${packageName}/`))) {
      return chunkName;
    }
  }

  const univerPackage = normalizedId.match(/\/node_modules\/@univerjs\/([^/]+)/)?.[1];
  if (univerPackage) {
    return `univer-${univerPackage}`;
  }

  return undefined;
}

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "INVALID_ANNOTATION" && warning.id?.includes("node_modules/zod/")) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
