import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["run", "check"], {
  stdio: "inherit",
  shell: true
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
