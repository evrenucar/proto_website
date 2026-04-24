import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 4181;
const baseUrl = `http://127.0.0.1:${port}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("preview server did not start"));
    }, 10000);

    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Local Access:")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`preview server exited early with code ${code}`));
    });
  });
}

async function fetchPage(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const body = await response.text();
  return {
    status: response.status,
    title: body.match(/<title>(.*?)<\/title>/)?.[1] || "",
    body
  };
}

const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);

  const routes = [
    ["/project", "Projects | Evren Ucar"],
    ["/projects", "Projects | Evren Ucar"],
    ["/braindump", "Braindump | Evren Ucar"],
    ["/cosmoboard", "Cosmoboard | Evren Ucar"],
    ["/content/projects/eurocrate-storage-universal-solution", "Eurocrate storage universal solution | Evren Ucar"]
  ];

  for (const [pathname, expectedTitle] of routes) {
    const page = await fetchPage(pathname);
    assert.equal(page.status, 200, `${pathname} returns 200`);
    assert.equal(page.title, expectedTitle, `${pathname} serves the matching html file`);
    assert.equal(page.body.includes("Page not found"), false, `${pathname} does not serve the 404 body`);
  }
} finally {
  child.kill();
}

console.log("preview server extensionless route check passed");
