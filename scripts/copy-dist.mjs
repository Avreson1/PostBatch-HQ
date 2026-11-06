#!/usr/bin/env node
/**
 * Copy the built demo (postbatch-demo/dist) to ./dist at the repo root.
 *
 * Hosts like Vercel look for `dist` next to the root package.json by default.
 * Copying it here means the deploy works whether the host uses vercel.json,
 * its own Vite preset, or the root folder as-is.
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'postbatch-demo', 'dist');
const to = path.join(root, 'dist');

if (!existsSync(path.join(from, 'index.html'))) {
  console.error(`[copy-dist] ${from} has no index.html — did the demo build run?`);
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log('[copy-dist] postbatch-demo/dist → dist');
