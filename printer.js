/**
 * printer.js — C AST Pretty-Printer
 *
 * Two renderers:
 *   printAST(node)       → plain-text indented tree
 *   renderASTHtml(node)  → syntax-coloured HTML spans
 */

"use strict";

const INDENT = "  ";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const sp = (cls, text) => `<span class="${cls}">${esc(text)}</span>`;

// ─── Plain-text printer ───────────────────────────────────────────────────────

export function printAST(node, depth = 0) {
  if (!node) return "";
  const pad = INDENT.repeat(depth);
  const lines = [];

  const typeStr = (ts) => {
    if (!ts) return "?";
    const q = ts.qualifiers?.length ? ts.qualifiers.join(" ") + " " : "";
    const p = ts.pointerLevel > 0 ? "*".repeat(ts.pointerLevel) : "";
    const a = ts.isArray ? "[]" : "";
    return `${q}${ts.base}${p}${a}`;
  };

  switch (node.type) {

    case "Program":
      lines.push("Program");
      for (const s of node.body) lines.push(pad + INDENT + printAST(s, depth + 1));
      break;

    case "PreprocessorDirective":
      lines.push(`PreprocessorDirective  #${node.directive}  ${node.value}`);
      break;

    case "FunctionDeclaration":
      lines.push(`FunctionDeclaration  ${typeStr(node.returnType)} ${node.name}(${
        node.params.map(p => typeStr(p.typeSpec) + (p.name ? " " + p.name : "")).join(", ")
      })`);
      if (node.body) lines.push(pad + INDENT + printAST(node.body, depth + 1));
      break;

    case "FunctionPrototype":
      lines.push(`FunctionPrototype  ${typeStr(node.returnType)} ${node.name}(${
        node.params.map(p => typeStr(p.typeSpec) + (p.name ? " " + p.name : "")).join(", ")
      })`);
      break;

    case "VariableDeclaration":
      lines.push(`VariableDeclaration  type=${typeStr(node.typeSpec)}`);
      for (const d of node.declarators ?? []) {
        const ptrStr = d.pointerLevel > 0 ? "*".repeat(d.pointerLevel) : "";
        const arrStr = d.arraySize ? `[${printAST(d.arraySize, 0).trim()}]` : "";
        lines.push(pad + INDENT + `Declarator  ${ptrStr}${d.name}${arrStr}${d.init ? " = " + printAST(d.init, 0).trim() : ""}`);
      }
      break;

    case "StructDeclaration":
      lines.push(`StructDeclaration  name=${node.name ?? "(anonymous)"}`);
      for (const m of node.members ?? []) lines.push(pad + INDENT + printAST(m, depth + 1));
      break;

    case "UnionDeclaration":
      lines.push(`UnionDeclaration  name=${node.name ?? "(anonymous)"}`);
      for (const m of node.members ?? []) lines.push(pad + INDENT + printAST(m, depth + 1));
      break;

    case "EnumDeclaration":
      lines.push(`EnumDeclaration  name=${node.name ?? "(anonymous)"}`);
      for (const m of node.members ?? [])
        lines.push(pad + INDENT + `EnumMember  ${m.name}${m.value ? " = " + printAST(m.value, 0).trim() : ""}`);
      break;

    case "TypedefDeclaration":
      lines.push(`TypedefDeclaration  ${typeStr(node.typeSpec)} → ${node.alias}`);
      break;

    case "BlockStatement":
      lines.push(`BlockStatement  [${node.body.length} stmt${node.body.length !== 1 ? "s" : ""}]`);
      for (const s of node.body) lines.push(pad + INDENT + printAST(s, depth + 1));
      break;

    case "IfStatement":
      lines.push("IfStatement");
      lines.push(pad + INDENT + "test:       " + printAST(node.test, depth + 1));
      lines.push(pad + INDENT + "consequent: " + printAST(node.consequent, depth + 1));
      if (node.alternate)
        lines.push(pad + INDENT + "alternate:  " + printAST(node.alternate, depth + 1));
      break;

    case "WhileStatement":
      lines.push("WhileStatement");
      lines.push(pad + INDENT + "test: " + printAST(node.test, depth + 1));
      lines.push(pad + INDENT + "body: " + printAST(node.body, depth + 1));
      break;

    case "DoWhileStatement":
      lines.push("DoWhileStatement");
      lines.push(pad + INDENT + "body: " + printAST(node.body, depth + 1));
      lines.push(pad + INDENT + "test: " + printAST(node.test, depth + 1));
      break;

    case "ForStatement":
      lines.push("ForStatement");
      if (node.init)   lines.push(pad + INDENT + "init:   " + printAST(node.init, depth + 1));
      if (node.test)   lines.push(pad + INDENT + "test:   " + printAST(node.test, depth + 1));
      if (node.update) lines.push(pad + INDENT + "update: " + printAST(node.update, depth + 1));
      lines.push(pad + INDENT + "body:   " + printAST(node.body, depth + 1));
      break;

    case "SwitchStatement":
      lines.push(`SwitchStatement  [${node.cases.length} case${node.cases.length !== 1 ? "s" : ""}]`);
      lines.push(pad + INDENT + "discriminant: " + printAST(node.discriminant, depth + 1));
      for (const c of node.cases) {
        lines.push(pad + INDENT + `CaseClause  ${c.test ? printAST(c.test, 0).trim() : "default"}`);
        for (const s of c.body) lines.push(pad + INDENT + INDENT + printAST(s, depth + 2));
      }
      break;

    case "ReturnStatement":
      lines.push("ReturnStatement");
      if (node.argument) lines.push(pad + INDENT + printAST(node.argument, depth + 1));
      break;

    case "BreakStatement":    lines.push("BreakStatement");    break;
    case "ContinueStatement": lines.push("ContinueStatement"); break;

    case "GotoStatement":
      lines.push(`GotoStatement  label=${node.label}`);
      break;

    case "LabeledStatement":
      lines.push(`LabeledStatement  label=${node.label}`);
      lines.push(pad + INDENT + printAST(node.body, depth + 1));
      break;

    case "ExpressionStatement":
      lines.push("ExpressionStatement");
      lines.push(pad + INDENT + printAST(node.expression, depth + 1));
      break;

    case "EmptyStatement":
      lines.push("EmptyStatement");
      break;

    case "BinaryExpression":
      lines.push(`BinaryExpression  op='${node.operator}'`);
      lines.push(pad + INDENT + "left:  " + printAST(node.left,  depth + 1));
      lines.push(pad + INDENT + "right: " + printAST(node.right, depth + 1));
      break;

    case "UnaryExpression":
      lines.push(`UnaryExpression  op='${node.operator}'  prefix=${node.prefix}`);
      lines.push(pad + INDENT + printAST(node.argument, depth + 1));
      break;

    case "AssignmentExpression":
      lines.push(`AssignmentExpression  op='${node.operator}'`);
      lines.push(pad + INDENT + "left:  " + printAST(node.left,  depth + 1));
      lines.push(pad + INDENT + "right: " + printAST(node.right, depth + 1));
      break;

    case "ConditionalExpression":
      lines.push("ConditionalExpression");
      lines.push(pad + INDENT + "test:       " + printAST(node.test,       depth + 1));
      lines.push(pad + INDENT + "consequent: " + printAST(node.consequent, depth + 1));
      lines.push(pad + INDENT + "alternate:  " + printAST(node.alternate,  depth + 1));
      break;

    case "CallExpression":
      lines.push(`CallExpression  [${(node.arguments ?? []).length} args]`);
      lines.push(pad + INDENT + "callee: " + printAST(node.callee, depth + 1));
      for (const a of (node.arguments ?? [])) lines.push(pad + INDENT + "arg: " + printAST(a, depth + 1));
      break;

    case "MemberExpression":
      lines.push(`MemberExpression  .${node.property}`);
      lines.push(pad + INDENT + printAST(node.object, depth + 1));
      break;

    case "ArrowExpression":
      lines.push(`ArrowExpression  ->${node.member}`);
      lines.push(pad + INDENT + printAST(node.object, depth + 1));
      break;

    case "CastExpression":
      lines.push(`CastExpression  to=${typeStr(node.targetType)}`);
      lines.push(pad + INDENT + printAST(node.expression, depth + 1));
      break;

    case "SizeofExpression":
      lines.push(`SizeofExpression  isType=${node.isType}`);
      lines.push(pad + INDENT + (node.isType ? typeStr(node.argument) : printAST(node.argument, depth + 1)));
      break;

    case "AddressOfExpression":
      lines.push("AddressOfExpression  (&)");
      lines.push(pad + INDENT + printAST(node.argument, depth + 1));
      break;

    case "DereferenceExpression":
      lines.push("DereferenceExpression  (*)");
      lines.push(pad + INDENT + printAST(node.argument, depth + 1));
      break;

    case "ArraySubscript":
      lines.push("ArraySubscript");
      lines.push(pad + INDENT + "array: " + printAST(node.array, depth + 1));
      lines.push(pad + INDENT + "index: " + printAST(node.index, depth + 1));
      break;

    case "Identifier":
      lines.push(`Identifier  '${node.name}'`);
      break;

    case "Literal":
      lines.push(`Literal  kind=${node.kind}  value=${JSON.stringify(node.raw)}`);
      break;

    case "MissingExpression": lines.push("⚠ MissingExpression"); break;
    case "MissingBlock":      lines.push("⚠ MissingBlock");      break;
    case "ErrorNode":         lines.push(`⚠ ErrorNode  '${node.raw}'`); break;

    default: lines.push(`[${node.type}]`);
  }

  return lines.join("\n");
}

// ─── HTML renderer ────────────────────────────────────────────────────────────

export function renderASTHtml(node, depth = 0) {
  if (!node) return "";
  const pad = "  ".repeat(depth);
  const lines = [];

  const h = (label, extra = "") =>
    `${sp("ast-node-type", label)}${extra ? " " + extra : ""}`;

  const kv = (k, v, cls = "ast-value") =>
    `${sp("ast-key", k + "=")}${sp(cls, String(v))}`;

  const typeHtml = (ts) => {
    if (!ts) return sp("ast-meta", "?");
    const q = ts.qualifiers?.length ? ts.qualifiers.join(" ") + " " : "";
    const p = ts.pointerLevel > 0 ? "*".repeat(ts.pointerLevel) : "";
    return sp("ast-type", `${q}${ts.base}${p}`);
  };

  switch (node.type) {

    case "Program":
      lines.push(h("Program"));
      for (const s of node.body) lines.push(pad + "  " + renderASTHtml(s, depth + 1));
      break;

    case "PreprocessorDirective":
      lines.push(h("PreprocessorDirective",
        sp("ast-pre", `#${node.directive}`) + " " + sp("ast-lit", esc(node.value))));
      break;

    case "FunctionDeclaration":
      lines.push(h("FunctionDeclaration",
        typeHtml(node.returnType) + " " + sp("ast-ident", node.name) + sp("ast-op", "(") +
        node.params.map(p => typeHtml(p.typeSpec) + (p.name ? " " + sp("ast-param", p.name) : "")).join(sp("ast-op", ", ")) +
        sp("ast-op", ")")));
      if (node.body) lines.push(pad + "  " + renderASTHtml(node.body, depth + 1));
      break;

    case "FunctionPrototype":
      lines.push(h("FunctionPrototype",
        typeHtml(node.returnType) + " " + sp("ast-ident", node.name) +
        sp("ast-meta", `(${node.params.length} param${node.params.length !== 1 ? "s" : ""})`)));
      break;

    case "VariableDeclaration":
      lines.push(h("VariableDeclaration", kv("type", "", "") + typeHtml(node.typeSpec)));
      for (const d of node.declarators ?? []) {
        const ptrStr = d.pointerLevel > 0 ? "*".repeat(d.pointerLevel) : "";
        const arrStr = d.arraySize ? `[${printAST(d.arraySize, 0).trim()}]` : "";
        lines.push(pad + "  " + sp("ast-key", "declarator: ") +
          sp("ast-op", ptrStr) + sp("ast-ident", d.name) + sp("ast-meta", arrStr) +
          (d.init ? sp("ast-op", " = ") + renderASTHtml(d.init, 0).trim() : ""));
      }
      break;

    case "StructDeclaration":
      lines.push(h("StructDeclaration",
        kv("name", node.name ?? "(anonymous)", "ast-ident") +
        sp("ast-meta", `  [${node.members?.length ?? 0} members]`)));
      for (const m of node.members ?? []) lines.push(pad + "  " + renderASTHtml(m, depth + 1));
      break;

    case "UnionDeclaration":
      lines.push(h("UnionDeclaration", kv("name", node.name ?? "(anonymous)", "ast-ident")));
      for (const m of node.members ?? []) lines.push(pad + "  " + renderASTHtml(m, depth + 1));
      break;

    case "EnumDeclaration":
      lines.push(h("EnumDeclaration",
        kv("name", node.name ?? "(anonymous)", "ast-ident") +
        sp("ast-meta", `  [${node.members?.length ?? 0} members]`)));
      for (const m of node.members ?? [])
        lines.push(pad + "  " + sp("ast-key", "member: ") + sp("ast-ident", m.name) +
          (m.value ? sp("ast-op", " = ") + renderASTHtml(m.value, 0).trim() : ""));
      break;

    case "TypedefDeclaration":
      lines.push(h("TypedefDeclaration",
        typeHtml(node.typeSpec) + sp("ast-op", " → ") + sp("ast-ident", node.alias)));
      break;

    case "BlockStatement":
      lines.push(h("BlockStatement", sp("ast-meta", `[${node.body.length} stmts]`)));
      for (const s of node.body) lines.push(pad + "  " + renderASTHtml(s, depth + 1));
      break;

    case "IfStatement":
      lines.push(h("IfStatement"));
      lines.push(pad + "  " + sp("ast-key", "test:       ") + renderASTHtml(node.test, depth + 1));
      lines.push(pad + "  " + sp("ast-key", "consequent: ") + renderASTHtml(node.consequent, depth + 1));
      if (node.alternate) lines.push(pad + "  " + sp("ast-key", "alternate:  ") + renderASTHtml(node.alternate, depth + 1));
      break;

    case "WhileStatement":
      lines.push(h("WhileStatement"));
      lines.push(pad + "  " + sp("ast-key", "test: ") + renderASTHtml(node.test, depth + 1));
      lines.push(pad + "  " + sp("ast-key", "body: ") + renderASTHtml(node.body, depth + 1));
      break;

    case "DoWhileStatement":
      lines.push(h("DoWhileStatement"));
      lines.push(pad + "  " + sp("ast-key", "body: ") + renderASTHtml(node.body, depth + 1));
      lines.push(pad + "  " + sp("ast-key", "test: ") + renderASTHtml(node.test, depth + 1));
      break;

    case "ForStatement":
      lines.push(h("ForStatement"));
      if (node.init)   lines.push(pad + "  " + sp("ast-key", "init:   ") + renderASTHtml(node.init, depth + 1));
      if (node.test)   lines.push(pad + "  " + sp("ast-key", "test:   ") + renderASTHtml(node.test, depth + 1));
      if (node.update) lines.push(pad + "  " + sp("ast-key", "update: ") + renderASTHtml(node.update, depth + 1));
      lines.push(pad + "  " + sp("ast-key", "body:   ") + renderASTHtml(node.body, depth + 1));
      break;

    case "SwitchStatement":
      lines.push(h("SwitchStatement", sp("ast-meta", `[${node.cases.length} cases]`)));
      lines.push(pad + "  " + sp("ast-key", "on: ") + renderASTHtml(node.discriminant, depth + 1));
      for (const c of node.cases) {
        lines.push(pad + "  " + sp("ast-kw", c.test ? "case " : "default") +
          (c.test ? renderASTHtml(c.test, 0).trim() : ""));
        for (const s of c.body) lines.push(pad + "    " + renderASTHtml(s, depth + 2));
      }
      break;

    case "ReturnStatement":
      lines.push(h("ReturnStatement"));
      if (node.argument) lines.push(pad + "  " + renderASTHtml(node.argument, depth + 1));
      break;

    case "BreakStatement":    lines.push(h("BreakStatement"));    break;
    case "ContinueStatement": lines.push(h("ContinueStatement")); break;
    case "EmptyStatement":    lines.push(h("EmptyStatement"));    break;

    case "GotoStatement":
      lines.push(h("GotoStatement", kv("label", node.label, "ast-ident")));
      break;

    case "LabeledStatement":
      lines.push(h("LabeledStatement", kv("label", node.label, "ast-ident")));
      lines.push(pad + "  " + renderASTHtml(node.body, depth + 1));
      break;

    case "ExpressionStatement":
      lines.push(h("ExpressionStatement"));
      lines.push(pad + "  " + renderASTHtml(node.expression, depth + 1));
      break;

    case "BinaryExpression":
      lines.push(h("BinaryExpression", kv("op", node.operator, "ast-op")));
      lines.push(pad + "  " + sp("ast-key", "left:  ") + renderASTHtml(node.left, depth + 1));
      lines.push(pad + "  " + sp("ast-key", "right: ") + renderASTHtml(node.right, depth + 1));
      break;

    case "UnaryExpression":
      lines.push(h("UnaryExpression",
        kv("op", node.operator, "ast-op") + "  " + kv("prefix", String(node.prefix))));
      lines.push(pad + "  " + renderASTHtml(node.argument, depth + 1));
      break;

    case "AssignmentExpression":
      lines.push(h("AssignmentExpression", kv("op", node.operator, "ast-op")));
      lines.push(pad + "  " + sp("ast-key", "left:  ") + renderASTHtml(node.left, depth + 1));
      lines.push(pad + "  " + sp("ast-key", "right: ") + renderASTHtml(node.right, depth + 1));
      break;

    case "ConditionalExpression":
      lines.push(h("ConditionalExpression"));
      lines.push(pad + "  " + sp("ast-key", "test:       ") + renderASTHtml(node.test,       depth + 1));
      lines.push(pad + "  " + sp("ast-key", "consequent: ") + renderASTHtml(node.consequent, depth + 1));
      lines.push(pad + "  " + sp("ast-key", "alternate:  ") + renderASTHtml(node.alternate,  depth + 1));
      break;

    case "CallExpression":
      lines.push(h("CallExpression",
        sp("ast-meta", `[${(node.arguments ?? []).length} args]`)));
      lines.push(pad + "  " + sp("ast-key", "callee: ") + renderASTHtml(node.callee, depth + 1));
      for (const a of (node.arguments ?? []))
        lines.push(pad + "  " + sp("ast-key", "arg: ") + renderASTHtml(a, depth + 1));
      break;

    case "MemberExpression":
      lines.push(h("MemberExpression", sp("ast-op", ".") + sp("ast-ident", node.property)));
      lines.push(pad + "  " + renderASTHtml(node.object, depth + 1));
      break;

    case "ArrowExpression":
      lines.push(h("ArrowExpression", sp("ast-op", "->") + sp("ast-ident", node.member)));
      lines.push(pad + "  " + renderASTHtml(node.object, depth + 1));
      break;

    case "CastExpression":
      lines.push(h("CastExpression", sp("ast-op", "(") + typeHtml(node.targetType) + sp("ast-op", ")")));
      lines.push(pad + "  " + renderASTHtml(node.expression, depth + 1));
      break;

    case "SizeofExpression":
      lines.push(h("SizeofExpression", kv("isType", String(node.isType))));
      lines.push(pad + "  " + (node.isType ? typeHtml(node.argument) : renderASTHtml(node.argument, depth + 1)));
      break;

    case "AddressOfExpression":
      lines.push(h("AddressOfExpression", sp("ast-op", "&")));
      lines.push(pad + "  " + renderASTHtml(node.argument, depth + 1));
      break;

    case "DereferenceExpression":
      lines.push(h("DereferenceExpression", sp("ast-op", "*")));
      lines.push(pad + "  " + renderASTHtml(node.argument, depth + 1));
      break;

    case "ArraySubscript":
      lines.push(h("ArraySubscript"));
      lines.push(pad + "  " + sp("ast-key", "array: ") + renderASTHtml(node.array, depth + 1));
      lines.push(pad + "  " + sp("ast-key", "index: ") + renderASTHtml(node.index, depth + 1));
      break;

    case "Identifier":
      lines.push(h("Identifier", sp("ast-ident", node.name)));
      break;

    case "Literal":
      lines.push(h("Literal",
        kv("kind", node.kind, "ast-meta") + "  " + sp("ast-lit", esc(node.raw))));
      break;

    case "MissingExpression":
      lines.push(`<span class="ast-error">⚠ MissingExpression</span>`);
      break;
    case "MissingBlock":
      lines.push(`<span class="ast-error">⚠ MissingBlock</span>`);
      break;
    case "ErrorNode":
      lines.push(`<span class="ast-error">⚠ ErrorNode '${esc(node.raw)}'</span>`);
      break;

    default:
      lines.push(`<span class="ast-meta">[${esc(node.type)}]</span>`);
  }

  return lines.join("\n");
}
