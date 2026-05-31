import * as vscode from "vscode";
import {
  isScannablePath as isScannablePathCore,
  normalizeScannableExtensions,
} from "./scannableExtensionsCore";

// ── Scannable file extensions ────────────────────────────────────────────────
//
// Source of truth for "which files can VibeSec scan". Two consumers:
//   1. The Scan panel (scanProvider.ts) — used to mark non-scannable files
//      with the "not scannable" badge.
//   2. The multi-target scan walker (extension.ts) — used to skip files
//      that cannot be scanned when walking a folder/workspace.
//
// Defaults can be overridden by the user via the `vibesec.fileExtensions`
// setting. Any user-provided value replaces the default list entirely
// (we don't merge, so users can drop extensions they don't want).

/**
 * Read the `vibesec.fileExtensions` setting and return a normalized Set
 * of lowercase extensions, each prefixed with a single dot.
 *
 * Falls back to the default list when the setting is missing, empty, or
 * contains only invalid entries.
 */
export function getScannableExtensions(): Set<string> {
  const cfg = vscode.workspace.getConfiguration("vibesec");
  const raw = cfg.get<string>("fileExtensions") ?? "";
  return normalizeScannableExtensions(raw);
}

export function isScannablePath(filePath: string, exts?: Set<string>): boolean {
  return isScannablePathCore(filePath, exts ?? getScannableExtensions());
}

export function isScannableUri(uri: vscode.Uri, exts?: Set<string>): boolean {
  return isScannablePath(uri.fsPath, exts);
}
