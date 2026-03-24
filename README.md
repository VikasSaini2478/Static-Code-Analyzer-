# Mini Compiler — Static Syntax Analyzer

A fully client-side, zero-dependency static analyzer that works like
a real compiler front-end: **Lexer → Parser → AST → Error Reporter**.

---

## Project Structure

```
mini-compiler/
├── index.html            # App shell & DOM structure
├── styles/
│   └── main.css          # All styles (tokens, AST, errors, layout)
└── src/
    ├── main.js           # Entry point — calls init()
    ├── lexer.js          # Phase 1: Tokenizer / Scanner
    ├── ast.js            # AST node factory functions
    ├── parser.js         # Phase 2: Recursive-descent parser
    ├── printer.js        # AST pretty-printer (text + HTML)
    ├── analyzer.js       # Orchestrator — ties phases together
    └── ui.js             # DOM controller, rendering, events
```

---

## How to Run

Since the project uses ES Modules (`type="module"`), you need a local
server — you **cannot** just open `index.html` via `file://`.

**Option 1 — VS Code Live Server**
Right-click `index.html` → "Open with Live Server"

**Option 2 — Python**
```bash
cd mini-compiler
python3 -m http.server 8080
# open http://localhost:8080
```

**Option 3 — Node (serve)**
```bash
npx serve mini-compiler
```

---

## Architecture

### Phase 1 — Lexer (`lexer.js`)

The `Lexer` class scans source code character-by-character using a
hand-written state machine. It recognises:

| Token type   | Examples                        |
|--------------|---------------------------------|
| `KEYWORD`    | `function`, `let`, `if`, …      |
| `IDENTIFIER` | `myVar`, `_private`, `$el`      |
| `NUMBER`     | `42`, `3.14`, `0xFF`, `0b1010`  |
| `STRING`     | `"hello"`, `'world'`, `` `tpl` ``|
| `BOOL`       | `true`, `false`                 |
| `NULL`       | `null`, `undefined`             |
| `OPERATOR`   | `+`, `===`, `&&`, `=>`, …       |
| `PUNCT`      | `(`, `)`, `{`, `}`, `;`, …     |
| `COMMENT`    | `// …`, `/* … */`              |
| `ERROR`      | Any unrecognised character      |

Lexical errors (unexpected chars, unterminated strings) are collected
in `Lexer.errors` without halting tokenisation.

### Phase 2 — Parser (`parser.js`)

A recursive-descent parser with one-token lookahead. Implements the
grammar described at the top of `parser.js`. Key features:

- **Pratt-style precedence** for expressions (assignment → ternary →
  logical → equality → relational → additive → multiplicative →
  unary → postfix → call → primary)
- **Error recovery**: `synchronize()` skips to the next safe boundary
  (`}`, `;`, keyword) after a syntax error so parsing continues
- **Error nodes**: `MissingExpression`, `MissingBlock` preserve tree
  structure even when tokens are absent

### AST (`ast.js`)

All 30+ node types are pure factory functions. Every node carries:
- `type` — string identifier
- `loc` — `{ line, col }` from the first token
- type-specific fields (e.g. `name`, `params`, `body`, `init`, …)

### Printer (`printer.js`)

Two renderers over the same AST:
- `printAST(node)` — plain-text indented tree (useful for CLI / tests)
- `renderASTHtml(node)` — HTML with `<span class="ast-…">` for colour

### Analyzer (`analyzer.js`)

`analyze(source)` orchestrates everything and returns:
```js
{
  tokens: Token[],
  ast:    Program node,
  errors: CompilerError[],   // lex + parse, sorted by source position
  stats:  { totalTokens, nodeCount, astDepth, lexErrors, parseErrors, … }
}
```

### UI (`ui.js`)

Pure DOM controller. Imports `analyze()` and `renderASTHtml()`,
renders four output tabs, handles sample loading, keyboard shortcuts,
and status bar updates. No compiler logic lives here.

---

## Keyboard Shortcuts

| Shortcut       | Action          |
|----------------|-----------------|
| `Ctrl+Enter`   | Run analysis    |

---

## Extending the Compiler

**Add a new token type**: edit `KEYWORDS` / scan logic in `lexer.js`.

**Add a new statement**: add a factory in `ast.js`, add a `parse*`
method in `parser.js`, add a case in `printer.js`, and handle in `ui.js`.

**Add semantic analysis** (Phase 3): create `src/semantic.js`, import
`analyze()` result, walk the AST, collect symbol-table / type errors,
and surface them in `ui.js` under a new "Semantic" tab.

---

## Supported Grammar (summary)

```
program     → statement*
statement   → funcDecl | classDecl | varDecl | ifStmt | whileStmt
            | forStmt | returnStmt | throwStmt | tryStmt
            | breakStmt | continueStmt | block | exprStmt
expr        → assignment → ternary → logical → equality
            → relational → additive → multiplicative
            → unary → postfix → call → primary
primary     → literal | identifier | "(" expr ")" | "[" … "]"
            | "{" … "}" | "new" call | arrowFunc
```
