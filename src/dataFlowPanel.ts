import * as vscode from "vscode";
import type { Finding, TaintLocation } from "./types";

type FlowTone = "source" | "carrier" | "guard" | "sink" | "impact";

interface FlowNode {
  id: string;
  lane: string;
  title: string;
  snippet: string;
  caption: string;
  tone: FlowTone;
  location?: TaintLocation;
}

interface DataFlowMessage {
  type: "goToLocation" | "copyText";
  absPath?: string;
  line?: number;
  text?: string;
}

export function openDataFlowPanel(
  context: vscode.ExtensionContext,
  finding: Finding,
  workspaceRoot: string | undefined,
): void {
  if (!finding.taint) {
    void vscode.window.showWarningMessage("SecureCycle: This finding does not have taint data-flow steps.");
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "securecycle.dataFlow",
    `SecureCycle Data Flow: ${attackName(finding.ruleId)}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, "media"),
      ],
    },
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "vibesec-icon.svg");
  panel.webview.html = buildHtml(panel.webview, context, finding, workspaceRoot);

  panel.webview.onDidReceiveMessage(async (msg: DataFlowMessage) => {
    if (msg.type === "copyText" && typeof msg.text === "string") {
      await vscode.env.clipboard.writeText(msg.text);
      void vscode.window.showInformationMessage("SecureCycle: Data-flow Mermaid copied.");
      return;
    }

    if (msg.type === "goToLocation" && msg.absPath && typeof msg.line === "number") {
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.absPath));
        const targetLine = Math.max(0, msg.line - 1);
        const pos = new vscode.Position(targetLine, 0);
        await vscode.window.showTextDocument(doc, {
          selection: new vscode.Range(pos, pos),
          preserveFocus: false,
          viewColumn: vscode.ViewColumn.Active,
        });
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`SecureCycle: Could not open ${msg.absPath}: ${detail}`);
      }
    }
  });
}

function buildHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  finding: Finding,
  workspaceRoot: string | undefined,
): string {
  const nonce = makeNonce();
  const nodes = buildFlowNodes(finding, workspaceRoot);
  const source = nodes.find((n) => n.tone === "source");
  const sink = nodes.find((n) => n.tone === "sink");
  const mermaid = toMermaid(nodes);
  const originLabel =
    finding.taint?.origin === "semgrep-trace" ? "Semgrep trace" : "SecureCycle inferred";
  const logoUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "vibesec-icon.svg"),
  );
  const stats = [
    { label: "Rule", value: finding.ruleId },
    { label: "CWE", value: metaValue(finding.metadata?.cwe) || "n/a" },
    { label: "OWASP", value: metaValue(finding.metadata?.owasp) || "n/a" },
    { label: "Confidence", value: metaValue(finding.metadata?.confidence) || "n/a" },
  ];
  const tops = new Map<string, number>([
    ["source", 54],
    ["carrier", 166],
    ["guard", 278],
    ["sink", 390],
    ["impact", 502],
  ]);

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    `font-src ${webview.cspSource}`,
  ].join("; ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SecureCycle Data Flow</title>
  <style>
    :root {
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Roboto", sans-serif;
      --mono: ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--font);
      background: #0a0d09;
      color: #e6e6df;
      overflow: hidden;
    }
    .app {
      --bg: #101410;
      --deep: #0a0d09;
      --surface: #171b16;
      --surface-2: #1c211a;
      --hover: #20261e;
      --border: #262c22;
      --soft: #1e231b;
      --text: #e6e6df;
      --muted: #8a8d82;
      --faint: #5a5d54;
      --accent: oklch(0.74 0.14 130);
      --accent-soft: oklch(0.74 0.14 130 / 0.14);
      --accent-border: oklch(0.74 0.14 130 / 0.34);
      --critical: #c14d4d;
      --medium: #c9a24b;
      --blue: #7fa9df;
      --violet: #b089e8;
      min-height: 100vh;
      overflow: auto;
      background:
        linear-gradient(180deg, rgba(151,213,92,0.06), transparent 240px),
        radial-gradient(circle at 26% 52%, rgba(143,188,92,0.1), transparent 360px),
        var(--deep);
    }
    .shell {
      width: min(1280px, calc(100vw - 44px));
      margin: 0 auto;
      padding: 22px 0 34px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 15px 17px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--surface) 88%, transparent);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .logo {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      flex-shrink: 0;
    }
    .kicker {
      color: var(--muted);
      font-family: var(--mono);
      font-size: 11px;
      line-height: 1.2;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 4px 0 0;
      color: var(--text);
      font-size: 23px;
      line-height: 1.15;
      letter-spacing: 0;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }
    .pill,
    .btn {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 0 11px;
      border-radius: 6px;
      border: 1px solid var(--accent-border);
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 700;
      font-size: 12px;
      white-space: nowrap;
    }
    .btn {
      cursor: pointer;
      color: var(--text);
      background: var(--surface);
      border-color: var(--border);
    }
    .btn:hover {
      border-color: var(--accent-border);
      color: var(--accent);
      background: var(--hover);
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .stat {
      min-width: 0;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: color-mix(in srgb, var(--surface) 82%, transparent);
    }
    .stat span {
      display: block;
      color: var(--muted);
      font-family: var(--mono);
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .stat strong {
      display: block;
      margin-top: 5px;
      color: var(--text);
      font-size: 12px;
      line-height: 1.35;
      word-break: break-word;
    }
    .canvas-shell {
      margin-top: 14px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 9px;
      background:
        linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255,255,255,0.025) 1px, transparent 1px),
        var(--bg);
      background-size: 38px 38px;
    }
    .map {
      position: relative;
      width: 1160px;
      height: 668px;
      margin: 0 auto;
    }
    svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    path {
      fill: none;
      stroke: #91a7ff;
      stroke-width: 2.2;
      opacity: 0.84;
      filter: drop-shadow(0 0 5px rgba(145,167,255,0.26));
    }
    .root,
    .node {
      position: absolute;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--surface-2) 88%, transparent);
      box-shadow: 0 18px 38px rgba(0,0,0,0.22);
    }
    .root {
      left: 54px;
      top: 274px;
      width: 330px;
      padding: 18px;
      border-color: color-mix(in srgb, var(--violet) 34%, var(--border));
      background: linear-gradient(135deg, rgba(176,137,232,0.2), var(--surface-2));
    }
    .root-title {
      color: var(--text);
      font-size: 18px;
      line-height: 1.24;
      font-weight: 800;
    }
    .root-rule {
      margin-top: 10px;
      color: var(--muted);
      font-family: var(--mono);
      font-size: 11px;
      line-height: 1.45;
      word-break: break-word;
    }
    .hub {
      position: absolute;
      left: 423px;
      top: 321px;
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: #49515a;
      color: #fff;
      font-weight: 800;
      z-index: 3;
      box-shadow: 0 0 0 6px rgba(145,167,255,0.08);
    }
    .node {
      all: unset;
      position: absolute;
      left: 600px;
      top: var(--top);
      width: 460px;
      min-height: 84px;
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr) auto;
      gap: 8px 14px;
      align-items: center;
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-left: 4px solid var(--accent);
      border-radius: 8px;
      background: color-mix(in srgb, var(--surface-2) 88%, transparent);
      box-shadow: 0 18px 38px rgba(0,0,0,0.22);
      cursor: pointer;
      z-index: 2;
    }
    .node:hover {
      border-color: var(--accent-border);
      background: var(--hover);
      transform: translateX(2px);
    }
    .node:focus-visible,
    .btn:focus-visible {
      outline: 2px solid var(--accent-border);
      outline-offset: 2px;
    }
    .source { border-left-color: var(--blue); }
    .carrier { border-left-color: var(--accent); }
    .guard { border-left-color: var(--medium); }
    .sink { border-left-color: var(--critical); }
    .impact { border-left-color: var(--violet); cursor: default; }
    .lane {
      color: var(--faint);
      font-family: var(--mono);
      font-size: 10px;
      line-height: 1.25;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      word-break: break-word;
    }
    .node-main { min-width: 0; }
    .node-title {
      color: var(--text);
      font-size: 18px;
      line-height: 1.18;
      font-weight: 800;
    }
    .node-snippet {
      margin-top: 6px;
      color: var(--text);
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.38;
      word-break: break-word;
    }
    .node-caption {
      margin-top: 6px;
      color: var(--muted);
      font-family: var(--mono);
      font-size: 11px;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .node-open {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: color-mix(in srgb, var(--hover) 82%, transparent);
      color: var(--text);
      font-weight: 900;
      font-size: 16px;
    }
    .lower {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      gap: 14px;
      margin-top: 14px;
    }
    .card {
      min-width: 0;
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--surface) 88%, transparent);
    }
    .card h2 {
      margin: 0;
      color: var(--text);
      font-size: 15px;
      line-height: 1.2;
    }
    .card p {
      margin: 9px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }
    pre {
      margin: 10px 0 0;
      max-height: 190px;
      overflow: auto;
      padding: 11px;
      border: 1px dashed var(--border);
      border-radius: 6px;
      background: var(--deep);
      color: var(--muted);
      font-family: var(--mono);
      font-size: 11px;
      line-height: 1.5;
      white-space: pre;
    }
    @media (max-width: 980px) {
      body { overflow: auto; }
      .shell { width: calc(100vw - 24px); padding-top: 12px; }
      header { align-items: flex-start; flex-direction: column; }
      .toolbar { justify-content: flex-start; }
      .meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .map { width: 930px; }
      .node { left: 500px; width: 370px; }
      .root { left: 34px; width: 292px; }
      .hub { left: 372px; }
      .lower { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="app">
    <div class="shell">
      <header>
        <div class="brand">
          <img class="logo" src="${logoUri}" alt="" />
          <div>
            <div class="kicker">SecureCycle Data Flow</div>
            <h1>${esc(attackName(finding.ruleId))}</h1>
          </div>
        </div>
        <div class="toolbar">
          <span class="pill">${esc(originLabel)}</span>
          ${source?.location ? jumpButton("Open source", source.location) : ""}
          ${sink?.location ? jumpButton("Open sink", sink.location) : ""}
          <button class="btn" id="copy-mermaid" type="button">Copy Mermaid</button>
        </div>
      </header>

      <section class="meta">
        ${stats.map((s) => `<div class="stat"><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`).join("")}
      </section>

      <section class="canvas-shell" aria-label="Taint data-flow graph">
        <div class="map">
          <svg viewBox="0 0 1160 668" preserveAspectRatio="none" aria-hidden="true">
            <path d="M384 316 C 492 316, 488 96, 600 96" />
            <path d="M384 326 C 492 326, 488 208, 600 208" />
            <path d="M384 334 C 500 334, 490 320, 600 320" />
            <path d="M384 342 C 492 342, 488 432, 600 432" />
            <path d="M384 352 C 492 352, 488 544, 600 544" />
          </svg>
          <div class="root">
            <div class="kicker">Tainted data path</div>
            <div class="root-title">${esc(attackName(finding.ruleId))}</div>
            <div class="root-rule">${esc(finding.ruleId)}</div>
          </div>
          <div class="hub">&lt;</div>
          ${nodes.map((node) => renderNode(node, tops.get(node.id) ?? 54)).join("")}
        </div>
      </section>

      <section class="lower">
        <div class="card">
          <h2>${esc(impactTitle(finding.ruleId))}</h2>
          <p>${esc(impactCopy(finding.ruleId))}</p>
          <p>${esc(fixStrategy(finding.ruleId))}</p>
        </div>
        <div class="card">
          <h2>Mermaid export</h2>
          <p>Use this in reports, slides, or design documents.</p>
          <pre id="mermaid">${esc(mermaid)}</pre>
        </div>
      </section>
    </div>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const mermaid = ${JSON.stringify(mermaid)};
    document.querySelectorAll("[data-jump-path]").forEach((el) => {
      el.addEventListener("click", () => {
        vscode.postMessage({
          type: "goToLocation",
          absPath: el.getAttribute("data-jump-path"),
          line: Number(el.getAttribute("data-jump-line") || "1"),
        });
      });
    });
    document.getElementById("copy-mermaid")?.addEventListener("click", () => {
      vscode.postMessage({ type: "copyText", text: mermaid });
    });
  </script>
</body>
</html>`;
}

function renderNode(node: FlowNode, top: number): string {
  const location = node.location;
  const attrs = location
    ? ` data-jump-path="${attr(location.filePath)}" data-jump-line="${location.line + 1}"`
    : "";
  const tag = location ? "button" : "div";
  return `<${tag} class="node ${node.tone}" style="--top:${top}px"${attrs}>
    <div class="lane">${esc(node.lane)}</div>
    <div class="node-main">
      <div class="node-title">${esc(node.title)}</div>
      <div class="node-snippet">${esc(node.snippet)}</div>
      <div class="node-caption">${esc(node.caption)}</div>
    </div>
    <div class="node-open">${location ? "&gt;" : "!"}</div>
  </${tag}>`;
}

function jumpButton(label: string, location: TaintLocation): string {
  return `<button class="btn" type="button" data-jump-path="${attr(location.filePath)}" data-jump-line="${location.line + 1}">${esc(label)}</button>`;
}

function buildFlowNodes(finding: Finding, workspaceRoot: string | undefined): FlowNode[] {
  const taint = finding.taint;
  if (!taint) { return []; }
  const guard = taint.intermediates.find((s) => /missing|no sanitizer|no validation|allowlist/i.test(s.snippet));
  const carriers = taint.intermediates.filter((s) => s !== guard);
  const carrier = carriers[0];

  return [
    {
      id: "source",
      lane: "Input layer",
      title: "Source",
      snippet: taint.source.snippet || "Untrusted input",
      caption: displayLocation(taint.source, workspaceRoot),
      tone: "source",
      location: taint.source,
    },
    {
      id: "carrier",
      lane: "Code flow layer",
      title: "Carrier",
      snippet: carrier?.snippet || "Tainted value is carried through local code",
      caption: carrier ? displayLocation(carrier, workspaceRoot) : "local data propagation",
      tone: "carrier",
      location: carrier ?? taint.source,
    },
    {
      id: "guard",
      lane: "Validation layer",
      title: "Missing guard",
      snippet: guard?.snippet || "No sanitizer or validation boundary was detected",
      caption: guard ? displayLocation(guard, workspaceRoot) : "policy decision point",
      tone: "guard",
      location: guard ?? taint.sink,
    },
    {
      id: "sink",
      lane: "Sink layer",
      title: "Dangerous sink",
      snippet: taint.sink.snippet || finding.message,
      caption: displayLocation(taint.sink, workspaceRoot),
      tone: "sink",
      location: taint.sink,
    },
    {
      id: "impact",
      lane: "Impact layer",
      title: impactTitle(finding.ruleId),
      snippet: impactCopy(finding.ruleId),
      caption: `${metaValue(finding.metadata?.cwe) || "CWE n/a"} | ${metaValue(finding.metadata?.owasp) || "OWASP n/a"}`,
      tone: "impact",
    },
  ];
}

function displayLocation(location: TaintLocation, workspaceRoot: string | undefined): string {
  return `${relativePosix(location.filePath, workspaceRoot)}:${location.line + 1}`;
}

function attackName(ruleId: string): string {
  if (ruleId.includes("ssrf")) { return "Server-side request forgery"; }
  if (ruleId.includes("path-traversal")) { return "Path traversal exploit path"; }
  if (ruleId.includes("command-injection")) { return "Command execution exploit path"; }
  if (ruleId.includes("sql-injection")) { return "SQL injection exploit path"; }
  if (ruleId.includes("xss")) { return "Cross-site scripting exploit path"; }
  return "Tainted data exploit path";
}

function impactTitle(ruleId: string): string {
  if (ruleId.includes("ssrf")) { return "SSRF impact"; }
  if (ruleId.includes("path-traversal")) { return "Filesystem exposure"; }
  if (ruleId.includes("command-injection")) { return "Remote command execution"; }
  if (ruleId.includes("sql-injection")) { return "Database compromise"; }
  if (ruleId.includes("xss")) { return "Client-side script execution"; }
  return "Security boundary bypass";
}

function impactCopy(ruleId: string): string {
  if (ruleId.includes("ssrf")) {
    return "Attacker-controlled URLs can force the server to call internal, loopback, or metadata-service endpoints.";
  }
  if (ruleId.includes("path-traversal")) {
    return "Attacker-controlled paths can escape the intended directory and read sensitive local files.";
  }
  if (ruleId.includes("command-injection")) {
    return "Attacker-controlled input can reach shell execution and run unintended system commands.";
  }
  if (ruleId.includes("sql-injection")) {
    return "Attacker-controlled input can alter query structure and access or modify database records.";
  }
  if (ruleId.includes("xss")) {
    return "Attacker-controlled input can be rendered as executable script in a user browser.";
  }
  return "Untrusted input crosses into a sensitive operation without an obvious validation boundary.";
}

function fixStrategy(ruleId: string): string {
  if (ruleId.includes("ssrf")) {
    return "Fix strategy: parse the URL, enforce an allowlist, resolve hostnames safely, and reject private, loopback, link-local, and metadata-service addresses before making the request.";
  }
  if (ruleId.includes("path-traversal")) {
    return "Fix strategy: normalize the requested path, join it to a trusted base directory, resolve the final path, and reject anything that escapes the base directory.";
  }
  if (ruleId.includes("command-injection")) {
    return "Fix strategy: avoid shell execution, use an explicit command allowlist, and pass arguments as an array instead of a shell string.";
  }
  if (ruleId.includes("sql-injection")) {
    return "Fix strategy: use parameterized queries or safe ORM APIs and keep untrusted input out of SQL syntax.";
  }
  if (ruleId.includes("xss")) {
    return "Fix strategy: encode output for the destination context and avoid rendering untrusted HTML or script-capable content.";
  }
  return "Fix strategy: place a clear validation or sanitization boundary before the sensitive operation.";
}

function toMermaid(nodes: FlowNode[]): string {
  const label = (node: FlowNode): string =>
    `${node.title}: ${node.snippet}`.replace(/["\n\r]/g, " ").slice(0, 84);
  return [
    "flowchart LR",
    ...nodes.map((node) => `  ${node.id}["${label(node)}"]`),
    "  source --> carrier --> guard --> sink --> impact",
  ].join("\n");
}

function metaValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string").join(", ");
  }
  return typeof value === "string" ? value : "";
}

function relativePosix(absPath: string, workspaceRoot: string | undefined): string {
  if (!workspaceRoot) { return absPath.replace(/\\/g, "/"); }
  const abs = absPath.replace(/\\/g, "/");
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  if (abs === root) { return "."; }
  if (abs.startsWith(root + "/")) { return abs.slice(root.length + 1); }
  return abs;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value: string): string {
  return esc(value).replace(/`/g, "&#96;");
}

function makeNonce(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 32; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
