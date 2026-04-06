/**
 * Create a temporary git repo for testing.
 */
export async function createTempRepo(): Promise<{ path: string; cleanup: () => void }> {
  const tmpDir = `/tmp/vigil-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await Bun.spawn(["mkdir", "-p", tmpDir]).exited;
  await Bun.spawn(["git", "init"], { cwd: tmpDir, stdout: "ignore", stderr: "ignore" }).exited;
  await Bun.spawn(["git", "config", "user.email", "test@vigil.dev"], {
    cwd: tmpDir,
    stdout: "ignore",
  }).exited;
  await Bun.spawn(["git", "config", "user.name", "Vigil Test"], {
    cwd: tmpDir,
    stdout: "ignore",
  }).exited;

  // Initial commit
  await Bun.write(`${tmpDir}/README.md`, "# Test Repo");
  await Bun.spawn(["git", "add", "."], { cwd: tmpDir, stdout: "ignore" }).exited;
  await Bun.spawn(["git", "commit", "-m", "Initial commit"], {
    cwd: tmpDir,
    stdout: "ignore",
    stderr: "ignore",
  }).exited;

  return {
    path: tmpDir,
    cleanup: () => Bun.spawnSync(["rm", "-rf", tmpDir]),
  };
}
