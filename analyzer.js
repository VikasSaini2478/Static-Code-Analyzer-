/**
 * analyzer.js — C Compiler Orchestrator
 *
 * Ties together: Lexer → Parser → Symbol Table → Type Checker
 *
 * Returns a single structured result:
 *   result.tokens       — Token[]
 *   result.ast          — AST Program node
 *   result.errors       — CompilerError[]  (lex + parse + semantic)
 *   result.warnings     — CompilerWarning[]
 *   result.symbolTable  — { global: Map, functions: Map }
 *   result.stats        — summary counts
 */

"use strict";

import { tokenize }  from "./lexer.js";
import { parse }     from "./parser.js";

// ─── CompilerError ────────────────────────────────────────────────────────────

export class CompilerError {
  constructor(raw) {
    this.phase    = raw.phase;
    this.message  = raw.message;
    this.line     = raw.line    ?? null;
    this.col      = raw.col     ?? null;
    this.raw      = raw.raw     ?? null;
    this.expected = raw.expected ?? null;
    this.got      = raw.got      ?? null;
  }
  toString() {
    const loc = this.line ? ` [${this.line}:${this.col}]` : "";
    return `[${this.phase.toUpperCase()}]${loc} ${this.message}`;
  }
}

// ─── CompilerWarning ──────────────────────────────────────────────────────────

export class CompilerWarning {
  constructor(message, line, col) {
    this.phase   = "semantic";
    this.message = message;
    this.line    = line ?? null;
    this.col     = col  ?? null;
  }
}

// ─── Symbol Table ─────────────────────────────────────────────────────────────

class SymbolTable {
  constructor() {
    this.scopes    = [new Map()]; // stack of scopes
    this.functions = new Map();   // name → { returnType, params }
    this.structs   = new Map();   // name → members
    this.enums     = new Map();   // name → members
    this.typedefs  = new Map();   // alias → type
  }

  enter()  { this.scopes.push(new Map()); }
  exit()   { this.scopes.pop(); }

  declare(name, type, line, col) {
    const scope = this.scopes[this.scopes.length - 1];
    scope.set(name, { type, line, col });
  }

  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    }
    return null;
  }

  isDeclaredInCurrentScope(name) {
    return this.scopes[this.scopes.length - 1].has(name);
  }

  get global() { return this.scopes[0]; }
}

// ─── Semantic Analyzer ────────────────────────────────────────────────────────

class SemanticAnalyzer {
  constructor(ast) {
    this.ast      = ast;
    this.symbols  = new SymbolTable();
    this.errors   = [];
    this.warnings = [];
    this.currentFunction = null;
  }

  warn(message, loc) {
    this.warnings.push(new CompilerWarning(message, loc?.line, loc?.col));
  }

  error(message, loc) {
    this.errors.push({
      phase: "semantic", message, line: loc?.line ?? null, col: loc?.col ?? null
    });
  }

  analyze() {
    for (const node of this.ast.body) {
      this.visitTopLevel(node);
    }
    return { errors: this.errors, warnings: this.warnings, symbolTable: this.symbols };
  }

  visitTopLevel(node) {
    if (!node) return;
    switch (node.type) {
      case "PreprocessorDirective": break; // no semantic analysis needed
      case "FunctionDeclaration":
        this.visitFunctionDeclaration(node);
        break;
      case "FunctionPrototype":
        this.symbols.functions.set(node.name, {
          returnType: node.returnType,
          params: node.params
        });
        break;
      case "VariableDeclaration":
        this.visitVariableDeclaration(node);
        break;
      case "StructDeclaration":
        if (node.name) this.symbols.structs.set(node.name, node.members);
        break;
      case "EnumDeclaration":
        if (node.name) {
          this.symbols.enums.set(node.name, node.members);
          // Enum members are global constants
          for (const m of node.members) {
            this.symbols.declare(m.name, "int", m.loc?.line, m.loc?.col);
          }
        }
        break;
      case "TypedefDeclaration":
        this.symbols.typedefs.set(node.alias, node.typeSpec);
        break;
      default: break;
    }
  }

  visitFunctionDeclaration(node) {
    // Register function in symbol table
    this.symbols.functions.set(node.name, {
      returnType: node.returnType,
      params: node.params
    });

    // Check main() signature
    if (node.name === "main") {
      const ret = node.returnType?.base;
      if (ret && ret !== "int") {
        this.warn(`main() should return 'int', found '${ret}'`, node.loc);
      }
    }

    // Enter function scope
    this.symbols.enter();
    this.currentFunction = node;

    // Declare parameters
    for (const param of node.params) {
      if (param.name) {
        if (this.symbols.isDeclaredInCurrentScope(param.name)) {
          this.error(`Duplicate parameter name '${param.name}'`, param.loc);
        } else {
          this.symbols.declare(param.name, param.typeSpec?.base, param.loc?.line, param.loc?.col);
        }
      }
    }

    // Visit body
    if (node.body?.type === "BlockStatement") {
      this.visitBlock(node.body);
    }

    this.currentFunction = null;
    this.symbols.exit();
  }

  visitBlock(node) {
    this.symbols.enter();
    for (const stmt of node.body) {
      this.visitStatement(stmt);
    }
    this.symbols.exit();
  }

  visitStatement(node) {
    if (!node) return;
    switch (node.type) {
      case "VariableDeclaration":  this.visitVariableDeclaration(node); break;
      case "BlockStatement":       this.visitBlock(node); break;
      case "IfStatement":          this.visitIf(node); break;
      case "WhileStatement":       this.visitWhile(node); break;
      case "DoWhileStatement":
        this.visitStatement(node.body);
        this.visitExpression(node.test);
        break;
      case "ForStatement":         this.visitFor(node); break;
      case "ReturnStatement":      this.visitReturn(node); break;
      case "ExpressionStatement":  this.visitExpression(node.expression); break;
      case "SwitchStatement":
        this.visitExpression(node.discriminant);
        for (const c of node.cases) {
          if (c.test) this.visitExpression(c.test);
          for (const s of c.body) this.visitStatement(s);
        }
        break;
      case "LabeledStatement":
        this.visitStatement(node.body);
        break;
      default: break;
    }
  }

  visitVariableDeclaration(node) {
    for (const decl of node.declarators ?? []) {
      if (this.symbols.isDeclaredInCurrentScope(decl.name)) {
        this.error(`Redeclaration of '${decl.name}'`, node.loc);
      } else {
        this.symbols.declare(decl.name, node.typeSpec?.base, node.loc?.line, node.loc?.col);
      }
      if (decl.init) this.visitExpression(decl.init);
    }
  }

  visitIf(node) {
    this.visitExpression(node.test);
    this.visitStatement(node.consequent);
    if (node.alternate) this.visitStatement(node.alternate);
  }

  visitWhile(node) {
    this.visitExpression(node.test);
    this.visitStatement(node.body);
  }

  visitFor(node) {
    this.symbols.enter();
    if (node.init) this.visitStatement(node.init);
    if (node.test) this.visitExpression(node.test);
    if (node.update) this.visitExpression(node.update);
    this.visitStatement(node.body);
    this.symbols.exit();
  }

  visitReturn(node) {
    const retBase = this.currentFunction?.returnType?.base;
    if (retBase === "void" && node.argument) {
      this.warn(`Function declared void but returns a value`, node.loc);
    }
    if (retBase && retBase !== "void" && !node.argument) {
      this.warn(`Function '${this.currentFunction?.name}' should return a value`, node.loc);
    }
    if (node.argument) this.visitExpression(node.argument);
  }

  visitExpression(node) {
    if (!node) return;
    switch (node.type) {
      case "Identifier":
        // Check undeclared variable (skip function names)
        if (!this.symbols.lookup(node.name) &&
            !this.symbols.functions.has(node.name)) {
          this.warn(`'${node.name}' used before declaration`, node.loc);
        }
        break;
      case "CallExpression":
        if (node.callee?.type === "Identifier") {
          const fname = node.callee.name;
          if (!this.symbols.functions.has(fname)) {
            // Implicit function declaration warning (common in C)
            this.warn(`Implicit declaration of function '${fname}'`, node.loc);
          }
        }
        for (const arg of node.arguments ?? []) this.visitExpression(arg);
        break;
      case "AssignmentExpression":
      case "BinaryExpression":
        this.visitExpression(node.left);
        this.visitExpression(node.right);
        break;
      case "UnaryExpression":
        this.visitExpression(node.argument);
        break;
      case "AddressOfExpression":
      case "DereferenceExpression":
        this.visitExpression(node.argument);
        break;
      case "ArraySubscript":
        this.visitExpression(node.array);
        this.visitExpression(node.index);
        break;
      case "MemberExpression":
      case "ArrowExpression":
        this.visitExpression(node.object ?? node.object);
        break;
      case "ConditionalExpression":
        this.visitExpression(node.test);
        this.visitExpression(node.consequent);
        this.visitExpression(node.alternate);
        break;
      case "CastExpression":
        this.visitExpression(node.expression);
        break;
      default: break;
    }
  }
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

function measureDepth(node, depth = 0) {
  if (!node || typeof node !== "object") return depth;
  let max = depth;
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "type") continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) max = Math.max(max, measureDepth(child, depth + 1));
    } else if (val && typeof val === "object" && val.type) {
      max = Math.max(max, measureDepth(val, depth + 1));
    }
  }
  return max;
}

function countNodes(node) {
  if (!node || typeof node !== "object" || !node.type) return 0;
  let count = 1;
  for (const key of Object.keys(node)) {
    if (key === "loc") continue;
    const val = node[key];
    if (Array.isArray(val))                              for (const c of val) count += countNodes(c);
    else if (val && typeof val === "object" && val.type) count += countNodes(val);
  }
  return count;
}

function countByType(ast, type) {
  let count = 0;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === type) count++;
    for (const key of Object.keys(node)) {
      if (key === "loc") continue;
      const val = node[key];
      if (Array.isArray(val))  val.forEach(walk);
      else if (val?.type)      walk(val);
    }
  }
  walk(ast);
  return count;
}

// ─── analyze() ───────────────────────────────────────────────────────────────

export function analyze(source) {
  // Phase 1 — Lex
  const { tokens, errors: lexErrors } = tokenize(source);

  // Phase 2 — Parse
  const parseableTokens = tokens.filter(t => t.type !== "ERROR");
  const { ast, errors: parseErrors } = parse(parseableTokens);

  // Phase 3 — Semantic
  const semantic = new SemanticAnalyzer(ast);
  const { errors: semErrors, warnings, symbolTable } = semantic.analyze();

  // Combine errors
  const errors = [
    ...lexErrors.map(e  => new CompilerError(e)),
    ...parseErrors.map(e => new CompilerError(e)),
    ...semErrors.map(e   => new CompilerError(e)),
  ].sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.col ?? 0) - (b.col ?? 0));

  // Token counts
  const tokenCounts = {};
  for (const t of tokens) tokenCounts[t.type] = (tokenCounts[t.type] ?? 0) + 1;

  const stats = {
    totalTokens    : tokens.length,
    errorTokens    : tokens.filter(t => t.type === "ERROR").length,
    totalErrors    : errors.length,
    lexErrors      : lexErrors.length,
    parseErrors    : parseErrors.length,
    semanticErrors : semErrors.length,
    warnings       : warnings.length,
    tokenCounts,
    astDepth       : measureDepth(ast),
    nodeCount      : countNodes(ast),
    functionCount  : countByType(ast, "FunctionDeclaration"),
    structCount    : countByType(ast, "StructDeclaration"),
    pointerCount   : countByType(ast, "DereferenceExpression") + countByType(ast, "AddressOfExpression"),
    preprocessorCount : countByType(ast, "PreprocessorDirective"),
  };

  return { tokens, ast, errors, warnings, symbolTable, stats, source };
}

export function summarize({ stats, errors, warnings }) {
  const lines = [
    `── Analysis Summary ──────────────────`,
    `Tokens        : ${stats.totalTokens}`,
    `AST nodes     : ${stats.nodeCount}`,
    `Functions     : ${stats.functionCount}`,
    `Structs       : ${stats.structCount}`,
    `Preprocessor  : ${stats.preprocessorCount}`,
    `Errors        : ${stats.totalErrors} (${stats.lexErrors} lex, ${stats.parseErrors} parse, ${stats.semanticErrors} semantic)`,
    `Warnings      : ${stats.warnings}`,
    `──────────────────────────────────────`,
  ];
  if (errors.length)   { lines.push(""); errors.forEach(e   => lines.push(`  ERR:  ${e.toString()}`)); }
  if (warnings.length) { lines.push(""); warnings.forEach(w => lines.push(`  WARN: [${w.line}:${w.col}] ${w.message}`)); }
  return lines.join("\n");
}
