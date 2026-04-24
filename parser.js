/**
 * parser.js — Phase 2: C Language Recursive-Descent Parser
 *
 * Grammar (simplified C):
 *
 *   program         → (preprocessor | declaration)*
 *   declaration     → structDecl | unionDecl | enumDecl | typedefDecl
 *                   | funcDecl | funcPrototype | varDecl
 *
 *   typeSpecifier   → qualifier* baseType pointer*
 *   baseType        → TYPE | "struct" IDENT | "union" IDENT | "enum" IDENT
 *   qualifier       → "const" | "volatile" | "unsigned" | "signed"
 *                   | "long" | "short" | "static" | "extern" | "inline"
 *   pointer         → "*" "const"?
 *
 *   funcDecl        → typeSpecifier IDENT "(" params ")" (block | ";")
 *   params          → (typeSpecifier IDENT? ("," typeSpecifier IDENT?)*)?
 *   varDecl         → typeSpecifier declarator ("," declarator)* ";"
 *   declarator      → "*"* IDENT ("[" expr? "]")? ("=" expr)?
 *
 *   structDecl      → "struct" IDENT? "{" memberDecl* "}" IDENT? ";"
 *   enumDecl        → "enum"   IDENT? "{" enumMember ("," enumMember)* "}" ";"
 *   typedefDecl     → "typedef" typeSpecifier IDENT ";"
 *
 *   statement       → ifStmt | whileStmt | doWhileStmt | forStmt
 *                   | switchStmt | returnStmt | breakStmt | continueStmt
 *                   | gotoStmt | labeledStmt | block | varDecl | exprStmt
 *
 *   expr            → assignment
 *   assignment      → ternary (ASSIGN_OP assignment)*
 *   ternary         → logical ("?" expr ":" expr)?
 *   logical         → bitwise (("&&" | "||") bitwise)*
 *   bitwise         → equality (("&" | "|" | "^") equality)*
 *   equality        → relational (("==" | "!=") relational)*
 *   relational      → shift (("<"|">"|"<="|">=") shift)*
 *   shift           → additive (("<<" | ">>") additive)*
 *   additive        → multiplicative (("+" | "-") multiplicative)*
 *   multiplicative  → cast (("*" | "/" | "%") cast)*
 *   cast            → "(" typeSpecifier ")" cast | unary
 *   unary           → ("!" | "~" | "-" | "+" | "++" | "--"
 *                   |  "&" | "*" | "sizeof") unary | postfix
 *   postfix         → primary ("++" | "--" | "[" expr "]"
 *                   |  "." IDENT | "->" IDENT | "(" args ")")*
 *   primary         → LITERAL | IDENT | "(" expr ")"
 */

"use strict";

import * as AST from "./ast.js";

// ─── ParseError ──────────────────────────────────────────────────────────────

export class ParseError {
  constructor(message, line, col, expected, got) {
    this.phase    = "parser";
    this.message  = message;
    this.line     = line;
    this.col      = col;
    this.expected = expected ?? null;
    this.got      = got ?? null;
  }
}

// ─── Type qualifier / specifier sets ─────────────────────────────────────────

const TYPE_QUALIFIERS = new Set([
  "const", "volatile", "unsigned", "signed",
  "long", "short", "static", "extern", "inline",
  "register", "auto", "restrict"
]);

const BASE_TYPES = new Set([
  "int", "float", "double", "char", "void"
]);

const ASSIGN_OPS = new Set([
  "=", "+=", "-=", "*=", "/=", "%=",
  "&=", "|=", "^=", "<<=", ">>="
]);

// ─── Parser ──────────────────────────────────────────────────────────────────

export class Parser {
  constructor(tokens) {
    this.tokens = tokens.filter(t => t.type !== "COMMENT");
    this.pos    = 0;
    this.errors = [];
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  peek(offset = 0) {
    return this.tokens[this.pos + offset] ?? { type: "EOF", value: "EOF", line: 0, col: 0 };
  }

  consume() {
    return this.tokens[this.pos++] ?? { type: "EOF", value: "EOF", line: 0, col: 0 };
  }

  loc() {
    const t = this.peek();
    return { line: t.line, col: t.col };
  }

  match(type, value) {
    const t = this.peek();
    if (value !== undefined ? t.value === value : t.type === type) return this.consume();
    return null;
  }

  expect(type, value) {
    const t = this.peek();
    const ok = value !== undefined ? t.value === value : t.type === type;
    if (ok && t.type !== "EOF") return this.consume();
    const label = value ?? type;
    this.errors.push(new ParseError(
      `Expected '${label}' but got '${t.value}'`,
      t.line, t.col, label, t.value
    ));
    return null;
  }

  isAtEnd() { return this.peek().type === "EOF"; }

  synchronize(...values) {
    while (!this.isAtEnd()) {
      const t = this.peek();
      if (values.includes(t.value) || values.includes(t.type)) return;
      if (t.value === "}" || t.value === ";") return;
      if (t.type === "TYPE" || t.type === "KEYWORD") return;
      this.consume();
    }
  }

  // ── Type helpers ──────────────────────────────────────────────────────────

  isTypeStart() {
    const t = this.peek();
    return t.type === "TYPE" || TYPE_QUALIFIERS.has(t.value) ||
           t.value === "struct" || t.value === "union" || t.value === "enum";
  }

  parseTypeSpecifier() {
    const loc = this.loc();
    const qualifiers = [];

    // Collect qualifiers
    while (TYPE_QUALIFIERS.has(this.peek().value) || this.peek().type === "TYPE") {
      const t = this.peek();
      // Stop if it looks like a variable name follows (IDENTIFIER after type)
      if (t.type === "TYPE" && BASE_TYPES.has(t.value)) {
        qualifiers.push(this.consume().value);
        break;
      }
      if (TYPE_QUALIFIERS.has(t.value)) {
        qualifiers.push(this.consume().value);
      } else {
        break;
      }
    }

    // Base type
    let base = "int"; // default fallback
    const t = this.peek();
    if (t.type === "TYPE") {
      base = this.consume().value;
    } else if (t.value === "struct" || t.value === "union" || t.value === "enum") {
      base = this.consume().value;
      if (this.peek().type === "IDENTIFIER") base += " " + this.consume().value;
    }

    // Pointer levels
    let pointerLevel = 0;
    while (this.peek().value === "*") {
      this.consume();
      pointerLevel++;
      if (this.peek().value === "const") { this.consume(); qualifiers.push("const*"); }
    }

    return AST.TypeSpecifier(base, qualifiers, pointerLevel, false, null, loc);
  }

  // ── Program ───────────────────────────────────────────────────────────────

  parse() {
    const loc  = this.loc();
    const body = [];

    while (!this.isAtEnd()) {
      try {
        // Preprocessor directive
        if (this.peek().type === "PREPROCESSOR") {
          body.push(this.parsePreprocessor());
          continue;
        }
        // typedef
        if (this.peek().value === "typedef") {
          body.push(this.parseTypedef());
          continue;
        }
        // struct / union / enum at top level
        if (this.peek().value === "struct") { body.push(this.parseStructDecl()); continue; }
        if (this.peek().value === "union")  { body.push(this.parseUnionDecl());  continue; }
        if (this.peek().value === "enum")   { body.push(this.parseEnumDecl());   continue; }

        // Function or variable declaration
        if (this.isTypeStart()) {
          body.push(this.parseFuncOrVar());
          continue;
        }

        // Unknown top-level token
        const bad = this.peek();
        this.errors.push(new ParseError(
          `Unexpected top-level token '${bad.value}'`,
          bad.line, bad.col
        ));
        this.consume();
        this.synchronize(";");
        this.match("PUNCT", ";");

      } catch (e) {
        this.errors.push(new ParseError(e.message, this.peek().line, this.peek().col));
        this.synchronize(";", "}");
        this.match("PUNCT", ";");
      }
    }

    return { ast: AST.Program(body, loc), errors: this.errors };
  }

  // ── Preprocessor ──────────────────────────────────────────────────────────

  parsePreprocessor() {
    const loc = this.loc();
    const raw = this.consume().value; // e.g. "#include <stdio.h>"

    const spaceIdx = raw.indexOf(" ");
    let directive  = raw.slice(1, spaceIdx > 0 ? spaceIdx : undefined); // "include"
    let value      = spaceIdx > 0 ? raw.slice(spaceIdx + 1).trim() : ""; // "<stdio.h>"

    return AST.PreprocessorDirective(directive, value, loc);
  }

  // ── Typedef ───────────────────────────────────────────────────────────────

  parseTypedef() {
    const loc = this.loc();
    this.consume(); // "typedef"
    const typeSpec = this.parseTypeSpecifier();
    let alias = "?";
    if (this.peek().type === "IDENTIFIER") alias = this.consume().value;
    else this.errors.push(new ParseError(
      "Expected alias name after typedef", this.peek().line, this.peek().col
    ));
    this.expect("PUNCT", ";");
    return AST.TypedefDeclaration(typeSpec, alias, loc);
  }

  // ── Struct / Union / Enum ─────────────────────────────────────────────────

  parseStructDecl() {
    const loc = this.loc();
    this.consume(); // "struct"
    let name = null;
    if (this.peek().type === "IDENTIFIER") name = this.consume().value;

    let members = [];
    if (this.peek().value === "{") {
      this.consume();
      while (this.peek().value !== "}" && !this.isAtEnd()) {
        if (this.isTypeStart()) members.push(this.parseVarDecl());
        else { this.consume(); }
      }
      this.expect("PUNCT", "}");
    }

    // Optional variable name after struct definition: struct Point p;
    let varName = null;
    if (this.peek().type === "IDENTIFIER") varName = this.consume().value;
    this.match("PUNCT", ";");

    return AST.StructDeclaration(name, members, loc);
  }

  parseUnionDecl() {
    const loc = this.loc();
    this.consume(); // "union"
    let name = null;
    if (this.peek().type === "IDENTIFIER") name = this.consume().value;
    let members = [];
    if (this.peek().value === "{") {
      this.consume();
      while (this.peek().value !== "}" && !this.isAtEnd()) {
        if (this.isTypeStart()) members.push(this.parseVarDecl());
        else this.consume();
      }
      this.expect("PUNCT", "}");
    }
    this.match("PUNCT", ";");
    return AST.UnionDeclaration(name, members, loc);
  }

  parseEnumDecl() {
    const loc = this.loc();
    this.consume(); // "enum"
    let name = null;
    if (this.peek().type === "IDENTIFIER") name = this.consume().value;
    const members = [];
    if (this.peek().value === "{") {
      this.consume();
      while (this.peek().value !== "}" && !this.isAtEnd()) {
        const mLoc  = this.loc();
        const mName = this.peek().type === "IDENTIFIER" ? this.consume().value : "?";
        let   mVal  = null;
        if (this.peek().value === "=") { this.consume(); mVal = this.parseExpression(); }
        members.push(AST.EnumMember(mName, mVal, mLoc));
        if (this.peek().value === ",") this.consume();
        else break;
      }
      this.expect("PUNCT", "}");
    }
    this.match("PUNCT", ";");
    return AST.EnumDeclaration(name, members, loc);
  }

  // ── Function or variable (ambiguous until we see '(' or not) ─────────────

  parseFuncOrVar() {
    const loc      = this.loc();
    const typeSpec = this.parseTypeSpecifier();

    // Need a name
    let name = "?";
    if (this.peek().type === "IDENTIFIER") {
      name = this.consume().value;
    } else {
      this.errors.push(new ParseError(
        `Expected identifier, got '${this.peek().value}'`,
        this.peek().line, this.peek().col
      ));
    }

    // If followed by '(' → function
    if (this.peek().value === "(") {
      return this.parseFunctionDeclaration(typeSpec, name, loc);
    }

    // Otherwise variable declaration — name may have been the first declarator
    return this.parseVarDeclFromName(typeSpec, name, loc);
  }

  parseFunctionDeclaration(returnType, name, loc) {
    this.consume(); // "("
    const params = this.parseParamList();
    this.expect("PUNCT", ")");

    // Prototype
    if (this.peek().value === ";") {
      this.consume();
      return AST.FunctionPrototype(returnType, name, params, loc);
    }

    // Full definition
    const body = this.peek().value === "{"
      ? this.parseBlock()
      : (this.errors.push(new ParseError(
          "Expected '{' to open function body",
          this.peek().line, this.peek().col
        )), AST.MissingBlock(this.loc()));

    return AST.FunctionDeclaration(returnType, name, params, body, loc);
  }

  parseParamList() {
    const params = [];
    if (this.peek().value === ")") return params;
    // void alone = no params
    if (this.peek().value === "void" && this.peek(1)?.value === ")") {
      this.consume();
      return params;
    }
    // Variadic ...
    if (this.peek().value === "...") { this.consume(); return params; }

    while (!this.isAtEnd() && this.peek().value !== ")") {
      if (this.peek().value === "...") { this.consume(); break; }
      const pLoc = this.loc();
      if (!this.isTypeStart()) {
        this.errors.push(new ParseError(
          `Expected type in parameter list, got '${this.peek().value}'`,
          this.peek().line, this.peek().col
        ));
        this.consume();
        break;
      }
      const typeSpec = this.parseTypeSpecifier();
      let pName = null;
      if (this.peek().type === "IDENTIFIER") pName = this.consume().value;
      // Array param: name[]
      if (this.peek().value === "[") { this.consume(); this.match("PUNCT", "]"); }
      params.push(AST.ParameterDeclaration(typeSpec, pName, pLoc));
      if (this.peek().value === ",") this.consume();
      else break;
    }
    return params;
  }

  // ── Variable declarations ─────────────────────────────────────────────────

  parseVarDecl() {
    const loc      = this.loc();
    const typeSpec = this.parseTypeSpecifier();
    return this.parseVarDeclFromName(typeSpec, null, loc);
  }

  parseVarDeclFromName(typeSpec, firstName, loc) {
    const declarators = [];

    const parseDeclarator = (name) => {
      const dLoc = this.loc();
      let ptr = 0;
      // Extra pointer stars (e.g. int *p or int **pp)
      while (this.peek().value === "*") { this.consume(); ptr++; }

      let dName = name;
      if (!dName) {
        if (this.peek().type === "IDENTIFIER") dName = this.consume().value;
        else {
          this.errors.push(new ParseError(
            `Expected variable name, got '${this.peek().value}'`,
            this.peek().line, this.peek().col
          ));
          dName = "?";
        }
      }

      // Array size
      let arraySize = null;
      if (this.peek().value === "[") {
        this.consume();
        if (this.peek().value !== "]") arraySize = this.parseExpression();
        this.expect("PUNCT", "]");
      }

      // Initialiser
      let init = null;
      if (this.peek().value === "=") {
        this.consume();
        init = this.parseExpression();
      }

      declarators.push(AST.Declarator(dName, ptr, arraySize, init, dLoc));
    };

    parseDeclarator(firstName);

    while (this.peek().value === ",") {
      this.consume();
      parseDeclarator(null);
    }

    this.expect("PUNCT", ";");
    return AST.VariableDeclaration(typeSpec, declarators, loc);
  }

  // ── Statements ────────────────────────────────────────────────────────────

  parseStatement() {
    const t = this.peek();

    if (t.value === "if")       return this.parseIfStatement();
    if (t.value === "while")    return this.parseWhileStatement();
    if (t.value === "do")       return this.parseDoWhileStatement();
    if (t.value === "for")      return this.parseForStatement();
    if (t.value === "switch")   return this.parseSwitchStatement();
    if (t.value === "return")   return this.parseReturnStatement();
    if (t.value === "break")    { const loc=this.loc(); this.consume(); this.expect("PUNCT",";"); return AST.BreakStatement(loc); }
    if (t.value === "continue") { const loc=this.loc(); this.consume(); this.expect("PUNCT",";"); return AST.ContinueStatement(loc); }
    if (t.value === "goto")     return this.parseGotoStatement();
    if (t.value === "{")        return this.parseBlock();
    if (t.value === ";")        { const loc=this.loc(); this.consume(); return AST.EmptyStatement(loc); }

    // Labeled statement:  label:
    if (t.type === "IDENTIFIER" && this.peek(1)?.value === ":") {
      const loc   = this.loc();
      const label = this.consume().value;
      this.consume(); // ":"
      const body  = this.parseStatement();
      return AST.LabeledStatement(label, body, loc);
    }

    // Variable declaration inside block
    if (this.isTypeStart()) return this.parseVarDecl();

    return this.parseExpressionStatement();
  }

  parseBlock() {
    const loc = this.loc();
    this.expect("PUNCT", "{");
    const body = [];
    while (this.peek().value !== "}" && !this.isAtEnd()) {
      try { body.push(this.parseStatement()); }
      catch (e) {
        this.errors.push(new ParseError(e.message, this.peek().line, this.peek().col));
        this.synchronize(";", "}");
        this.match("PUNCT", ";");
      }
    }
    this.expect("PUNCT", "}");
    return AST.BlockStatement(body, loc);
  }

  parseIfStatement() {
    const loc = this.loc();
    this.consume(); // "if"
    this.expect("PUNCT", "(");
    const test = this.parseExpression();
    this.expect("PUNCT", ")");
    const consequent = this.parseStatement();
    let alternate = null;
    if (this.peek().value === "else") {
      this.consume();
      alternate = this.parseStatement();
    }
    return AST.IfStatement(test, consequent, alternate, loc);
  }

  parseWhileStatement() {
    const loc = this.loc();
    this.consume(); // "while"
    this.expect("PUNCT", "(");
    const test = this.parseExpression();
    this.expect("PUNCT", ")");
    const body = this.parseStatement();
    return AST.WhileStatement(test, body, loc);
  }

  parseDoWhileStatement() {
    const loc = this.loc();
    this.consume(); // "do"
    const body = this.parseBlock();
    this.expect("KEYWORD", "while");
    this.expect("PUNCT", "(");
    const test = this.parseExpression();
    this.expect("PUNCT", ")");
    this.expect("PUNCT", ";");
    return AST.DoWhileStatement(body, test, loc);
  }

  parseForStatement() {
    const loc = this.loc();
    this.consume(); // "for"
    this.expect("PUNCT", "(");

    let init = null;
    if (this.peek().value !== ";") {
      if (this.isTypeStart()) init = this.parseVarDecl();
      else { init = this.parseExpressionStatement(); }
    } else { this.consume(); }

    const test = this.peek().value !== ";" ? this.parseExpression() : null;
    this.match("PUNCT", ";");
    const update = this.peek().value !== ")" ? this.parseExpression() : null;
    this.expect("PUNCT", ")");
    const body = this.parseStatement();
    return AST.ForStatement(init, test, update, body, loc);
  }

  parseSwitchStatement() {
    const loc = this.loc();
    this.consume(); // "switch"
    this.expect("PUNCT", "(");
    const discriminant = this.parseExpression();
    this.expect("PUNCT", ")");
    this.expect("PUNCT", "{");

    const cases = [];
    while (this.peek().value !== "}" && !this.isAtEnd()) {
      const cLoc = this.loc();
      if (this.peek().value === "case") {
        this.consume();
        const test = this.parseExpression();
        this.expect("PUNCT", ":");
        const body = [];
        while (!["case","default","}"].includes(this.peek().value) && !this.isAtEnd()) {
          body.push(this.parseStatement());
        }
        cases.push(AST.CaseClause(test, body, cLoc));
      } else if (this.peek().value === "default") {
        this.consume();
        this.expect("PUNCT", ":");
        const body = [];
        while (!["case","default","}"].includes(this.peek().value) && !this.isAtEnd()) {
          body.push(this.parseStatement());
        }
        cases.push(AST.CaseClause(null, body, cLoc));
      } else {
        this.consume();
      }
    }
    this.expect("PUNCT", "}");
    return AST.SwitchStatement(discriminant, cases, loc);
  }

  parseReturnStatement() {
    const loc = this.loc();
    this.consume(); // "return"
    const isVoid = this.peek().value === ";" || this.peek().type === "EOF" || this.peek().value === "}";
    const arg = isVoid ? null : this.parseExpression();
    this.expect("PUNCT", ";");
    return AST.ReturnStatement(arg, loc);
  }

  parseGotoStatement() {
    const loc = this.loc();
    this.consume(); // "goto"
    const label = this.peek().type === "IDENTIFIER" ? this.consume().value : "?";
    this.expect("PUNCT", ";");
    return AST.GotoStatement(label, loc);
  }

  parseExpressionStatement() {
    const loc  = this.loc();
    const expr = this.parseExpression();
    this.expect("PUNCT", ";");
    return AST.ExpressionStatement(expr, loc);
  }

  // ── Expressions ───────────────────────────────────────────────────────────

  parseExpression() { return this.parseAssignment(); }

  parseAssignment() {
    const loc  = this.loc();
    const left = this.parseTernary();
    if (this.peek().type === "OPERATOR" && ASSIGN_OPS.has(this.peek().value)) {
      const op    = this.consume().value;
      const right = this.parseAssignment();
      return AST.AssignmentExpression(op, left, right, loc);
    }
    return left;
  }

  parseTernary() {
    const loc  = this.loc();
    const test = this.parseLogical();
    if (this.peek().value === "?") {
      this.consume();
      const consequent = this.parseExpression();
      this.expect("PUNCT", ":");
      const alternate = this.parseExpression();
      return AST.ConditionalExpression(test, consequent, alternate, loc);
    }
    return test;
  }

  parseLogical() {
    let left = this.parseBitwise();
    while (this.peek().value === "&&" || this.peek().value === "||") {
      const loc = this.loc();
      const op  = this.consume().value;
      left = AST.BinaryExpression(op, left, this.parseBitwise(), loc);
    }
    return left;
  }

  parseBitwise() {
    let left = this.parseEquality();
    while (["&","|","^"].includes(this.peek().value) &&
           !["&&","||","&=","|=","^="].includes(this.peek().value)) {
      const loc = this.loc();
      const op  = this.consume().value;
      left = AST.BinaryExpression(op, left, this.parseEquality(), loc);
    }
    return left;
  }

  parseEquality() {
    let left = this.parseRelational();
    while (this.peek().value === "==" || this.peek().value === "!=") {
      const loc = this.loc();
      const op  = this.consume().value;
      left = AST.BinaryExpression(op, left, this.parseRelational(), loc);
    }
    return left;
  }

  parseRelational() {
    let left = this.parseShift();
    while (["<",">","<=",">="].includes(this.peek().value)) {
      const loc = this.loc();
      const op  = this.consume().value;
      left = AST.BinaryExpression(op, left, this.parseShift(), loc);
    }
    return left;
  }

  parseShift() {
    let left = this.parseAdditive();
    while (this.peek().value === "<<" || this.peek().value === ">>") {
      const loc = this.loc();
      const op  = this.consume().value;
      left = AST.BinaryExpression(op, left, this.parseAdditive(), loc);
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.peek().value === "+" || this.peek().value === "-") {
      const loc = this.loc();
      const op  = this.consume().value;
      left = AST.BinaryExpression(op, left, this.parseMultiplicative(), loc);
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseCast();
    while (["*","/","%"].includes(this.peek().value)) {
      const loc = this.loc();
      const op  = this.consume().value;
      left = AST.BinaryExpression(op, left, this.parseCast(), loc);
    }
    return left;
  }

  parseCast() {
    // Look-ahead: "(" TYPE ... ")" — cast expression
    if (this.peek().value === "(" && this.isCastAhead()) {
      const loc = this.loc();
      this.consume(); // "("
      const targetType = this.parseTypeSpecifier();
      this.expect("PUNCT", ")");
      const expr = this.parseCast();
      return AST.CastExpression(targetType, expr, loc);
    }
    return this.parseUnary();
  }

  isCastAhead() {
    // Peek past "(" to see if it looks like a type
    let i = 1;
    const t = this.tokens[this.pos + i];
    return t && (t.type === "TYPE" || TYPE_QUALIFIERS.has(t.value));
  }

  parseUnary() {
    const loc = this.loc();
    const t   = this.peek();

    if (t.value === "!" || t.value === "~" || t.value === "-" || t.value === "+") {
      const op = this.consume().value;
      return AST.UnaryExpression(op, this.parseUnary(), true, loc);
    }
    if (t.value === "++" || t.value === "--") {
      const op = this.consume().value;
      return AST.UnaryExpression(op, this.parseUnary(), true, loc);
    }
    if (t.value === "&") {
      this.consume();
      return AST.AddressOfExpression(this.parseUnary(), loc);
    }
    if (t.value === "*") {
      this.consume();
      return AST.DereferenceExpression(this.parseUnary(), loc);
    }
    if (t.value === "sizeof") {
      this.consume();
      if (this.peek().value === "(" && this.isCastAhead()) {
        this.consume();
        const typeSpec = this.parseTypeSpecifier();
        this.expect("PUNCT", ")");
        return AST.SizeofExpression(typeSpec, true, loc);
      }
      return AST.SizeofExpression(this.parseUnary(), false, loc);
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();
    while (true) {
      const loc = this.loc();
      const t   = this.peek();
      if (t.value === "++" || t.value === "--") {
        expr = AST.UnaryExpression(this.consume().value, expr, false, loc);
      } else if (t.value === "[") {
        this.consume();
        const index = this.parseExpression();
        this.expect("PUNCT", "]");
        expr = AST.ArraySubscript(expr, index, loc);
      } else if (t.value === ".") {
        this.consume();
        const prop = this.peek().type === "IDENTIFIER" ? this.consume().value : "?";
        expr = AST.MemberExpression(expr, prop, false, loc);
      } else if (t.value === "->") {
        this.consume();
        const member = this.peek().type === "IDENTIFIER" ? this.consume().value : "?";
        expr = AST.ArrowExpression(expr, member, loc);
      } else if (t.value === "(") {
        this.consume();
        const args = this.parseArguments();
        this.expect("PUNCT", ")");
        expr = AST.CallExpression(expr, args, loc);
      } else {
        break;
      }
    }
    return expr;
  }

  parseArguments() {
    const args = [];
    while (this.peek().value !== ")" && !this.isAtEnd()) {
      args.push(this.parseExpression());
      if (this.peek().value === ",") this.consume();
      else break;
    }
    return args;
  }

  parsePrimary() {
    const loc = this.loc();
    const t   = this.peek();

    if (t.value === "(") {
      this.consume();
      const expr = this.parseExpression();
      this.expect("PUNCT", ")");
      return expr;
    }

    if (t.type === "NUMBER") {
      const raw = this.consume().value;
      const isFloat = raw.includes(".") || raw.toLowerCase().includes("e") || raw.endsWith("f") || raw.endsWith("F");
      return AST.Literal(raw, isFloat ? "float" : "integer", raw, loc);
    }

    if (t.type === "STRING")       return AST.Literal(t.value.slice(1,-1), "string",  this.consume().value, loc);
    if (t.type === "CHAR_LITERAL") return AST.Literal(t.value.slice(1,-1), "char",    this.consume().value, loc);

    if (t.type === "IDENTIFIER") return AST.Identifier(this.consume().value, loc);

    // Error
    if (t.value === ";" || t.value === "}" || t.type === "EOF") {
      this.errors.push(new ParseError(`Expected expression but got '${t.value}'`, t.line, t.col));
      return AST.MissingExpression(loc);
    }
    this.errors.push(new ParseError(`Unexpected token '${t.value}' in expression`, t.line, t.col));
    this.consume();
    return AST.ErrorNode(`Unexpected '${t.value}'`, t.value, loc);
  }
}

// ─── Convenience ─────────────────────────────────────────────────────────────

export function parse(tokens) {
  return new Parser(tokens).parse();
}
