import { expect, test } from "bun:test";

test("importing src/st-jgm.ts does not start the harness", async () => {
  const spawns: string[] = [];
  const originalSpawn = Bun.spawnSync;
  const originalExit = process.exit;
  let exits = 0;

  Bun.spawnSync = ((cmd: string[]) => {
    spawns.push(cmd.map(String).join(" "));
    return {
      exitCode: 1,
      stdout: new Uint8Array(),
      stderr: new Uint8Array(),
      success: false,
      exitedDueToTimeout: false,
    };
  }) as typeof Bun.spawnSync;

  process.exit = ((code?: number) => {
    exits += 1;
    throw new Error(`process.exit ${code ?? 0}`);
  }) as typeof process.exit;

  let caught = "";
  try {
    await import("../src/st-jgm.ts");
  } catch (error) {
    caught = error instanceof Error ? error.message : String(error);
  } finally {
    Bun.spawnSync = originalSpawn;
    process.exit = originalExit;
  }

  expect({ exits, spawns, caught }).toEqual({ exits: 0, spawns: [], caught: "" });
});
