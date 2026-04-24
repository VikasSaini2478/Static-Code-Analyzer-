# 🚀 C Analyzer - Static Compiler Pipeline
## 📌 Overview

This project is an implementation of core concepts from Compiler Design, focusing on building different phases of a compiler such as lexical analysis, syntax analysis, and intermediate processing.

The goal of this project is to simulate how a compiler works internally and provide a clear understanding of parsing and tokenization techniques.

A fully client-side, zero-dependency static analyzer that works like
a real compiler front-end: **Lexer → Parser → AST → Error Reporter**.

---

## Project Structure

```
Compiler-Design-Project/
│── README.md          # Project documentation
│── index.html         # Main frontend HTML file
│── main.css           # Styling for UI
│
│── main.js            # Entry point connecting all modules
│── ui.js              # Handles UI interactions and DOM updates
│
│── lexer.js           # Lexical analyzer (tokenization)
│── parser.js          # Syntax analyzer (parsing tokens)
│── ast.js             # Abstract Syntax Tree generation
│── analyzer.js        # Semantic analysis / validation
│── printer.js         # Outputs formatted results / AST display
```
---

# 📌 File Responsibilities (Short Explanation)<br>
### index.html → Structure of the web interface<br>
### main.css → Styling and layout<br>
### main.js → Controls overall execution flow<br>
### ui.js → Handles user input/output on the webpage<br>
### lexer.js → Breaks code into tokens<br>
### parser.js → Converts tokens into syntax structure<br>
### ast.js → Builds Abstract Syntax Tree (AST)<br>
### analyzer.js → Performs semantic checks (if implemented)<br>
### printer.js → Displays output (tokens, AST, errors, etc.)<br>

---
# Features<br>
## 🔍 Lexical Analyzer<br>
Tokenizes input source code<br>
Identifies keywords, identifiers, operators, and constants<br>
## 🌳 Syntax Analyzer<br>
Implements parsing techniques (LL/LR depending on your project)<br>
Validates grammatical structure of input<br>
## ⚙️ Intermediate Code Generation (if included)<br>
Converts parsed input into intermediate representation<br>
## ❗ Error Handling<br>
Detects lexical and syntax errors<br>
Displays meaningful error messages<br>
## 💡 User-Friendly Interface<br>
Clean and simple interaction (CLI/GUI depending on your implementation)<br>

---

# How to Run

Since the project uses ES Modules (`type="module"`)<br>
you need a local server — you **cannot** just open `index.html` via `file://`.<br>
open terminal in which folder you save all the files of project<br>
## run this command-> python3 -m http.server 8080
## open this server http://localhost:8080/


---
# Keyboard Shortcuts

| Shortcut       | Action          |
|----------------|-----------------|
| `Ctrl+Enter`   | Run analysis    |

---

# Architecture Diagram

<img width="1536" height="1024" alt="ChatGPT Image Apr 23, 2026, 12_14_11 PM" src="https://github.com/user-attachments/assets/9fde6576-267b-4172-b1a2-e1cacedb6b9e" />

---

# Screenshots
<img width="1919" height="1079" alt="Screenshot 2026-04-24 204342" src="https://github.com/user-attachments/assets/1679a1d6-d812-45c8-a2da-963fde95ca79" />

<img width="1919" height="1079" alt="Screenshot 2026-04-24 204400" src="https://github.com/user-attachments/assets/680d4af2-a463-43ff-a78f-258290ead510" />

---

# 🛠️ Tech Stack
Programming Language: C / C++ / Python (update accordingly)<br>
## Concepts Used:<br>
Finite Automata<br>
Context-Free Grammar<br>
Parsing Techniques (LL(1), LR, etc.)<br>
Symbol Table Management<br>

---

# 📈 Future Improvements<br>
Add Semantic Analysis<br>
Implement Code Optimization<br>
Build a GUI Interface<br>
Extend support for full programming language syntax<br>

---

# 🤝 Contributing

Contributions are welcome. Feel free to fork this repository and submit a pull request.

---

# 📜 License

This project is open-source and available under the MIT License.

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
---

## ⭐ If you like this project

Give it a star ⭐ and share it!

---
