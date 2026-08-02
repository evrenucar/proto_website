// Cross-process build lock for tests. Several test files run the site build,
// and generated pages are shared output: two builds racing, or a build racing
// a test that reads the pages, is what made whole-directory runs flake. A
// directory works as an atomic mutex (mkdir either creates it or throws), so
// every build-invoking test wraps its build in withBuildLock and the writes
// serialize while unrelated tests keep running in parallel.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const lockDir = path.join(process.cwd(), ".tmp", "build-lock");
const STALE_MS = 5 * 60 * 1000;
const RETRY_MS = 250;

async function acquire() {
  for (;;) {
    try {
      await mkdir(lockDir, { recursive: false });
      await writeFile(path.join(lockDir, "owner"), `${process.pid} ${new Date().toISOString()}\n`, "utf8");
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      // A crashed test must not deadlock every later run: break stale locks.
      try {
        if (existsSync(lockDir) && Date.now() - statSync(lockDir).mtimeMs > STALE_MS) {
          await rm(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Lost a race while inspecting; just retry.
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

export async function withBuildLock(fn) {
  await mkdir(path.dirname(lockDir), { recursive: true });
  await acquire();
  try {
    return await fn();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}

// A test that builds also reads the generated output afterwards, so the lock
// has to outlive the build call: hold it for the whole process and release on
// exit. Build-dependent tests serialize against each other; everything else
// keeps running in parallel.
export async function acquireBuildLockForProcess() {
  await mkdir(path.dirname(lockDir), { recursive: true });
  await acquire();
  process.on("exit", () => {
    try {
      rmSync(lockDir, { recursive: true, force: true });
    } catch {
      // Best effort; the stale-lock breaker covers a failed cleanup.
    }
  });
}
