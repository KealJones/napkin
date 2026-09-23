import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(args, env = process.env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(pnpm, args, { cwd: root, env, stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`pnpm ${args.join(" ")} exited with ${code}`));
    });
  });
}

await run(["--filter", "@napkin/concept-runtime", "build"]);

const children = [
  spawn(pnpm, ["--filter", "@napkin/concept-runtime", "dev"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  }),
  spawn(pnpm, ["--filter", "@napkin/studio-server", "dev"], {
    cwd: root,
    env: { ...process.env, NAPKIN_PORT: "4174" },
    stdio: "inherit",
  }),
  spawn(pnpm, ["--filter", "@napkin/studio-client", "dev"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  }),
];

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
for (const child of children) {
  child.once("error", (error) => {
    console.error(error);
    stop();
  });
  child.once("exit", (code) => {
    if (!stopping && code !== 0) {
      console.error(`Workspace development process exited with ${code}`);
      stop();
    }
  });
}
