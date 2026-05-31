import * as path from "path";

// Source of truth for "which files can VibeSec scan" outside VS Code.
export const DEFAULT_SCANNABLE_EXTENSIONS: readonly string[] = [
  ".py",  ".pyi",
  ".js",  ".jsx",  ".mjs",  ".cjs",
  ".ts",  ".tsx",
  ".java",
  ".go",
  ".rb",
  ".php",
  ".c",   ".h",    ".cpp",  ".hpp",   ".cc",
  ".cs",
  ".rs",
  ".swift",
  ".kt",  ".kts",
  ".scala",
  ".yaml", ".yml",
  ".json",
  ".html", ".htm",
  ".sh",  ".bash",
];

export function getDefaultScannableExtensions(): string[] {
  return [...DEFAULT_SCANNABLE_EXTENSIONS];
}

export function normalizeScannableExtensions(raw: string | string[] | undefined): Set<string> {
  const tokens = Array.isArray(raw)
    ? raw
    : raw && raw.trim() !== ""
      ? raw.trim().split(/\s+/)
      : DEFAULT_SCANNABLE_EXTENSIONS;

  const set = new Set<string>();
  for (const entry of tokens) {
    if (typeof entry !== "string") { continue; }
    const trimmed = entry.trim().toLowerCase();
    if (trimmed === "") { continue; }
    set.add(trimmed.startsWith(".") ? trimmed : `.${trimmed}`);
  }

  if (set.size === 0) {
    for (const ext of DEFAULT_SCANNABLE_EXTENSIONS) { set.add(ext); }
  }
  return set;
}

export function isScannablePath(filePath: string, exts: Set<string>): boolean {
  return exts.has(path.extname(filePath).toLowerCase());
}
