/**
 * lexer.js — Phase 1: C Language Tokenizer
 *
 * Scans C source code character-by-character and produces a flat
 * array of Token objects. Handles all standard C tokens including
 * preprocessor directives, char literals, pointers, and type keywords.
 *
 * Token types:
 *   KEYWORD | TYPE | IDENTIFIER | NUMBER | STRING | CHAR_LITERAL
 *   PREPROCESSOR | OPERATOR | PUNCT | COMMENT | ERROR
 */

"use strict";

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_KEYWORDS = new Set([
  "int", "float", "double", "char", "void", "long", "short",
  "unsigned", "signed", "struct", "union", "enum", "typedef"
]);

const KEYWORDS = new Set([
  "if", "else", "while", "for", "do", "switch", "case", "default",
  "break", "continue", "return", "goto", "sizeof",
  "static", "extern", "const", "volatile", "register", "auto",
  "inline", "restrict"
]);

const MULTI_CHAR_OPS = new Set([
  "==", "!=", "<=", ">=", "&&", "||",
  "++", "--", "+=", "-=", "*=", "/=", "%=",
  "&=", "|=", "^=", "<<", ">>", "<<=", ">>=",
  "->", "..."
]);

const SINGLE_OPS  = new Set([..."+-*/%=!<>&|^~?:"]);
const PUNCTUATION = new Set([..."(){}[];,."]);

// ─── Token ───────────────────────────────────────────────────────────────────

export class Token {
  constructor(type, value, line, col) {
    this.type  = type;
    this.value = value;
    this.line  = line;
    this.col   = col;
  }
  toString() {
    return `Token(${this.type}, ${JSON.stringify(this.value)}, ${this.line}:${this.col})`;
  }
}

// ─── LexError ────────────────────────────────────────────────────────────────

export class LexError {
  constructor(message, line, col, raw) {
    this.phase   = "lexer";
    this.message = message;
    this.line    = line;
    this.col     = col;
    this.raw     = raw;
  }
}

// ─── Lexer ───────────────────────────────────────────────────────────────────

export class Lexer {
  constructor(source) {
    this.source = source;
    this.pos    = 0;
    this.line   = 1;
    this.col    = 1;
    this.tokens = [];
    this.errors = [];
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  peek(offset = 0) { return this.source[this.pos + offset] ?? null; }

  advance() {
    const ch = this.source[this.pos++];
    if (ch === "\n") { this.line++; this.col = 1; }
    else             { this.col++; }
    return ch;
  }

  snapshot() { return { line: this.line, col: this.col }; }

  emit(type, value, loc) {
    this.tokens.push(new Token(type, value, loc.line, loc.col));
  }

  error(message, loc, raw) {
    this.errors.push(new LexError(message, loc.line, loc.col, raw));
  }

  // ── Whitespace ────────────────────────────────────────────────────────────

  scanWhitespace() {
    while (this.pos < this.source.length && /\s/.test(this.peek())) {
      this.advance();
    }
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  scanLineComment() {
    const loc = this.snapshot();
    let text = "//";
    this.advance(); this.advance();
    while (this.pos < this.source.length && this.peek() !== "\n") {
      text += this.advance();
    }
    this.emit("COMMENT", text, loc);
  }

  scanBlockComment() {
    const loc = this.snapshot();
    let text = "/*";
    this.advance(); this.advance();
    let closed = false;
    while (this.pos < this.source.length) {
      const ch = this.advance();
      text += ch;
      if (ch === "*" && this.peek() === "/") {
        text += this.advance();
        closed = true;
        break;
      }
    }
    if (!closed) this.error("Unterminated block comment", loc, "/*");
    this.emit("COMMENT", text, loc);
  }

  // ── Preprocessor ──────────────────────────────────────────────────────────

  scanPreprocessor() {
    const loc = this.snapshot();
    let text = "";
    // Consume entire line (handle line continuation with \)
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === "\n") {
        // Check for line continuation
        if (text.endsWith("\\")) {
          text = text.slice(0, -1); // remove backslash
          this.advance();           // consume newline
          continue;
        }
        break;
      }
      text += this.advance();
    }
    this.emit("PREPROCESSOR", text.trim(), loc);
  }

  // ── Strings ───────────────────────────────────────────────────────────────

  scanString() {
    const loc = this.snapshot();
    let value = '"';
    this.advance(); // consume opening "
    let closed = false;

    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === "\n") break;
      const consumed = this.advance();
      value += consumed;
      if (consumed === "\\" && this.pos < this.source.length) {
        value += this.advance(); // escape sequence
        continue;
      }
      if (consumed === '"') { closed = true; break; }
    }

    if (!closed) {
      this.error(`Unterminated string literal`, loc, value);
      this.emit("ERROR", value, loc);
    } else {
      this.emit("STRING", value, loc);
    }
  }

  // ── Char literals ─────────────────────────────────────────────────────────

  scanCharLiteral() {
    const loc = this.snapshot();
    let value = "'";
    this.advance(); // consume opening '
    let closed = false;
    let charCount = 0;

    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === "\n") break;
      const consumed = this.advance();
      value += consumed;
      if (consumed === "\\" && this.pos < this.source.length) {
        value += this.advance(); // escape sequence e.g. '\n'
        charCount++;
        continue;
      }
      if (consumed === "'") { closed = true; break; }
      charCount++;
    }

    if (!closed) {
      this.error("Unterminated char literal", loc, value);
      this.emit("ERROR", value, loc);
    } else if (charCount === 0) {
      this.error("Empty char literal", loc, value);
      this.emit("ERROR", value, loc);
    } else if (charCount > 1) {
      this.error(`Multi-character char literal '${value}' (use double quotes for strings)`, loc, value);
      this.emit("CHAR_LITERAL", value, loc); // still emit, just warn
    } else {
      this.emit("CHAR_LITERAL", value, loc);
    }
  }

  // ── Numbers ───────────────────────────────────────────────────────────────

  scanNumber() {
    const loc = this.snapshot();
    let value = "";

    // Hex
    if (this.peek() === "0" && (this.source[this.pos + 1] === "x" || this.source[this.pos + 1] === "X")) {
      value += this.advance() + this.advance();
      while (/[0-9a-fA-F]/.test(this.peek() ?? "")) value += this.advance();
      value += this.scanNumberSuffix();
      this.emit("NUMBER", value, loc);
      return;
    }

    // Octal
    if (this.peek() === "0" && /[0-7]/.test(this.source[this.pos + 1] ?? "")) {
      value += this.advance();
      while (/[0-7]/.test(this.peek() ?? "")) value += this.advance();
      value += this.scanNumberSuffix();
      this.emit("NUMBER", value, loc);
      return;
    }

    // Decimal / float
    while (/[0-9]/.test(this.peek() ?? "")) value += this.advance();

    if (this.peek() === "." && /[0-9]/.test(this.source[this.pos + 1] ?? "")) {
      value += this.advance();
      while (/[0-9]/.test(this.peek() ?? "")) value += this.advance();
    }

    // Exponent
    if (this.peek() === "e" || this.peek() === "E") {
      value += this.advance();
      if (this.peek() === "+" || this.peek() === "-") value += this.advance();
      while (/[0-9]/.test(this.peek() ?? "")) value += this.advance();
    }

    value += this.scanNumberSuffix();

    // Invalid suffix check
    if (/[a-zA-Z_]/.test(this.peek() ?? "")) {
      let bad = value;
      while (/[a-zA-Z0-9_]/.test(this.peek() ?? "")) bad += this.advance();
      this.error(`Invalid numeric literal '${bad}'`, loc, bad);
      this.emit("ERROR", bad, loc);
      return;
    }

    this.emit("NUMBER", value, loc);
  }

  scanNumberSuffix() {
    // C suffixes: u, U, l, L, ul, UL, ull, ULL, f, F
    let suffix = "";
    const suffixChars = /[uUlLfF]/;
    while (suffixChars.test(this.peek() ?? "")) suffix += this.advance();
    return suffix;
  }

  // ── Identifiers / keywords ────────────────────────────────────────────────

  scanWord() {
    const loc = this.snapshot();
    let value = "";
    while (/[a-zA-Z0-9_]/.test(this.peek() ?? "")) value += this.advance();

    if (TYPE_KEYWORDS.has(value)) return this.emit("TYPE",       value, loc);
    if (KEYWORDS.has(value))      return this.emit("KEYWORD",    value, loc);
    this.emit("IDENTIFIER", value, loc);
  }

  // ── Operators ────────────────────────────────────────────────────────────

  scanOperator() {
    const loc = this.snapshot();
    const three = (this.peek(0) ?? "") + (this.peek(1) ?? "") + (this.peek(2) ?? "");
    const two   = three.slice(0, 2);

    if (MULTI_CHAR_OPS.has(three)) {
      this.advance(); this.advance(); this.advance();
      return this.emit("OPERATOR", three, loc);
    }
    if (MULTI_CHAR_OPS.has(two)) {
      this.advance(); this.advance();
      return this.emit("OPERATOR", two, loc);
    }
    this.emit("OPERATOR", this.advance(), loc);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  tokenize() {
    while (this.pos < this.source.length) {
      const ch    = this.peek();
      const col1  = this.col;

      // Whitespace
      if (/\s/.test(ch)) { this.scanWhitespace(); continue; }

      // Preprocessor — # must be first non-whitespace on line
      if (ch === "#") { this.scanPreprocessor(); continue; }

      // Comments
      if (ch === "/" && this.peek(1) === "/") { this.scanLineComment();  continue; }
      if (ch === "/" && this.peek(1) === "*") { this.scanBlockComment(); continue; }

      // String literals
      if (ch === '"') { this.scanString(); continue; }

      // Char literals
      if (ch === "'") { this.scanCharLiteral(); continue; }

      // Numbers
      if (/[0-9]/.test(ch)) { this.scanNumber(); continue; }
      if (ch === "." && /[0-9]/.test(this.peek(1) ?? "")) { this.scanNumber(); continue; }

      // Identifiers / keywords
      if (/[a-zA-Z_]/.test(ch)) { this.scanWord(); continue; }

      // Punctuation
      if (PUNCTUATION.has(ch)) {
        const loc = this.snapshot();
        this.emit("PUNCT", this.advance(), loc);
        continue;
      }

      // Operators
      if (SINGLE_OPS.has(ch)) { this.scanOperator(); continue; }

      // Unknown
      const loc = this.snapshot();
      const bad = this.advance();
      this.error(`Unexpected character '${bad}'`, loc, bad);
      this.emit("ERROR", bad, loc);
    }

    return { tokens: this.tokens, errors: this.errors };
  }
}

// ─── Convenience ─────────────────────────────────────────────────────────────

export function tokenize(source) {
  return new Lexer(source).tokenize();
}
