/**
 * ui.js — UI Controller (C Language Edition)
 *
 * Renders tokens, AST, errors, warnings, stats, and symbol table.
 * All sample programs are now valid/invalid C code.
 */

"use strict";

import { analyze }       from "./analyzer.js";
import { renderASTHtml } from "./printer.js";

// ─── C Sample programs ────────────────────────────────────────────────────────

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
        case 1:
            printf("one\\n");
            break;
        case 2:
            printf("two\\n");
            break;
        default:
            printf("other\\n");
    }

    int n = 5;
    do {
        n--;
    } while (n > 0);

    return 0;
}`,

  "enum & typedef": `#include <stdio.h>

typedef enum {
    RED,
    GREEN,
    BLUE
} Color;

typedef struct {
    float r;
    float g;
    float b;
} RGB;

typedef int (*MathFunc)(int, int);

int multiply(int a, int b) {
    return a * b;
}

int main() {
    Color c = GREEN;
    RGB rgb = {1.0f, 0.5f, 0.0f};
    MathFunc fn = multiply;
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

let activeTab = 0;

// ─── DOM refs ────────────────────────────────────────────────────────────────

const el = id => document.getElementById(id);

// ─── Tab switching ────────────────────────────────────────────────────────────

export function switchTab(index) {
  activeTab = index;
  document.querySelectorAll(".phase-tab").forEach((t, i) => t.classList.toggle("active", i === index));
  document.querySelectorAll(".tab-pane").forEach((p, i) => p.classList.toggle("active", i === index));
}

// ─── Run analysis ─────────────────────────────────────────────────────────────

export function runAnalysis() {
  const source = el("source-editor").value;
  if (!source.trim()) return;

  const result = analyze(source);
  renderTokens(result);
  renderAST(result);
  renderErrors(result);
  renderWarnings(result);
  renderStats(result);
  renderSymbolTable(result);
  updateStatusBar(result);

  // Auto-switch to errors tab if there are errors
  if (result.errors.length > 0 && activeTab !== 2) switchTab(2);
  // Auto-switch to warnings if no errors but warnings exist
  else if (result.warnings.length > 0 && activeTab !== 3) switchTab(3);

  // Update badges
  const tabs = document.querySelectorAll(".phase-tab");
  const errBadge  = tabs[2]?.querySelector(".tab-count");
  const warnBadge = tabs[3]?.querySelector(".tab-count");
  if (errBadge)  { errBadge.textContent  = result.errors.length;   errBadge.classList.toggle("has-errors",   result.errors.length > 0); }
  if (warnBadge) { warnBadge.textContent = result.warnings.length; warnBadge.classList.toggle("has-warnings", result.warnings.length > 0); }
}

// ─── Token renderer ───────────────────────────────────────────────────────────

function renderTokens({ tokens, stats }) {
  el("token-stats").innerHTML = Object.entries(stats.tokenCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) =>
      `<div class="t-stat"><strong>${count}</strong>${type.toLowerCase()}</div>`)
    .join("");

  el("token-stream").innerHTML = tokens
    .map(t => `<span class="tok tok-${t.type}" title="line ${t.line}, col ${t.col} · ${t.type}">${esc(t.value)}</span>`)
    .join("");
}

// ─── AST renderer ────────────────────────────────────────────────────────────

function renderAST({ ast }) {
  el("ast-tree").innerHTML = renderASTHtml(ast);
}

// ─── Error renderer ──────────────────────────────────────────────────────────

function renderErrors({ errors, stats }) {
  const container = el("error-list");

  if (errors.length === 0) {
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
    <span style="color:var(--faint)">·</span>
    <span class="err-phase-count syn"><strong>${stats.parseErrors}</strong> syntax</span>
    <span style="color:var(--faint)">·</span>
    <span class="err-phase-count sem"><strong>${stats.semanticErrors}</strong> semantic</span>`;

  container.innerHTML = errors.map(e => `
    <div class="err-item err-${e.phase}">
      <span class="err-phase-badge">${
        e.phase === "lexer" ? "LEX" : e.phase === "parser" ? "SYN" : "SEM"
      }</span>
      <div class="err-body">
        <div class="err-msg">${esc(e.message)}</div>
        <div class="err-loc">line ${e.line ?? "?"}, col ${e.col ?? "?"}
          ${e.expected ? ` · expected '${esc(e.expected)}'` : ""}
          ${e.got      ? ` · got '${esc(e.got)}'`           : ""}
          ${e.raw      ? ` · raw '${esc(e.raw)}'`           : ""}
        </div>
      </div>
    </div>`).join("");
}

// ─── Warnings renderer ───────────────────────────────────────────────────────

function renderWarnings({ warnings }) {
  const container = el("warning-list");
  if (!container) return;

  if (warnings.length === 0) {
    container.innerHTML = `
      <div class="ok-box">
        <div class="ok-icon">✓</div>
        <div>
          <div class="ok-text">No warnings</div>
          <div class="ok-sub">Semantic analysis found no issues.</div>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = warnings.map(w => `
    <div class="err-item err-warning">
      <span class="err-phase-badge warn-badge">WARN</span>
      <div class="err-body">
        <div class="err-msg">${esc(w.message)}</div>
        <div class="err-loc">line ${w.line ?? "?"}, col ${w.col ?? "?"}</div>
      </div>
    </div>`).join("");
}

// ─── Symbol table renderer ────────────────────────────────────────────────────

function renderSymbolTable({ symbolTable }) {
  const container = el("symbol-table");
  if (!container) return;

  const sections = [];

  // Functions
  if (symbolTable.functions.size > 0) {
    sections.push(`<div class="sym-section-title">Functions</div>`);
    for (const [name, info] of symbolTable.functions) {
      const ret    = info.returnType?.base ?? "?";
      const params = info.params?.map(p => (p.typeSpec?.base ?? "?") + (p.name ? " " + p.name : "")).join(", ") ?? "";
      sections.push(`
        <div class="sym-row">
          <span class="sym-name">${esc(name)}</span>
          <span class="sym-type">${esc(ret)}</span>
          <span class="sym-detail">(${esc(params)})</span>
        </div>`);
    }
  }

  // Global variables
  if (symbolTable.global.size > 0) {
    sections.push(`<div class="sym-section-title" style="margin-top:14px">Global variables</div>`);
    for (const [name, info] of symbolTable.global) {
      sections.push(`
        <div class="sym-row">
          <span class="sym-name">${esc(name)}</span>
          <span class="sym-type">${esc(info.type ?? "?")}</span>
          <span class="sym-detail">line ${info.line ?? "?"}</span>
        </div>`);
    }
  }

  // Structs
  if (symbolTable.structs.size > 0) {
    sections.push(`<div class="sym-section-title" style="margin-top:14px">Structs</div>`);
    for (const [name] of symbolTable.structs) {
      sections.push(`<div class="sym-row"><span class="sym-name">${esc(name)}</span><span class="sym-type">struct</span></div>`);
    }
  }

  // Enums
  if (symbolTable.enums.size > 0) {
    sections.push(`<div class="sym-section-title" style="margin-top:14px">Enums</div>`);
    for (const [name] of symbolTable.enums) {
      sections.push(`<div class="sym-row"><span class="sym-name">${esc(name)}</span><span class="sym-type">enum</span></div>`);
    }
  }

  // Typedefs
  if (symbolTable.typedefs.size > 0) {
    sections.push(`<div class="sym-section-title" style="margin-top:14px">Typedefs</div>`);
    for (const [alias, ts] of symbolTable.typedefs) {
      sections.push(`<div class="sym-row"><span class="sym-name">${esc(alias)}</span><span class="sym-type">${esc(ts?.base ?? "?")}</span></div>`);
    }
  }

  container.innerHTML = sections.length > 0
    ? sections.join("")
    : `<div style="color:var(--muted);font-size:12px">No symbols found.</div>`;
}

// ─── Stats renderer ──────────────────────────────────────────────────────────

function renderStats({ stats }) {
  el("stats-grid").innerHTML = [
    { label: "Total tokens",  value: stats.totalTokens },
    { label: "AST nodes",     value: stats.nodeCount },
    { label: "Tree depth",    value: stats.astDepth },
    { label: "Functions",     value: stats.functionCount },
    { label: "Structs",       value: stats.structCount },
    { label: "Preprocessor",  value: stats.preprocessorCount },
    { label: "Lex errors",    value: stats.lexErrors },
    { label: "Syn errors",    value: stats.parseErrors },
    { label: "Sem errors",    value: stats.semanticErrors },
    { label: "Warnings",      value: stats.warnings },
  ].map(s => `
    <div class="stat-card">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.value}</div>
    </div>`).join("");

  const maxCount = Math.max(...Object.values(stats.tokenCounts), 1);
  el("tok-breakdown").innerHTML = Object.entries(stats.tokenCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `
      <div class="tok-row">
        <span class="tok-row-label tok-${type}">${type}</span>
        <div class="tok-bar-wrap">
          <div class="tok-bar" style="width:${Math.round(count / maxCount * 100)}%"></div>
        </div>
        <span class="tok-row-count">${count}</span>
      </div>`).join("");
}

// ─── Status bar ──────────────────────────────────────────────────────────────

function updateStatusBar({ tokens, errors, warnings, stats }) {
  const hasErrors = errors.length > 0;
  el("status-bar").innerHTML = `
    <div class="status-item">
      <div class="status-dot ${hasErrors ? "has-errors" : ""}"></div>
      <span>${hasErrors ? errors.length + " error" + (errors.length !== 1 ? "s" : "") : "OK"}</span>
    </div>
    <div class="status-item"><span>${warnings.length} warning${warnings.length !== 1 ? "s" : ""}</span></div>
    <div class="status-item"><span>${stats.totalTokens} tokens</span></div>
    <div class="status-item"><span>${stats.nodeCount} AST nodes</span></div>
    <div class="status-item"><span>${stats.functionCount} function${stats.functionCount !== 1 ? "s" : ""}</span></div>`;
}

// ─── Sample loading ───────────────────────────────────────────────────────────

function loadSample(name) {
  const src = SAMPLES[name];
  if (!src) return;
  el("source-editor").value = src;
  updateCharCount();
  updateLineNumbers();
  runAnalysis();
}

function updateCharCount() {
  const count = el("source-editor").value.length;
  el("char-count").textContent = `${count} char${count !== 1 ? "s" : ""}`;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

export function init() {
  const bar = el("sample-bar");
  for (const name of Object.keys(SAMPLES)) {
    const btn = document.createElement("button");
    btn.className   = "sample-btn";
    btn.textContent = name;
    btn.onclick     = () => loadSample(name);
    bar.appendChild(btn);
  }

  el("run-btn").onclick = runAnalysis;

  document.querySelectorAll(".phase-tab").forEach((tab, i) => {
    tab.onclick = () => switchTab(i);
  });

  el("source-editor").addEventListener("input", updateCharCount);

  el("source-editor").addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runAnalysis();
    }
  });

  // Line numbers
  const lineNumbers = el("line-numbers");
  const editor      = el("source-editor");

  function updateLineNumbers() {
    const count = editor.value.split("\n").length;
    lineNumbers.textContent = Array.from({ length: count }, (_, i) => i + 1).join("\n");
  }

  // Make updateLineNumbers available to loadSample
  window._updateLineNumbers = updateLineNumbers;

  editor.addEventListener("input",  updateLineNumbers);
  editor.addEventListener("scroll", () => { lineNumbers.scrollTop = editor.scrollTop; });
  updateLineNumbers();

  loadSample("hello world");
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function updateLineNumbers() {
  const editor      = el("source-editor");
  const lineNumbers = el("line-numbers");
  if (!editor || !lineNumbers) return;
  const count = editor.value.split("\n").length;
  lineNumbers.textContent = Array.from({ length: count }, (_, i) => i + 1).join("\n");
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
