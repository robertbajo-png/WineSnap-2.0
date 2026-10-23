import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";

const directory = "/tmp/winesnap-ai";
const path = `${directory}/credentials.json`;
const temporary = `${directory}/credentials.pending`;
const project = "pzniyupmgwvlldvztzqh";
const checkOnly = process.argv.includes("--check");
try {
  if (
    process.env.WINESNAP_LOCAL_AI_ENABLED !== "true" ||
    process.env.SUPABASE_URL !== `https://${project}.supabase.co` ||
    process.getuid() === 0
  )
    throw new Error();
  if (!checkOnly) {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 16_384) throw new Error();
    }
    const value = JSON.parse(input);
    if (
      value.version !== 1 ||
      value.project !== project ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(value.publishable ?? "") ||
      !/^sb_secret_[A-Za-z0-9_-]+$/.test(value.secret ?? "") ||
      !/^sk-[A-Za-z0-9_-]{20,4093}$/.test(value.openai ?? "") ||
      (value.gemini !== undefined && !/^[A-Za-z0-9_-]{20,4096}$/.test(value.gemini)) ||
      Object.keys(value)
        .filter((key) => key !== "gemini")
        .sort()
        .join(",") !== "openai,project,publishable,secret,version"
    )
      throw new Error();
    await mkdir(directory, { mode: 0o700, recursive: true });
    const stat = await lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid() ||
      stat.mode & 0o077
    )
      throw new Error();
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
    input = "";
  }
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || stat.mode & 0o077)
    throw new Error();
  const stored = JSON.parse(await readFile(path, "utf8"));
  if (stored.project !== project || !stored.openai || !stored.secret || !stored.publishable)
    throw new Error();
  console.log(
    JSON.stringify({
      configured: true,
      project,
      provider: "OpenAI",
      model: "gpt-6.1-sol",
      geminiConfigured: Boolean(stored.gemini),
    }),
  );
} catch {
  console.error("Local test AI credential configuration failed. No key values reported.");
  process.exitCode = 1;
} finally {
  if (!checkOnly) await unlink(temporary).catch(() => {});
}
