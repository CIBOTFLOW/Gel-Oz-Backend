import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 3197;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

async function waitUntilReady() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (output.includes("Ready")) return;
    if (server.exitCode !== null) throw new Error(`Server exited before readiness:\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server readiness timed out:\n${output}`);
}

try {
  await waitUntilReady();
  const [health, customer, customerAccount, operations] = await Promise.all([
    fetch(`${origin}/api/health`),
    fetch(`${origin}/`),
    fetch(`${origin}/musteri`),
    fetch(`${origin}/operations`),
  ]);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
  assert.equal(customer.status, 200);
  assert.match(await customer.text(), /Kesin teklif istemeden önce rotaları karşılaştırın/);
  assert.equal(customerAccount.status, 200);
  assert.match(await customerAccount.text(), /Müşteri hesabınız hazırlanıyor/);
  assert.equal(operations.status, 200);
  const html = await operations.text();
  assert.match(html, /Opening the Gel Öz control tower/);
  console.log("Runtime verification passed: health, Turkish homepage, customer account, and operations shell are reachable.");
} finally {
  server.kill("SIGTERM");
}
