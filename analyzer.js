/**
 * analyzer.js — C Compiler Orchestrator  (Production v3.0)
 * Pipeline: Lexer → Parser → Type Validator → Semantic Analyzer
 */
"use strict";

import { tokenize } from "./lexer.js";
import { parse }    from "./parser.js";

// ─── Standard Library Registry ───────────────────────────────────────────────
const STDLIB_FUNCTIONS = {
  "stdio.h":   ["printf","fprintf","sprintf","snprintf","scanf","fscanf","sscanf","fopen","fclose","fread","fwrite","fflush","fseek","ftell","rewind","fgets","fputs","fgetc","fputc","getchar","putchar","gets","puts","perror","clearerr","feof","ferror","remove","rename","tmpfile","tmpnam","setvbuf","setbuf","vprintf","vfprintf","vsprintf","vsnprintf"],
  "stdlib.h":  ["malloc","calloc","realloc","free","exit","abort","atexit","_Exit","atoi","atol","atof","atoll","strtol","strtoul","strtod","strtof","strtold","rand","srand","abs","labs","llabs","div","ldiv","lldiv","qsort","bsearch","getenv","system","putenv"],
  "string.h":  ["strlen","strcpy","strncpy","strcat","strncat","strcmp","strncmp","strcasecmp","strncasecmp","strchr","strrchr","strstr","strpbrk","strspn","strcspn","strtok","strtok_r","memcpy","memmove","memset","memcmp","memchr","strerror","strdup","strndup"],
  "math.h":    ["sin","cos","tan","asin","acos","atan","atan2","sinh","cosh","tanh","asinh","acosh","atanh","exp","exp2","expm1","log","log2","log10","log1p","pow","sqrt","cbrt","hypot","ceil","floor","round","trunc","fabs","fmod","remainder","fmax","fmin","fma","frexp","ldexp","modf","isnan","isinf","isfinite","isnormal","signbit"],
  "ctype.h":   ["isalpha","isdigit","isalnum","isspace","isupper","islower","ispunct","isprint","isgraph","iscntrl","isxdigit","toupper","tolower"],
  "time.h":    ["time","clock","difftime","mktime","gmtime","localtime","asctime","ctime","strftime","gettimeofday"],
  "assert.h":  ["assert"],
  "unistd.h":  ["read","write","open","close","lseek","unlink","rmdir","getcwd","chdir","getpid","getppid","fork","exec","sleep","usleep","access","dup","dup2","pipe","isatty"],
  "fcntl.h":   ["open","creat","fcntl"],
  "signal.h":  ["signal","raise","kill","sigaction","sigemptyset","sigaddset"],
  "setjmp.h":  ["setjmp","longjmp"],
  "stdarg.h":  ["va_start","va_end","va_arg","va_copy"],
  "errno.h":   [], "limits.h": [], "float.h": [], "stddef.h": [],
  "stdint.h":  [], "stdbool.h": [], "inttypes.h": [],
};

const INT32_MAX = 2147483647;
const INT32_MIN = -2147483648;
const INTEGER_TYPES = new Set(["int","short","long","unsigned","signed","char"]);

function isFloatLiteral(raw) {
  if (!raw) return false;
  const lower = raw.toLowerCase().replace(/[ul]+$/, "");
  return lower.includes(".") || lower.includes("e") || lower.endsWith("f");
}

function parseNumericLiteral(raw) {
  if (!raw) return NaN;
  const clean = raw.replace(/[uUlLfF]+$/, "");
  if (/^0[xX]/.test(clean)) return parseInt(clean, 16);
  if (/^0[0-7]+$/.test(clean)) return parseInt(clean, 8);
  return parseFloat(clean);
}

function extractHeader(v) { return v.replace(/[<>"]/g,"").trim().toLowerCase(); }

// ─── Error Codes ─────────────────────────────────────────────────────────────
export const ErrorCode = Object.freeze({
  SEM_FLOAT_TO_INT:    "SEM002",
  SEM_INT_OVERFLOW:    "SEM003",
  SEM_REDECLARATION:   "SEM004",
  SEM_IMPLICIT_DECL:   "SEM005",
  SEM_UNDECLARED:      "SEM006",
  SEM_MISSING_RETURN:  "SEM008",
  SEM_INVALID_OPERAND: "SEM009",
  SEM_DUPLICATE_PARAM: "SEM010",
  SEM_STRING_TO_INT:   "SEM012",
  SEM_TYPE_MISMATCH:   "SEM001",
});

export class CompilerError {
  constructor(raw) {
    this.phase    = raw.phase    ?? "unknown";
    this.message  = raw.message  ?? "Unknown error";
    this.line     = raw.line     ?? null;
    this.col      = raw.col      ?? null;
    this.code     = raw.code     ?? null;
    this.expected = raw.expected ?? null;
    this.got      = raw.got      ?? null;
    this.raw      = raw.raw      ?? null;
  }
  toString() {
    const loc  = this.line != null ? ` [${this.line}:${this.col}]` : "";
    const code = this.code ? ` (${this.code})` : "";
    return `[${this.phase.toUpperCase()}]${loc}${code} ${this.message}`;
  }
}

export class CompilerWarning {
  constructor(message, line, col, code = null) {
    this.phase   = "semantic";
    this.message = message;
    this.line    = line ?? null;
    this.col     = col  ?? null;
    this.code    = code;
  }
}

// ─── Symbol Table ─────────────────────────────────────────────────────────────
class SymbolTable {
  constructor() {
    this.scopes    = [new Map()];
    this.functions = new Map();
    this.structs   = new Map();
    this.enums     = new Map();
    this.typedefs  = new Map();
  }
  enter()  { this.scopes.push(new Map()); }
  exit()   { this.scopes.pop(); }
  declare(name, type, line, col) { this.scopes[this.scopes.length-1].set(name, {type, line, col}); }
  lookup(name) {
    for (let i=this.scopes.length-1; i>=0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    }
    return null;
  }
  isDeclaredInCurrentScope(name) { return this.scopes[this.scopes.length-1].has(name); }
  get global() { return this.scopes[0]; }
}

// ─── Type Validator (Strict Int Checking) ─────────────────────────────────────
class TypeValidator {
  constructor(errors, warnings) {
    this._errors   = errors;
    this._warnings = warnings;
  }

  validateInit(declaredBase, initNode, loc, varName) {
    if (!initNode || !declaredBase) return;
    if (!INTEGER_TYPES.has(declaredBase)) return;
    const kind = this._inferKind(initNode);

    if (kind === "float") {
      const rawVal = initNode.raw ?? initNode.value ?? "?";
      this._errors.push({
        phase: "semantic", code: ErrorCode.SEM_FLOAT_TO_INT,
        message: `Cannot assign floating-point value '${rawVal}' to 'int' variable '${varName}'. Use explicit cast: (int)(${rawVal})`,
        line: loc?.line, col: loc?.col,
      });
    } else if (kind === "string") {
      this._errors.push({
        phase: "semantic", code: ErrorCode.SEM_STRING_TO_INT,
        message: `Cannot assign string literal to 'int' variable '${varName}'. Assign to a char pointer instead.`,
        line: loc?.line, col: loc?.col,
      });
    } else if (kind === "integer" && initNode.type === "Literal") {
      const num = parseNumericLiteral(initNode.raw ?? initNode.value);
      if (!isNaN(num) && (num > INT32_MAX || num < INT32_MIN)) {
        this._errors.push({
          phase: "semantic", code: ErrorCode.SEM_INT_OVERFLOW,
          message: `Integer literal ${initNode.raw} overflows 'int' range [${INT32_MIN}, ${INT32_MAX}]. Use 'long' or 'long long'.`,
          line: loc?.line, col: loc?.col,
        });
      }
    }
  }

  _inferKind(node) {
    if (!node) return "unknown";
    if (node.type === "Literal") return node.kind ?? "unknown";
    if (node.type === "UnaryExpression" && (node.operator==="-"||node.operator==="+"))
      return this._inferKind(node.argument);
    if (node.type === "CastExpression") return "cast";
    return "unknown";
  }
}

// ─── Semantic Analyzer ────────────────────────────────────────────────────────
class SemanticAnalyzer {
  constructor(ast) {
    this.ast       = ast;
    this.symbols   = new SymbolTable();
    this._errors   = [];
    this._warnings = [];
    this.validator = new TypeValidator(this._errors, this._warnings);
    this.currentFunction = null;
    this.loopDepth = 0;
  }

  _warn(msg, loc, code=null) { this._warnings.push(new CompilerWarning(msg, loc?.line, loc?.col, code)); }
  _error(msg, loc, code=null, extra={}) { this._errors.push({phase:"semantic",message:msg,line:loc?.line,col:loc?.col,code,...extra}); }

  analyze() {
    for (const node of (this.ast?.body ?? [])) this._visitTop(node);
    return { errors: this._errors, warnings: this._warnings, symbolTable: this.symbols };
  }

  _visitTop(node) {
    if (!node) return;
    switch (node.type) {
      case "PreprocessorDirective":
        if (node.directive === "include") {
          const header = extractHeader(node.value);
          const fns = STDLIB_FUNCTIONS[header];
          if (fns) for (const fn of fns)
            if (!this.symbols.functions.has(fn))
              this.symbols.functions.set(fn, {returnType:null,params:[],builtin:true});
        }
        break;
      case "FunctionDeclaration":  this._visitFuncDecl(node);  break;
      case "FunctionPrototype":
        this.symbols.functions.set(node.name, {returnType:node.returnType,params:node.params});
        break;
      case "VariableDeclaration":  this._visitVarDecl(node);   break;
      case "StructDeclaration":    if(node.name) this.symbols.structs.set(node.name, node.members); break;
      case "EnumDeclaration":
        if (node.name) {
          this.symbols.enums.set(node.name, node.members);
          for (const m of node.members??[])
            if (m.name && !this.symbols.isDeclaredInCurrentScope(m.name))
              this.symbols.declare(m.name,"int",m.loc?.line,m.loc?.col);
        }
        break;
      case "TypedefDeclaration":
        this.symbols.typedefs.set(node.alias, node.typeSpec);
        break;
    }
  }

  _visitFuncDecl(node) {
    this.symbols.functions.set(node.name, {returnType:node.returnType,params:node.params??[]});
    if (node.name==="main") {
      const ret = node.returnType?.base;
      if (ret && ret!=="int") this._warn(`main() should return 'int', found '${ret}'`, node.loc);
    }
    this.symbols.enter();
    const prev = this.currentFunction;
    this.currentFunction = node;
    const seen = new Set();
    for (const p of node.params??[]) {
      if (!p.name) continue;
      if (seen.has(p.name)) this._error(`Duplicate parameter '${p.name}'`, p.loc, ErrorCode.SEM_DUPLICATE_PARAM);
      else { seen.add(p.name); this.symbols.declare(p.name, p.typeSpec?.base, p.loc?.line, p.loc?.col); }
    }
    if (node.body?.type==="BlockStatement") this._visitBlockBody(node.body.body);
    this.currentFunction = prev;
    this.symbols.exit();
  }

  _visitBlock(node) { this.symbols.enter(); this._visitBlockBody(node.body??[]); this.symbols.exit(); }

  _visitBlockBody(stmts) { for (const s of stmts??[]) this._visitStmt(s); }

  _visitStmt(node) {
    if (!node) return;
    switch (node.type) {
      case "VariableDeclaration":  this._visitVarDecl(node);        break;
      case "BlockStatement":       this._visitBlock(node);           break;
      case "IfStatement":          this._visitExpr(node.test); this._visitStmt(node.consequent); if(node.alternate) this._visitStmt(node.alternate); break;
      case "WhileStatement":       this._visitExpr(node.test); this.loopDepth++; this._visitStmt(node.body); this.loopDepth--; break;
      case "DoWhileStatement":     this.loopDepth++; this._visitStmt(node.body); this.loopDepth--; this._visitExpr(node.test); break;
      case "ForStatement":
        this.symbols.enter();
        if(node.init) this._visitStmt(node.init);
        if(node.test) this._visitExpr(node.test);
        if(node.update) this._visitExpr(node.update);
        this.loopDepth++; this._visitStmt(node.body); this.loopDepth--;
        this.symbols.exit();
        break;
      case "SwitchStatement":
        this._visitExpr(node.discriminant);
        this.loopDepth++;
        for (const c of node.cases??[]) { if(c.test) this._visitExpr(c.test); for(const s of c.body??[]) this._visitStmt(s); }
        this.loopDepth--;
        break;
      case "ReturnStatement":
        const retBase = this.currentFunction?.returnType?.base;
        if (retBase==="void" && node.argument) this._warn(`Function '${this.currentFunction?.name}' is void but returns a value`, node.loc);
        if (retBase && retBase!=="void" && !node.argument) this._warn(`Function '${this.currentFunction?.name}' should return '${retBase}'`, node.loc, ErrorCode.SEM_MISSING_RETURN);
        if (node.argument) this._visitExpr(node.argument);
        break;
      case "ExpressionStatement":  this._visitExpr(node.expression); break;
      case "LabeledStatement":     this._visitStmt(node.body);       break;
      case "BreakStatement":
        if (this.loopDepth===0) this._warn("'break' used outside loop or switch", node.loc);
        break;
      case "ContinueStatement":
        if (this.loopDepth===0) this._warn("'continue' used outside loop", node.loc);
        break;
    }
  }

  _visitVarDecl(node) {
    const base = node.typeSpec?.base;
    for (const decl of node.declarators??[]) {
      if (this.symbols.isDeclaredInCurrentScope(decl.name)) {
        this._error(`Redeclaration of '${decl.name}'`, node.loc, ErrorCode.SEM_REDECLARATION);
      } else {
        this.symbols.declare(decl.name, base, node.loc?.line, node.loc?.col);
      }
      if (decl.init) {
        const isPointer = (decl.pointerLevel??0)>0 || (node.typeSpec?.pointerLevel??0)>0;
        if (!isPointer) this.validator.validateInit(base, decl.init, node.loc, decl.name);
        this._visitExpr(decl.init);
      }
    }
  }

  _visitExpr(node) {
    if (!node) return;
    switch (node.type) {
      case "Identifier":
        if (!this.symbols.lookup(node.name) && !this.symbols.functions.has(node.name))
          this._warn(`'${node.name}' used before declaration`, node.loc, ErrorCode.SEM_UNDECLARED);
        break;
      case "CallExpression":
        if (node.callee?.type==="Identifier" && !this.symbols.functions.has(node.callee.name))
          this._warn(`Implicit declaration of function '${node.callee.name}'`, node.loc, ErrorCode.SEM_IMPLICIT_DECL);
        this._visitExpr(node.callee);
        for (const a of node.arguments??[]) this._visitExpr(a);
        break;
      case "AssignmentExpression":
        this._visitExpr(node.left);
        this._visitExpr(node.right);
        if (node.operator==="=" && node.left?.type==="Identifier") {
          const sym = this.symbols.lookup(node.left.name);
          if (sym?.type && node.right?.type==="Literal")
            this.validator.validateInit(sym.type, node.right, node.loc, node.left.name);
        }
        break;
      case "BinaryExpression":
        this._visitExpr(node.left);
        this._visitExpr(node.right);
        if ((node.operator==="/"||node.operator==="%") && node.right?.type==="Literal" && parseNumericLiteral(node.right.raw)===0)
          this._error(`Division by zero detected`, node.loc, ErrorCode.SEM_INVALID_OPERAND);
        break;
      case "UnaryExpression":
      case "AddressOfExpression":
      case "DereferenceExpression":
        this._visitExpr(node.argument);
        break;
      case "ArraySubscript":
        this._visitExpr(node.array);
        this._visitExpr(node.index);
        break;
      case "MemberExpression":
      case "ArrowExpression":
        this._visitExpr(node.object);
        break;
      case "ConditionalExpression":
        this._visitExpr(node.test);
        this._visitExpr(node.consequent);
        this._visitExpr(node.alternate);
        break;
      case "CastExpression":
        this._visitExpr(node.expression);
        break;
    }
  }
}

// ─── AST Metrics ─────────────────────────────────────────────────────────────
function measureDepth(node, depth=0) {
  if (!node || typeof node!=="object") return depth;
  let max = depth;
  for (const key of Object.keys(node)) {
    if (key==="loc"||key==="type") continue;
    const val = node[key];
    if (Array.isArray(val)) for (const c of val) max=Math.max(max,measureDepth(c,depth+1));
    else if (val?.type) max=Math.max(max,measureDepth(val,depth+1));
  }
  return max;
}
function countNodes(node) {
  if (!node||typeof node!=="object"||!node.type) return 0;
  let count=1;
  for (const key of Object.keys(node)) {
    if (key==="loc") continue;
    const val=node[key];
    if (Array.isArray(val)) for(const c of val) count+=countNodes(c);
    else if (val?.type) count+=countNodes(val);
  }
  return count;
}
function countByType(ast, type) {
  let n=0;
  function walk(node) {
    if (!node||typeof node!=="object") return;
    if (node.type===type) n++;
    for (const key of Object.keys(node)) {
      if (key==="loc") continue;
      const val=node[key];
      if (Array.isArray(val)) val.forEach(walk);
      else if (val?.type) walk(val);
    }
  }
  walk(ast); return n;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function analyze(source) {
  const { tokens, errors: lexErrors }   = tokenize(source);
  const parseableTokens = tokens.filter(t => t.type !== "ERROR");
  const { ast, errors: parseErrors }    = parse(parseableTokens);
  const semantic = new SemanticAnalyzer(ast);
  const { errors: semErrors, warnings, symbolTable } = semantic.analyze();

  const errors = [
    ...lexErrors.map(e  => new CompilerError(e)),
    ...parseErrors.map(e => new CompilerError(e)),
    ...semErrors.map(e   => new CompilerError(e)),
  ].sort((a,b) => (a.line??0)-(b.line??0)||(a.col??0)-(b.col??0));

  const tokenCounts = {};
  for (const t of tokens) tokenCounts[t.type] = (tokenCounts[t.type]??0)+1;

  const stats = {
    totalTokens:       tokens.length,
    errorTokens:       tokens.filter(t=>t.type==="ERROR").length,
    totalErrors:       errors.length,
    lexErrors:         lexErrors.length,
    parseErrors:       parseErrors.length,
    semanticErrors:    semErrors.length,
    warnings:          warnings.length,
    tokenCounts,
    astDepth:          measureDepth(ast),
    nodeCount:         countNodes(ast),
    functionCount:     countByType(ast,"FunctionDeclaration"),
    structCount:       countByType(ast,"StructDeclaration"),
    pointerCount:      countByType(ast,"DereferenceExpression")+countByType(ast,"AddressOfExpression"),
    preprocessorCount: countByType(ast,"PreprocessorDirective"),
    loopCount:         countByType(ast,"ForStatement")+countByType(ast,"WhileStatement")+countByType(ast,"DoWhileStatement"),
    callCount:         countByType(ast,"CallExpression"),
  };

  return { tokens, ast, errors, warnings, symbolTable, stats, source };
}

export function summarize({ stats, errors, warnings }) {
  const lines = [
    "── Analysis Summary ──────────────────",
    `Tokens        : ${stats.totalTokens}`,
    `AST nodes     : ${stats.nodeCount}`,
    `Functions     : ${stats.functionCount}`,
    `Structs       : ${stats.structCount}`,
    `Preprocessor  : ${stats.preprocessorCount}`,
    `Errors        : ${stats.totalErrors} (${stats.lexErrors} lex, ${stats.parseErrors} parse, ${stats.semanticErrors} semantic)`,
    `Warnings      : ${stats.warnings}`,
    "──────────────────────────────────────",
  ];
  if (errors.length)   { lines.push(""); errors.forEach(e   => lines.push(`  ERR:  ${e.toString()}`)); }
  if (warnings.length) { lines.push(""); warnings.forEach(w => lines.push(`  WARN: [${w.line}:${w.col}] ${w.message}`)); }
  return lines.join("\n");
}
