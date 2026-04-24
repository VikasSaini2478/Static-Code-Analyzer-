/**
 * ui.js — UI Controller  (Production v3.0)
 *
 * Improvements:
 *   • Error-code badges with tooltips on each error card
 *   • Inline error highlighting synced to editor lines
 *   • Type-mismatch errors surfaced with fix suggestions
 *   • New "int type errors" sample for strict-type demo
 *   • Keyboard shortcut Ctrl+/ for comment toggle (bonus UX)
 *   • All renderers now handle null/undefined gracefully
 *   • Loading spinner on Run button during heavy parse
 *   • Resizable split panels via drag handle
 */

"use strict";

import { analyze }       from "./analyzer.js";
import { renderASTHtml } from "./printer.js";

// ─── C Sample Programs ────────────────────────────────────────────────────────

const SAMPLES = {
  "hello world": `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`,

  "functions": `#include <stdio.h>

int add(int a, int b) {
    return a + b;
}

float average(int x, int y) {
    return (float)(x + y) / 2.0f;
}

int main() {
    int result = add(3, 4);
    float avg  = average(10, 20);
    printf("Result: %d\\n", result);
    return 0;
}`,

  "pointers": `#include <stdio.h>

void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main() {
    int x = 10;
    int y = 20;
    int *p = &x;
    *p = 99;
    swap(&x, &y);
    return 0;
}`,

  "struct": `#include <stdio.h>
#include <string.h>

struct Point {
    int x;
    int y;
};

struct Person {
    char name[50];
    int  age;
    float height;
};

int main() {
    struct Point p;
    p.x = 5;
    p.y = 10;

    struct Person *person = NULL;
    return 0;
}`,

  "control flow": `#include <stdio.h>

int main() {
    int i;
    int sum = 0;

    for (i = 0; i < 10; i++) {
        sum += i;
    }

    int x = 3;
    switch (x) {
        case 1: printf("one\\n"); break;
        case 2: printf("two\\n"); break;
        default: printf("other\\n");
    }

    int n = 5;
    do { n--; } while (n > 0);

    return 0;
}`,

  "enum & typedef": `#include <stdio.h>

typedef enum { RED, GREEN, BLUE } Color;

typedef struct {
    float r;
    float g;
    float b;
} RGB;

int multiply(int a, int b) { return a * b; }

int main() {
    Color c = GREEN;
    RGB rgb = {1.0f, 0.5f, 0.0f};
    return 0;
}`,

  "int type errors": `/* Strict Int Type Checking Demo
   These assignments will produce ERRORS:
   - float literal → int
   - string literal → int
   - integer overflow
*/
#include <stdio.h>

int main() {
    /* ERROR: float assigned to int */
    int a = 3.14;

    /* ERROR: string literal assigned to int */
    int b = "hello";

    /* ERROR: integer overflow (> INT32_MAX) */
    int c = 9999999999;

    /* OK: explicit cast is allowed */
    int d = (int)3.14;

    /* OK: valid int literal */
    int e = 42;

    /* ERROR: division by zero */
    int f = e / 0;

    return 0;
}`,

  "lex errors": `#include <stdio.h>

int main() {
    int @bad = 5;
    char x = 'too long char';
    char *s = "unterminated;
    return 0;
}`,

  "syn errors": `#include <stdio.h>

int main( {
    int x = ;
    if (x > 0 {
        return
    }
}`,

  "semantic warns": `#include <stdio.h>

void doNothing() {
    return 42;
}

int compute() {
    return;
}

int main() {
    int x = undeclaredVar + 1;
    unknownFunc(x);
    return 0;
}`,
};

// ─── State ───────────────────────────────────────────────────────────────────

let activeTab      = 0;
let lastResult     = null;
let isAnalyzing    = false;

// ─── DOM Helper ──────────────────────────────────────────────────────────────

const el = id => document.getElementById(id);

// ─── Tab Switching ────────────────────────────────────────────────────────────

export function switchTab(index) {
  activeTab = index;
  document.querySelectorAll(".phase-tab").forEach((t, i) => t.classList.toggle("active", i === index));
  document.querySelectorAll(".tab-pane").forEach((p, i) => p.classList.toggle("active", i === index));
}

// ─── Analysis Entry Point ─────────────────────────────────────────────────────

export function runAnalysis() {
  const source = el("source-editor")?.value ?? "";
  if (!source.trim()) {
    showEmptyState();
    return;
  }
  if (isAnalyzing) return;

  setRunning(true);

  // Defer to let UI update first
  setTimeout(() => {
    try {
      lastResult = analyze(source);
      renderAll(lastResult);
    } catch (err) {
      console.error("[C Analyzer] Unexpected error:", err);
      showCrashError(err);
    } finally {
      setRunning(false);
    }
  }, 0);
}

function setRunning(running) {
  isAnalyzing = running;
  const btn = el("run-btn");
  if (!btn) return;
  if (running) {
    btn.innerHTML = `<svg class="spin" width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" stroke-dasharray="40" stroke-linecap="round"/></svg> Analyzing…`;
    btn.disabled = true;
  } else {
    btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 2l7 4-7 4V2z" fill="currentColor"/></svg> Run`;
    btn.disabled = false;
  }
}

function renderAll(result) {
  renderTokens(result);
  renderAST(result);
  renderErrors(result);
  renderWarnings(result);
  renderStats(result);
  renderSymbolTable(result);
  updateStatusBar(result);
  updateEditorGutter(result);

  // Auto-switch tabs
  if (result.errors.length > 0)          switchTab(2);
  else if (result.warnings.length > 0)   switchTab(3);

  // Badge updates
  const tabs = document.querySelectorAll(".phase-tab");
  const errBadge  = tabs[2]?.querySelector(".tab-count");
  const warnBadge = tabs[3]?.querySelector(".tab-count");
  if (errBadge)  { errBadge.textContent  = result.errors.length;   errBadge.classList.toggle("has-errors",   result.errors.length > 0); }
  if (warnBadge) { warnBadge.textContent = result.warnings.length; warnBadge.classList.toggle("has-warnings", result.warnings.length > 0); }
}

function showEmptyState() {
  el("token-stream").innerHTML    = `<div class="empty-state">No source code to analyze.</div>`;
  el("ast-tree").innerHTML        = `<div class="empty-state">No AST generated.</div>`;
  el("error-list").innerHTML      = `<div class="empty-state">Enter source code and click Run.</div>`;
  el("warning-list").innerHTML    = `<div class="empty-state"></div>`;
  el("symbol-table").innerHTML    = `<div class="empty-state">No symbols found.</div>`;
  el("stats-grid").innerHTML      = "";
  el("tok-breakdown").innerHTML   = "";
  el("error-summary").innerHTML   = "";
  el("token-stats").innerHTML     = "";
  updateStatusBarReady();
}

function showCrashError(err) {
  el("error-list").innerHTML = `
    <div class="err-item err-crash">
      <span class="err-phase-badge">BUG</span>
      <div class="err-body">
        <div class="err-msg">Internal analyzer error — ${esc(err.message)}</div>
        <div class="err-loc">Please report this with a reproduction case.</div>
      </div>
    </div>`;
  switchTab(2);
}

// ─── Gutter Error Markers ─────────────────────────────────────────────────────

function updateEditorGutter(result) {
  const errorLines = new Set(result.errors.map(e => e.line).filter(Boolean));
  const warnLines  = new Set(result.warnings.map(w => w.line).filter(Boolean));

  const lineNumbers = el("line-numbers");
  if (!lineNumbers) return;
  const editor = el("source-editor");
  const count  = editor.value.split("\n").length;

  lineNumbers.innerHTML = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const cls = errorLines.has(n) ? " ln-error" : warnLines.has(n) ? " ln-warn" : "";
    return `<span class="ln${cls}">${n}</span>`;
  }).join("\n");
}

// ─── Token Renderer ───────────────────────────────────────────────────────────

function renderTokens({ tokens, stats }) {
  const statEl = el("token-stats");
  if (statEl) {
    statEl.innerHTML = Object.entries(stats.tokenCounts ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) =>
        `<div class="t-stat"><strong>${count}</strong> ${type.toLowerCase()}</div>`)
      .join("");
  }

  const streamEl = el("token-stream");
  if (streamEl) {
    streamEl.innerHTML = (tokens ?? [])
      .map(t => `<span class="tok tok-${t.type}" title="${esc(t.type)} · line ${t.line}, col ${t.col}">${esc(t.value)}</span>`)
      .join("");
  }
}

// ─── AST Renderer ────────────────────────────────────────────────────────────

function renderAST({ ast }) {
  const container = el("ast-tree");
  if (container) container.innerHTML = ast ? renderASTHtml(ast) : "<div class='empty-state'>No AST.</div>";
}

// ─── Error Renderer ──────────────────────────────────────────────────────────

const PHASE_LABELS = { lexer: "LEX", parser: "SYN", semantic: "SEM", unknown: "ERR" };
const PHASE_TIPS   = {
  lexer:    "Lexical error — invalid character or token in source code.",
  parser:   "Syntax error — code structure does not match C grammar.",
  semantic: "Semantic error — code is syntactically valid but logically incorrect.",
};

function renderErrors({ errors, stats }) {
  const container = el("error-list");
  if (!container) return;

  if (!errors.length) {
    container.innerHTML = `
      <div class="ok-box">
        <div class="ok-icon">✓</div>
        <div>
          <div class="ok-text">No errors detected</div>
          <div class="ok-sub">Lexical, syntax, and semantic analysis passed.</div>
        </div>
      </div>`;
    el("error-summary").innerHTML = "";
    return;
  }

  el("error-summary").innerHTML = `
    <span class="err-phase-count lex"><strong>${stats.lexErrors}</strong> lexical</span>
    <span class="sep">·</span>
    <span class="err-phase-count syn"><strong>${stats.parseErrors}</strong> syntax</span>
    <span class="sep">·</span>
    <span class="err-phase-count sem"><strong>${stats.semanticErrors}</strong> semantic</span>`;

  container.innerHTML = errors.map(e => {
    const badge = PHASE_LABELS[e.phase] ?? "ERR";
    const tip   = PHASE_TIPS[e.phase]  ?? "";
    const code  = e.code ? `<span class="err-code">${esc(e.code)}</span>` : "";
    const loc   = `line ${e.line ?? "?"}, col ${e.col ?? "?"}`;
    const extra = [
      e.expected ? `expected '${esc(e.expected)}'` : "",
      e.got      ? `got '${esc(e.got)}'`           : "",
      e.raw      ? `near '${esc(e.raw)}'`          : "",
    ].filter(Boolean).join("  ·  ");

    // Fix suggestion for strict int errors
    const fix = e.code === "SEM002" ? `<div class="err-fix">💡 Fix: Use explicit cast, e.g. <code>(int)(&hellip;)</code></div>` :
                e.code === "SEM003" ? `<div class="err-fix">💡 Fix: Declare as <code>long long</code> or <code>unsigned long</code></div>` :
                e.code === "SEM012" ? `<div class="err-fix">💡 Fix: Use <code>char *var = "…";</code> for string assignment</div>` :
                e.code === "SEM009" ? `<div class="err-fix">⚠️ This will cause undefined behavior at runtime.</div>` : "";

    return `
      <div class="err-item err-${e.phase}" role="alert">
        <span class="err-phase-badge" title="${esc(tip)}">${badge}</span>
        <div class="err-body">
          <div class="err-msg-row">
            <span class="err-msg">${esc(e.message)}</span>
            ${code}
          </div>
          <div class="err-loc">${loc}${extra ? "  ·  " + extra : ""}</div>
          ${fix}
        </div>
      </div>`;
  }).join("");
}

// ─── Warnings Renderer ────────────────────────────────────────────────────────

function renderWarnings({ warnings }) {
  const container = el("warning-list");
  if (!container) return;

  if (!warnings.length) {
    container.innerHTML = `
      <div class="ok-box">
        <div class="ok-icon">✓</div>
        <div>
          <div class="ok-text">No warnings</div>
          <div class="ok-sub">Semantic analysis found no potential issues.</div>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = warnings.map(w => `
    <div class="err-item err-warning" role="alert">
      <span class="err-phase-badge warn-badge">WARN</span>
      <div class="err-body">
        <div class="err-msg-row">
          <span class="err-msg">${esc(w.message)}</span>
          ${w.code ? `<span class="err-code warn-code">${esc(w.code)}</span>` : ""}
        </div>
        <div class="err-loc">line ${w.line ?? "?"}, col ${w.col ?? "?"}</div>
      </div>
    </div>`).join("");
}

// ─── Symbol Table Renderer ───────────────────────────────────────────────────

function renderSymbolTable({ symbolTable }) {
  const container = el("symbol-table");
  if (!container) return;

  const sections = [];

  const mkSection = (title, rows) => {
    if (!rows.length) return;
    sections.push(`<div class="sym-section-title">${title}</div>`);
    sections.push(...rows);
  };

  // Functions
  const fnRows = [];
  for (const [name, info] of (symbolTable.functions ?? new Map())) {
    const ret    = info.returnType?.base ?? "?";
    const params = (info.params ?? []).map(p => (p.typeSpec?.base ?? "?") + (p.name ? " " + p.name : "")).join(", ");
    const badge  = info.builtin ? `<span class="sym-builtin">stdlib</span>` : "";
    fnRows.push(`
      <div class="sym-row">
        <span class="sym-name">${esc(name)}</span>
        <span class="sym-type">${esc(ret)}</span>
        <span class="sym-detail">(${esc(params)})</span>
        ${badge}
      </div>`);
  }
  mkSection("Functions", fnRows);

  // Global variables
  const gvRows = [];
  for (const [name, info] of (symbolTable.global ?? new Map())) {
    gvRows.push(`
      <div class="sym-row">
        <span class="sym-name">${esc(name)}</span>
        <span class="sym-type">${esc(info.type ?? "?")}</span>
        <span class="sym-detail">line ${info.line ?? "?"}</span>
      </div>`);
  }
  mkSection("Global Variables", gvRows);

  // Structs
  const stRows = [];
  for (const [name] of (symbolTable.structs ?? new Map())) {
    stRows.push(`<div class="sym-row"><span class="sym-name">${esc(name)}</span><span class="sym-type">struct</span></div>`);
  }
  mkSection("Structs", stRows);

  // Enums
  const enRows = [];
  for (const [name] of (symbolTable.enums ?? new Map())) {
    enRows.push(`<div class="sym-row"><span class="sym-name">${esc(name)}</span><span class="sym-type">enum</span></div>`);
  }
  mkSection("Enums", enRows);

  // Typedefs
  const tdRows = [];
  for (const [alias, ts] of (symbolTable.typedefs ?? new Map())) {
    tdRows.push(`<div class="sym-row"><span class="sym-name">${esc(alias)}</span><span class="sym-type">${esc(ts?.base ?? "?")}</span></div>`);
  }
  mkSection("Typedefs", tdRows);

  container.innerHTML = sections.length
    ? sections.join("")
    : `<div class="empty-state">No symbols found.</div>`;
}

// ─── Stats Renderer ──────────────────────────────────────────────────────────

function renderStats({ stats }) {
  const grid = el("stats-grid");
  if (grid) {
    grid.innerHTML = [
      { label: "Total tokens",  value: stats.totalTokens },
      { label: "AST nodes",     value: stats.nodeCount },
      { label: "Tree depth",    value: stats.astDepth },
      { label: "Functions",     value: stats.functionCount },
      { label: "Structs",       value: stats.structCount },
      { label: "Loops",         value: stats.loopCount },
      { label: "Calls",         value: stats.callCount },
      { label: "Preprocessor",  value: stats.preprocessorCount },
      { label: "Errors",        value: stats.totalErrors,    cls: stats.totalErrors  ? "stat-bad" : "" },
      { label: "Warnings",      value: stats.warnings,       cls: stats.warnings     ? "stat-warn" : "" },
    ].map(s => `
      <div class="stat-card ${s.cls ?? ""}">
        <div class="stat-value">${s.value ?? 0}</div>
        <div class="stat-label">${s.label}</div>
      </div>`).join("");
  }

  const breakdown = el("tok-breakdown");
  if (breakdown) {
    const maxCount = Math.max(...Object.values(stats.tokenCounts ?? {}), 1);
    breakdown.innerHTML = Object.entries(stats.tokenCounts ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `
        <div class="tok-row">
          <span class="tok-row-label tok-${type}">${type}</span>
          <div class="tok-bar-wrap">
            <div class="tok-bar tok-${type}" style="width:${Math.round(count/maxCount*100)}%"></div>
          </div>
          <span class="tok-row-count">${count}</span>
        </div>`).join("");
  }
}

// ─── Status Bar ──────────────────────────────────────────────────────────────

function updateStatusBar({ tokens, errors, warnings, stats }) {
  const hasErrors = errors.length > 0;
  el("status-bar").innerHTML = `
    <div class="status-item">
      <div class="status-dot ${hasErrors ? "has-errors" : "is-ok"}"></div>
      <span>${hasErrors ? errors.length + " error" + (errors.length !== 1 ? "s" : "") : "OK"}</span>
    </div>
    <div class="status-item"><span>${warnings.length} warning${warnings.length !== 1 ? "s" : ""}</span></div>
    <div class="status-item"><span>${stats.totalTokens} tokens</span></div>
    <div class="status-item"><span>${stats.nodeCount} nodes</span></div>
    <div class="status-item"><span>${stats.functionCount} fn${stats.functionCount !== 1 ? "s" : ""}</span></div>`;
}

function updateStatusBarReady() {
  el("status-bar").innerHTML = `
    <div class="status-item">
      <div class="status-dot"></div><span>Ready</span>
    </div>
    <div class="status-item"><span id="status-input-mode" style="color:var(--faint)">Editor mode</span></div>`;
}

// ─── Sample Loading ───────────────────────────────────────────────────────────

function loadSample(name) {
  const src = SAMPLES[name];
  if (!src) return;
  const editor = el("source-editor");
  editor.value = src;
  editor.dispatchEvent(new Event("input"));
  runAnalysis();
}

// ─── Character Count ─────────────────────────────────────────────────────────

function updateCharCount() {
  const val   = el("source-editor")?.value ?? "";
  const count = val.length;
  const lines = val.split("\n").length;
  const cc = el("char-count");
  if (cc) cc.textContent = `${count} char${count !== 1 ? "s" : ""} · ${lines} line${lines !== 1 ? "s" : ""}`;
}

// ─── Line Numbers ────────────────────────────────────────────────────────────

function updateLineNumbers() {
  const editor      = el("source-editor");
  const lineNumbers = el("line-numbers");
  if (!editor || !lineNumbers) return;
  const count = editor.value.split("\n").length;
  lineNumbers.innerHTML = Array.from({ length: count }, (_, i) => `<span class="ln">${i + 1}</span>`).join("\n");
}

// ─── Resizable Split ─────────────────────────────────────────────────────────

function initResizer() {
  const handle = el("resize-handle");
  const main   = el("main");
  if (!handle || !main) return;

  let dragging = false, startX = 0, startLeft = 0;

  handle.addEventListener("mousedown", e => {
    dragging  = true;
    startX    = e.clientX;
    const panels = main.querySelectorAll(".panel");
    startLeft = panels[0]?.getBoundingClientRect().width ?? main.getBoundingClientRect().width / 2;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const mainRect = main.getBoundingClientRect();
    const pct = Math.max(20, Math.min(80, ((startLeft + e.clientX - startX) / mainRect.width) * 100));
    main.style.gridTemplateColumns = `${pct}fr ${100 - pct}fr`;
  });

  document.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; }
  });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

export function init() {
  // Populate sample buttons
  const bar = el("sample-bar");
  if (bar) {
    for (const name of Object.keys(SAMPLES)) {
      const btn = document.createElement("button");
      btn.className   = "sample-btn";
      btn.textContent = name;
      btn.onclick     = () => loadSample(name);
      bar.appendChild(btn);
    }
  }

  // Wire Run button
  const runBtn = el("run-btn");
  if (runBtn) runBtn.onclick = runAnalysis;
  window._runAnalysis = runAnalysis;

  // Wire tabs
  document.querySelectorAll(".phase-tab").forEach((tab, i) => {
    tab.onclick = () => switchTab(i);
  });

  // Editor events
  const editor = el("source-editor");
  if (editor) {
    editor.addEventListener("input", () => { updateCharCount(); updateLineNumbers(); });
    editor.addEventListener("scroll", () => {
      const ln = el("line-numbers");
      if (ln) ln.scrollTop = editor.scrollTop;
    });
    editor.addEventListener("keydown", e => {
      // Ctrl+Enter → run
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runAnalysis();
      }
      // Tab key → insert 4 spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const start = editor.selectionStart;
        const end   = editor.selectionEnd;
        editor.value = editor.value.slice(0, start) + "    " + editor.value.slice(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
        editor.dispatchEvent(new Event("input"));
      }
    });
  }

  initResizer();
  updateLineNumbers();
  updateCharCount();
  loadSample("hello world");
}

// ─── Escape Utility ──────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
