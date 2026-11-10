// Runs several servers as one stack: tagged, line-buffered output, and if any one exits the whole
// stack stops and says which one went down (a half-running stack fails in confusing ways: pages
// load, API calls fail).
import { spawn } from "node:child_process";
import net from "node:net";

function pipeLines(stream, out, tag) {
  // Split on whole lines before tagging, so lines from two servers never interleave mid-line.
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (d) => {
    pending += d;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) out.write(`${tag} ${line}\n`);
  });
  stream.on("end", () => {
    if (pending) out.write(`${tag} ${pending}\n`);
  });
}

// True when something already listens on 127.0.0.1:port.
export function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

export function runStack(procs, label) {
  let stopping = false;
  const children = procs.map(({ name, cmd, args, cwd, env = {} }) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    const tag = `[${name}]`;
    pipeLines(child.stdout, process.stdout, tag);
    pipeLines(child.stderr, process.stderr, tag);
    child.on("exit", (code) => {
      if (stopping) return;
      console.error(`${tag} exited with ${code}; stopping the ${label}`);
      stop(1);
    });
    return child;
  });
  function stop(code = 0) {
    stopping = true;
    for (const child of children) child.kill("SIGTERM");
    process.exit(code);
  }
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));
}
