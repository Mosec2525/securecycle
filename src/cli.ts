#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { minimatch } from "minimatch";
import { loadPolicy } from "./policy";
import { scanFile } from "./scanner";
import { IGNORED_DIR_NAMES } from "./scanProvider";
import {
  isScannablePath,
  normalizeScannableExtensions,
} from "./scannableExtensionsCore";
import { Finding, PolicyConfig } from "./types";

type OutputFormat = "text" | "json";

interface CliOptions {
  command: "scan";
  targetPath: string;
  workspaceRoot: string;
  format: OutputFormat;
  failOnFindings: boolean;
  semgrepPath: string;
  extensions: Set<string>;
}

interface ScanResult {
  ok: boolean;
  target: string;
  workspaceRoot: string;
  scannedFiles: number;
  findings: Finding[];
  policyErrors: string[];
}

const HELP = `SecureCycle CLI

Usage:
  vibesec scan [target] [options]

Options:
  --workspace <path>        Workspace root containing .vibesec.yaml (default: current directory)
  --json                    Print machine-readable JSON
  --no-fail-on-findings     Exit 0 even when findings are present
  --semgrep <path>          Semgrep binary path (default: semgrep)
  --extensions <list>       Space-separated extensions to scan
  -h, --help                Show help
  -v, --version             Show version

Docker:
  docker run --rm -v "$PWD:/workspace" mosec2525/vibesec:latest
`;

function extensionRoot(): string {
  return path.resolve(__dirname, "..");
}

function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot(), "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function die(message: string, code = 2): never {
  console.error(`SecureCycle: ${message}`);
  process.exit(code);
}

function parseArgs(argv: string[]): CliOptions | "help" | "version" {
  if (argv.includes("--help") || argv.includes("-h")) { return "help"; }
  if (argv.includes("--version") || argv.includes("-v")) { return "version"; }

  const args = [...argv];
  let command: "scan" = "scan";
  if (args[0] === "scan") {
    args.shift();
  } else if (args[0] && !args[0].startsWith("-")) {
    command = "scan";
  }

  let target = "";
  let workspace = process.cwd();
  let format: OutputFormat = "text";
  let failOnFindings = true;
  let semgrepPath = "semgrep";
  let extensionsRaw: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      format = "json";
    } else if (arg === "--no-fail-on-findings") {
      failOnFindings = false;
    } else if (arg === "--workspace") {
      workspace = args[++i] ?? die("--workspace requires a path");
    } else if (arg === "--semgrep") {
      semgrepPath = args[++i] ?? die("--semgrep requires a path");
    } else if (arg === "--extensions") {
      extensionsRaw = args[++i] ?? die("--extensions requires a space-separated list");
    } else if (arg.startsWith("-")) {
      die(`unknown option: ${arg}`);
    } else if (!target) {
      target = arg;
    } else {
      die(`unexpected argument: ${arg}`);
    }
  }

  const workspaceRoot = path.resolve(workspace);
  const targetPath = path.resolve(target || workspaceRoot);
  return {
    command,
    targetPath,
    workspaceRoot,
    format,
    failOnFindings,
    semgrepPath,
    extensions: normalizeScannableExtensions(extensionsRaw),
  };
}

function isIncludedByPolicy(filePath: string, workspaceRoot: string, policy: PolicyConfig): boolean {
  const relative = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
  if (policy.files.include.length > 0) {
    const included = policy.files.include.some((glob) =>
      minimatch(relative, glob, { dot: true, matchBase: false })
    );
    if (!included) { return false; }
  }
  return !policy.files.exclude.some((glob) =>
    minimatch(relative, glob, { dot: true, matchBase: false })
  );
}

async function expandTargetToFiles(
  targetPath: string,
  workspaceRoot: string,
  policy: PolicyConfig,
  extensions: Set<string>,
): Promise<string[]> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(targetPath);
  } catch {
    die(`target does not exist: ${targetPath}`);
  }

  if (stat.isFile()) {
    return isScannablePath(targetPath, extensions) && isIncludedByPolicy(targetPath, workspaceRoot, policy)
      ? [targetPath]
      : [];
  }
  if (!stat.isDirectory()) { return []; }

  const out: string[] = [];
  const stack = [targetPath];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) { continue; }
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith(".")) { continue; }
        stack.push(full);
      } else if (
        entry.isFile() &&
        isScannablePath(full, extensions) &&
        isIncludedByPolicy(full, workspaceRoot, policy)
      ) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function printText(result: ScanResult): void {
  console.log(`SecureCycle ${readVersion()} scan`);
  console.log(`Workspace: ${result.workspaceRoot}`);
  console.log(`Target:    ${result.target}`);
  console.log(`Files:     ${result.scannedFiles}`);
  console.log(`Findings:  ${result.findings.length}`);

  if (result.policyErrors.length > 0) {
    console.log("");
    console.log("Policy notes:");
    for (const error of result.policyErrors) {
      console.log(`- ${error}`);
    }
  }

  if (result.findings.length === 0) {
    console.log("");
    console.log("No findings.");
    return;
  }

  console.log("");
  for (const finding of result.findings) {
    const relative = path.relative(result.workspaceRoot, finding.filePath).replace(/\\/g, "/");
    console.log(
      `[${finding.severity.toUpperCase()}] ${finding.ruleId} ` +
      `${relative}:${finding.startLine + 1}:${finding.startCol + 1}`
    );
    console.log(`  ${finding.message}`);
    if (finding.taint) {
      console.log(`  taint: source L${finding.taint.source.line + 1} -> sink L${finding.taint.sink.line + 1}`);
    }
  }
}

async function runScan(options: CliOptions): Promise<ScanResult> {
  const policyResult = loadPolicy(options.workspaceRoot, extensionRoot());
  const files = await expandTargetToFiles(
    options.targetPath,
    options.workspaceRoot,
    policyResult.policy,
    options.extensions,
  );

  const findings: Finding[] = [];
  for (const filePath of files) {
    const fileFindings = await scanFile(
      filePath,
      policyResult.policy,
      extensionRoot(),
      options.semgrepPath,
    );
    findings.push(...fileFindings);
  }

  return {
    ok: policyResult.ok && findings.length === 0,
    target: options.targetPath,
    workspaceRoot: options.workspaceRoot,
    scannedFiles: files.length,
    findings,
    policyErrors: policyResult.ok ? [] : policyResult.errors,
  };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === "help") {
    console.log(HELP);
    return;
  }
  if (parsed === "version") {
    console.log(readVersion());
    return;
  }

  try {
    const result = await runScan(parsed);
    if (parsed.format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printText(result);
    }
    process.exit(result.findings.length > 0 && parsed.failOnFindings ? 1 : 0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (parsed.format === "json") {
      console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    } else {
      console.error(`SecureCycle scan failed: ${message}`);
    }
    process.exit(2);
  }
}

void main();
