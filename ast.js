/**
 * ast.js — C Language AST Node Definitions
 *
 * All node types are pure factory functions.
 * Every node has: type, loc, and type-specific fields.
 *
 * Covers all standard C constructs:
 *   - Preprocessor directives
 *   - Type specifiers with pointers and arrays
 *   - Structs, unions, enums, typedefs
 *   - Functions with typed parameters
 *   - All C statements and expressions
 *   - C-specific operators: ->, &(addr), *(deref), sizeof, cast
 */

"use strict";

function node(type, fields, loc) {
  return { type, ...fields, loc: loc ?? null };
}

// ─── Top level ───────────────────────────────────────────────────────────────

export const Program = (body, loc) =>
  node("Program", { body }, loc);

// ─── Preprocessor ────────────────────────────────────────────────────────────

export const PreprocessorDirective = (directive, value, loc) =>
  node("PreprocessorDirective", { directive, value }, loc);
  // directive: "include" | "define" | "ifdef" | "ifndef" | "endif" | "pragma" | "undef"
  // value:     "<stdio.h>" | "MAX 100" | etc.

// ─── Type descriptors ────────────────────────────────────────────────────────

export const TypeSpecifier = (base, qualifiers, pointerLevel, isArray, arraySize, loc) =>
  node("TypeSpecifier", { base, qualifiers, pointerLevel, isArray, arraySize }, loc);
  // base:         "int" | "float" | "char" | "void" | "struct Point" | etc.
  // qualifiers:   ["const", "volatile", "unsigned", "signed", "long", "short"]
  // pointerLevel: 0 = not a pointer, 1 = *, 2 = **, etc.
  // isArray:      bool
  // arraySize:    expression node or null (for unsized arrays)

// ─── Declarations ────────────────────────────────────────────────────────────

export const FunctionDeclaration = (returnType, name, params, body, loc) =>
  node("FunctionDeclaration", { returnType, name, params, body }, loc);
  // returnType: TypeSpecifier
  // params:     ParameterDeclaration[]
  // body:       BlockStatement | null (for prototypes)

export const FunctionPrototype = (returnType, name, params, loc) =>
  node("FunctionPrototype", { returnType, name, params }, loc);

export const ParameterDeclaration = (typeSpec, name, loc) =>
  node("ParameterDeclaration", { typeSpec, name }, loc);

export const VariableDeclaration = (typeSpec, declarators, loc) =>
  node("VariableDeclaration", { typeSpec, declarators }, loc);
  // declarators: Declarator[]  (C allows: int x = 1, y = 2, *p;)

export const Declarator = (name, pointerLevel, arraySize, init, loc) =>
  node("Declarator", { name, pointerLevel, arraySize, init }, loc);

export const StructDeclaration = (name, members, loc) =>
  node("StructDeclaration", { name, members }, loc);
  // members: VariableDeclaration[]

export const UnionDeclaration = (name, members, loc) =>
  node("UnionDeclaration", { name, members }, loc);

export const EnumDeclaration = (name, members, loc) =>
  node("EnumDeclaration", { name, members }, loc);
  // members: EnumMember[]

export const EnumMember = (name, value, loc) =>
  node("EnumMember", { name, value }, loc);

export const TypedefDeclaration = (typeSpec, alias, loc) =>
  node("TypedefDeclaration", { typeSpec, alias }, loc);

// ─── Statements ──────────────────────────────────────────────────────────────

export const BlockStatement = (body, loc) =>
  node("BlockStatement", { body }, loc);

export const ReturnStatement = (argument, loc) =>
  node("ReturnStatement", { argument }, loc);

export const IfStatement = (test, consequent, alternate, loc) =>
  node("IfStatement", { test, consequent, alternate }, loc);

export const WhileStatement = (test, body, loc) =>
  node("WhileStatement", { test, body }, loc);

export const DoWhileStatement = (body, test, loc) =>
  node("DoWhileStatement", { body, test }, loc);

export const ForStatement = (init, test, update, body, loc) =>
  node("ForStatement", { init, test, update, body }, loc);

export const SwitchStatement = (discriminant, cases, loc) =>
  node("SwitchStatement", { discriminant, cases }, loc);

export const CaseClause = (test, body, loc) =>
  node("CaseClause", { test, body }, loc);
  // test: expression for 'case X:', null for 'default:'

export const BreakStatement    = (loc) => node("BreakStatement",    {}, loc);
export const ContinueStatement = (loc) => node("ContinueStatement", {}, loc);

export const GotoStatement = (label, loc) =>
  node("GotoStatement", { label }, loc);

export const LabeledStatement = (label, body, loc) =>
  node("LabeledStatement", { label, body }, loc);

export const ExpressionStatement = (expression, loc) =>
  node("ExpressionStatement", { expression }, loc);

export const EmptyStatement = (loc) =>
  node("EmptyStatement", {}, loc);

// ─── Expressions ─────────────────────────────────────────────────────────────

export const BinaryExpression = (operator, left, right, loc) =>
  node("BinaryExpression", { operator, left, right }, loc);

export const UnaryExpression = (operator, argument, prefix, loc) =>
  node("UnaryExpression", { operator, argument, prefix }, loc);

export const AssignmentExpression = (operator, left, right, loc) =>
  node("AssignmentExpression", { operator, left, right }, loc);

export const ConditionalExpression = (test, consequent, alternate, loc) =>
  node("ConditionalExpression", { test, consequent, alternate }, loc);

export const CallExpression = (callee, args, loc) =>
  node("CallExpression", { callee, arguments: args }, loc);

export const MemberExpression = (object, property, computed, loc) =>
  node("MemberExpression", { object, property, computed }, loc);
  // computed: false = obj.field, true = obj[index]

export const ArrowExpression = (object, member, loc) =>
  node("ArrowExpression", { object, member }, loc);
  // ptr->field

export const CastExpression = (targetType, expression, loc) =>
  node("CastExpression", { targetType, expression }, loc);
  // (int) x    (float *) ptr

export const SizeofExpression = (argument, isType, loc) =>
  node("SizeofExpression", { argument, isType }, loc);
  // sizeof(int)   sizeof(x)   sizeof x
  // isType: true if argument is a type name, false if expression

export const AddressOfExpression = (argument, loc) =>
  node("AddressOfExpression", { argument }, loc);
  // &x

export const DereferenceExpression = (argument, loc) =>
  node("DereferenceExpression", { argument }, loc);
  // *p

export const ArraySubscript = (array, index, loc) =>
  node("ArraySubscript", { array, index }, loc);
  // arr[i]

// ─── Primaries ───────────────────────────────────────────────────────────────

export const Identifier = (name, loc) =>
  node("Identifier", { name }, loc);

export const Literal = (value, kind, raw, loc) =>
  node("Literal", { value, kind, raw }, loc);
  // kind: "integer" | "float" | "string" | "char"

// ─── Error recovery ──────────────────────────────────────────────────────────

export const MissingExpression = (loc) => node("MissingExpression", {}, loc);
export const MissingBlock      = (loc) => node("MissingBlock",      {}, loc);
export const ErrorNode = (message, raw, loc) => node("ErrorNode", { message, raw }, loc);
