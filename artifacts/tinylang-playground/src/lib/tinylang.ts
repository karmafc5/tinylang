export class TinyLangError extends Error {
  line: number;
  column: number;

  constructor(message: string, line: number, column: number) {
    super(message);
    this.name = "TinyLangError";
    this.line = line;
    this.column = column;
  }
}

export interface RunResult {
  output: string[];
  bytecode: string[];
  inputCount: number;
  steps: number;
}

type TokenKind =
  | "number"
  | "string"
  | "identifier"
  | "operator"
  | "punctuation"
  | "eof";

interface Token {
  kind: TokenKind;
  text: string;
  value?: number | string;
  line: number;
  column: number;
}

type Expr =
  | { type: "literal"; value: Value; token: Token }
  | { type: "variable"; name: string; token: Token }
  | { type: "unary"; op: string; right: Expr; token: Token }
  | { type: "binary"; left: Expr; op: string; right: Expr; token: Token }
  | { type: "input"; prompt?: Expr; token: Token };

type Stmt =
  | { type: "let"; name: string; value: Expr; token: Token }
  | { type: "assign"; name: string; value: Expr; token: Token }
  | { type: "print"; value: Expr; token: Token }
  | { type: "expression"; value: Expr; token: Token }
  | { type: "if"; condition: Expr; yes: Stmt[]; no: Stmt[]; token: Token }
  | { type: "while"; condition: Expr; body: Stmt[]; token: Token };

type Value = number | string | boolean | null;

interface Instruction {
  op: string;
  arg?: Value | string | number;
  token: Token;
}

const KEYWORDS = new Set(["let", "print", "if", "else", "while", "true", "false", "null"]);

class Lexer {
  private index = 0;
  private line = 1;
  private column = 1;

  constructor(private readonly source: string) {}

  scan(): Token[] {
    const tokens: Token[] = [];
    while (!this.atEnd()) {
      const ch = this.peek();
      if (/\s/.test(ch)) {
        this.advance();
      } else if (ch === "/" && this.peekNext() === "/") {
        while (!this.atEnd() && this.peek() !== "\n") this.advance();
      } else if (/[0-9]/.test(ch)) {
        tokens.push(this.number());
      } else if (/[A-Za-z_]/.test(ch)) {
        tokens.push(this.identifier());
      } else if (ch === '"' || ch === "'") {
        tokens.push(this.string());
      } else {
        tokens.push(this.symbol());
      }
    }
    tokens.push({ kind: "eof", text: "", line: this.line, column: this.column });
    return tokens;
  }

  private number(): Token {
    const start = this.location();
    let text = "";
    while (/[0-9]/.test(this.peek()) && !this.atEnd()) text += this.advance();
    if (this.peek() === "." && /[0-9]/.test(this.peekNext())) {
      text += this.advance();
      while (/[0-9]/.test(this.peek()) && !this.atEnd()) text += this.advance();
    }
    return { kind: "number", text, value: Number(text), ...start };
  }

  private identifier(): Token {
    const start = this.location();
    let text = "";
    while (/[A-Za-z0-9_]/.test(this.peek()) && !this.atEnd()) text += this.advance();
    return { kind: "identifier", text, ...start };
  }

  private string(): Token {
    const start = this.location();
    const quote = this.advance();
    let value = "";
    while (!this.atEnd() && this.peek() !== quote) {
      const ch = this.advance();
      if (ch === "\n") throw new TinyLangError("Strings cannot span multiple lines.", start.line, start.column);
      if (ch === "\\") {
        if (this.atEnd()) break;
        const escaped = this.advance();
        const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"', "'": "'" };
        value += escapes[escaped] ?? escaped;
      } else {
        value += ch;
      }
    }
    if (this.atEnd()) throw new TinyLangError("Unterminated string.", start.line, start.column);
    this.advance();
    return { kind: "string", text: value, value, ...start };
  }

  private symbol(): Token {
    const start = this.location();
    const first = this.advance();
    const pair = first + this.peek();
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(pair)) {
      this.advance();
      return { kind: "operator", text: pair, ...start };
    }
    if ("+-*/%!=<>".includes(first)) return { kind: "operator", text: first, ...start };
    if ("(){};,.".includes(first)) return { kind: "punctuation", text: first, ...start };
    throw new TinyLangError(`Unexpected character "${first}".`, start.line, start.column);
  }

  private location() {
    return { line: this.line, column: this.column };
  }
  private atEnd() {
    return this.index >= this.source.length;
  }
  private peek() {
    return this.source[this.index] ?? "\0";
  }
  private peekNext() {
    return this.source[this.index + 1] ?? "\0";
  }
  private advance() {
    const ch = this.source[this.index++] ?? "\0";
    if (ch === "\n") {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return ch;
  }
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Stmt[] {
    const statements: Stmt[] = [];
    while (!this.isAtEnd()) statements.push(this.statement());
    return statements;
  }

  private statement(): Stmt {
    if (this.matchWord("let")) {
      const token = this.previous();
      const name = this.consumeIdentifier("Expected a variable name after 'let'.");
      this.consume("=", "Expected '=' after the variable name.");
      const value = this.expression();
      this.consume(";", "Expected ';' after the declaration.");
      return { type: "let", name: name.text, value, token };
    }
    if (this.matchWord("print")) {
      const token = this.previous();
      const value = this.expression();
      this.consume(";", "Expected ';' after the printed value.");
      return { type: "print", value, token };
    }
    if (this.matchWord("if")) {
      const token = this.previous();
      const condition = this.parenthesizedCondition();
      const yes = this.block();
      const no = this.matchWord("else") ? this.block() : [];
      return { type: "if", condition, yes, no, token };
    }
    if (this.matchWord("while")) {
      const token = this.previous();
      const condition = this.parenthesizedCondition();
      const body = this.block();
      return { type: "while", condition, body, token };
    }
    if (this.checkKind("identifier") && this.peekNext().text === "=") {
      const token = this.advance();
      this.advance();
      const value = this.expression();
      this.consume(";", "Expected ';' after the assignment.");
      return { type: "assign", name: token.text, value, token };
    }
    const token = this.peek();
    const value = this.expression();
    this.consume(";", "Expected ';' after the expression.");
    return { type: "expression", value, token };
  }

  private parenthesizedCondition(): Expr {
    this.consume("(", "Expected '(' before the condition.");
    const condition = this.expression();
    this.consume(")", "Expected ')' after the condition.");
    return condition;
  }

  private block(): Stmt[] {
    this.consume("{", "Expected '{' to start a block.");
    const statements: Stmt[] = [];
    while (!this.check("}") && !this.isAtEnd()) statements.push(this.statement());
    this.consume("}", "Expected '}' after the block.");
    return statements;
  }

  private expression(): Expr {
    return this.or();
  }
  private or(): Expr {
    let expr = this.and();
    while (this.match("||")) {
      const token = this.previous();
      expr = { type: "binary", left: expr, op: token.text, right: this.and(), token };
    }
    return expr;
  }
  private and(): Expr {
    let expr = this.equality();
    while (this.match("&&")) {
      const token = this.previous();
      expr = { type: "binary", left: expr, op: token.text, right: this.equality(), token };
    }
    return expr;
  }
  private equality(): Expr {
    let expr = this.comparison();
    while (this.match("==", "!=")) {
      const token = this.previous();
      expr = { type: "binary", left: expr, op: token.text, right: this.comparison(), token };
    }
    return expr;
  }
  private comparison(): Expr {
    let expr = this.term();
    while (this.match("<", "<=", ">", ">=")) {
      const token = this.previous();
      expr = { type: "binary", left: expr, op: token.text, right: this.term(), token };
    }
    return expr;
  }
  private term(): Expr {
    let expr = this.factor();
    while (this.match("+", "-")) {
      const token = this.previous();
      expr = { type: "binary", left: expr, op: token.text, right: this.factor(), token };
    }
    return expr;
  }
  private factor(): Expr {
    let expr = this.unary();
    while (this.match("*", "/", "%")) {
      const token = this.previous();
      expr = { type: "binary", left: expr, op: token.text, right: this.unary(), token };
    }
    return expr;
  }
  private unary(): Expr {
    if (this.match("!", "-")) {
      const token = this.previous();
      return { type: "unary", op: token.text, right: this.unary(), token };
    }
    return this.primary();
  }
  private primary(): Expr {
    if (this.matchKind("number", "string")) {
      const token = this.previous();
      return { type: "literal", value: token.value as Value, token };
    }
    if (this.matchWord("true")) return { type: "literal", value: true, token: this.previous() };
    if (this.matchWord("false")) return { type: "literal", value: false, token: this.previous() };
    if (this.matchWord("null")) return { type: "literal", value: null, token: this.previous() };
    if (this.match("(")) {
      const expr = this.expression();
      this.consume(")", "Expected ')' after the expression.");
      return expr;
    }
    if (this.checkKind("identifier")) {
      const token = this.advance();
      if (token.text === "input" && this.match("(")) {
        let prompt: Expr | undefined;
        if (!this.check(")")) prompt = this.expression();
        this.consume(")", "Expected ')' after input prompt.");
        return { type: "input", prompt, token };
      }
      if (KEYWORDS.has(token.text)) throw this.error(token, `Unexpected keyword '${token.text}'.`);
      return { type: "variable", name: token.text, token };
    }
    throw this.error(this.peek(), "Expected a value.");
  }

  private consumeIdentifier(message: string): Token {
    if (this.checkKind("identifier") && !KEYWORDS.has(this.peek().text)) return this.advance();
    throw this.error(this.peek(), message);
  }
  private consume(text: string, message: string): Token {
    if (this.check(text)) return this.advance();
    throw this.error(this.peek(), message);
  }
  private matchWord(word: string) {
    if (this.checkKind("identifier") && this.peek().text === word) {
      this.advance();
      return true;
    }
    return false;
  }
  private match(...texts: string[]) {
    for (const text of texts) {
      if (this.check(text)) {
        this.advance();
        return true;
      }
    }
    return false;
  }
  private matchKind(...kinds: TokenKind[]) {
    if (kinds.includes(this.peek().kind)) {
      this.advance();
      return true;
    }
    return false;
  }
  private check(text: string) {
    return !this.isAtEnd() && this.peek().text === text;
  }
  private checkKind(kind: TokenKind) {
    return this.peek().kind === kind;
  }
  private advance() {
    if (!this.isAtEnd()) this.index += 1;
    return this.previous();
  }
  private isAtEnd() {
    return this.peek().kind === "eof";
  }
  private peek() {
    return this.tokens[this.index]!;
  }
  private peekNext() {
    return this.tokens[this.index + 1] ?? this.peek();
  }
  private previous() {
    return this.tokens[this.index - 1]!;
  }
  private error(token: Token, message: string) {
    return new TinyLangError(message, token.line, token.column);
  }
}

class Compiler {
  private readonly code: Instruction[] = [];

  compile(statements: Stmt[]) {
    for (const statement of statements) this.statement(statement);
    this.emit("HALT", undefined, this.code.at(-1)?.token ?? {
      kind: "eof", text: "", line: 1, column: 1,
    });
    return this.code;
  }

  private statement(stmt: Stmt) {
    if (stmt.type === "let" || stmt.type === "assign") {
      this.expression(stmt.value);
      this.emit("STORE", stmt.name, stmt.token);
    } else if (stmt.type === "print") {
      this.expression(stmt.value);
      this.emit("PRINT", undefined, stmt.token);
    } else if (stmt.type === "expression") {
      this.expression(stmt.value);
      this.emit("POP", undefined, stmt.token);
    } else if (stmt.type === "if") {
      this.expression(stmt.condition);
      const falseJump = this.emit("JUMP_IF_FALSE", -1, stmt.token);
      for (const child of stmt.yes) this.statement(child);
      if (stmt.no.length) {
        const endJump = this.emit("JUMP", -1, stmt.token);
        this.patch(falseJump, this.code.length);
        for (const child of stmt.no) this.statement(child);
        this.patch(endJump, this.code.length);
      } else {
        this.patch(falseJump, this.code.length);
      }
    } else {
      const loopStart = this.code.length;
      this.expression(stmt.condition);
      const endJump = this.emit("JUMP_IF_FALSE", -1, stmt.token);
      for (const child of stmt.body) this.statement(child);
      this.emit("JUMP", loopStart, stmt.token);
      this.patch(endJump, this.code.length);
    }
  }

  private expression(expr: Expr) {
    if (expr.type === "literal") {
      this.emit("CONST", expr.value, expr.token);
    } else if (expr.type === "variable") {
      this.emit("LOAD", expr.name, expr.token);
    } else if (expr.type === "input") {
      if (expr.prompt) this.expression(expr.prompt);
      else this.emit("CONST", "", expr.token);
      this.emit("READ_INPUT", undefined, expr.token);
    } else if (expr.type === "unary") {
      this.expression(expr.right);
      this.emit(expr.op === "!" ? "NOT" : "NEGATE", undefined, expr.token);
    } else {
      this.expression(expr.left);
      this.expression(expr.right);
      const ops: Record<string, string> = {
        "+": "ADD", "-": "SUBTRACT", "*": "MULTIPLY", "/": "DIVIDE",
        "%": "MODULO", "==": "EQUAL", "!=": "NOT_EQUAL", "<": "LESS",
        "<=": "LESS_EQUAL", ">": "GREATER", ">=": "GREATER_EQUAL",
        "&&": "AND", "||": "OR",
      };
      this.emit(ops[expr.op]!, undefined, expr.token);
    }
  }

  private emit(op: string, arg: Instruction["arg"], token: Token) {
    const index = this.code.length;
    this.code.push({ op, ...(arg === undefined ? {} : { arg }), token });
    return index;
  }
  private patch(index: number, target: number) {
    this.code[index]!.arg = target;
  }
}

export function runProgram(source: string, inputText: string): RunResult {
  const tokens = new Lexer(source).scan();
  const statements = new Parser(tokens).parse();
  const instructions = new Compiler().compile(statements);
  const inputs = inputText === "" ? [] : inputText.split(/\r?\n/);
  const output: string[] = [];
  const variables = new Map<string, Value>();
  const stack: Value[] = [];
  let pc = 0;
  let inputIndex = 0;
  let steps = 0;

  while (pc < instructions.length) {
    const instruction = instructions[pc]!;
    if (++steps > 100_000) {
      throw new TinyLangError("Program stopped after 100,000 steps. Check for an infinite loop.", instruction.token.line, instruction.token.column);
    }
    const pop = () => {
      const value = stack.pop();
      if (value === undefined && stack.length === 0) throw runtimeError(instruction, "Compiler stack underflow.");
      return value as Value;
    };
    const numeric = (left: Value, right: Value): [number, number] => {
      if (typeof left !== "number" || typeof right !== "number") {
        throw runtimeError(instruction, `Operator ${instruction.op} needs two numbers.`);
      }
      return [left, right];
    };
    switch (instruction.op) {
      case "CONST":
        stack.push(instruction.arg as Value);
        break;
      case "LOAD": {
        const name = instruction.arg as string;
        if (!variables.has(name)) throw runtimeError(instruction, `Variable '${name}' has not been declared.`);
        stack.push(variables.get(name)!);
        break;
      }
      case "STORE":
        variables.set(instruction.arg as string, pop());
        break;
      case "PRINT":
        output.push(formatValue(pop()));
        break;
      case "POP":
        pop();
        break;
      case "READ_INPUT": {
        const prompt = formatValue(pop());
        if (prompt) output.push(prompt);
        if (inputIndex >= inputs.length) throw runtimeError(instruction, "No input left. Add another line in the Input panel.");
        stack.push(inputs[inputIndex++]!);
        break;
      }
      case "NEGATE": {
        const value = pop();
        if (typeof value !== "number") throw runtimeError(instruction, "Unary '-' needs a number.");
        stack.push(-value);
        break;
      }
      case "NOT":
        stack.push(!truthy(pop()));
        break;
      case "ADD": {
        const right = pop();
        const left = pop();
        stack.push(typeof left === "string" || typeof right === "string"
          ? formatValue(left) + formatValue(right)
          : numeric(left, right)[0] + numeric(left, right)[1]);
        break;
      }
      case "SUBTRACT":
      case "MULTIPLY":
      case "DIVIDE":
      case "MODULO":
      case "LESS":
      case "LESS_EQUAL":
      case "GREATER":
      case "GREATER_EQUAL": {
        const right = pop();
        const left = pop();
        if (instruction.op === "LESS" || instruction.op === "LESS_EQUAL" || instruction.op === "GREATER" || instruction.op === "GREATER_EQUAL") {
          if (typeof left === "string" && typeof right === "string") {
            const comparison = left.localeCompare(right);
            stack.push(instruction.op === "LESS" ? comparison < 0
              : instruction.op === "LESS_EQUAL" ? comparison <= 0
              : instruction.op === "GREATER" ? comparison > 0 : comparison >= 0);
          } else {
            const [a, b] = numeric(left, right);
            stack.push(instruction.op === "LESS" ? a < b
              : instruction.op === "LESS_EQUAL" ? a <= b
              : instruction.op === "GREATER" ? a > b : a >= b);
          }
        } else {
          const [a, b] = numeric(left, right);
          stack.push(instruction.op === "SUBTRACT" ? a - b
            : instruction.op === "MULTIPLY" ? a * b
            : instruction.op === "DIVIDE" ? (b === 0 ? raise(instruction, "Cannot divide by zero.") : a / b)
            : (b === 0 ? raise(instruction, "Cannot divide by zero.") : a % b));
        }
        break;
      }
      case "EQUAL": {
        const right = pop();
        const left = pop();
        stack.push(left === right);
        break;
      }
      case "NOT_EQUAL": {
        const right = pop();
        const left = pop();
        stack.push(left !== right);
        break;
      }
      case "AND": {
        const right = pop();
        const left = pop();
        stack.push(truthy(left) && truthy(right));
        break;
      }
      case "OR": {
        const right = pop();
        const left = pop();
        stack.push(truthy(left) || truthy(right));
        break;
      }
      case "JUMP_IF_FALSE":
        if (!truthy(pop())) {
          pc = instruction.arg as number;
          continue;
        }
        break;
      case "JUMP":
        pc = instruction.arg as number;
        continue;
      case "HALT":
        return {
          output,
          bytecode: instructions.map(disassemble),
          inputCount: inputIndex,
          steps,
        };
      default:
        throw runtimeError(instruction, `Unknown instruction '${instruction.op}'.`);
    }
    pc += 1;
  }

  return { output, bytecode: instructions.map(disassemble), inputCount: inputIndex, steps };
}

function truthy(value: Value) {
  return value !== false && value !== null && value !== 0 && value !== "";
}

function formatValue(value: Value) {
  if (value === null) return "null";
  return String(value);
}

function runtimeError(instruction: Instruction, message: string): TinyLangError {
  return new TinyLangError(message, instruction.token.line, instruction.token.column);
}

function raise(instruction: Instruction, message: string): never {
  throw runtimeError(instruction, message);
}

function disassemble(instruction: Instruction, index: number) {
  const address = String(index).padStart(3, "0");
  if (instruction.op === "CONST") {
    const value = typeof instruction.arg === "string"
      ? JSON.stringify(instruction.arg)
      : String(instruction.arg);
    return `${address}  ${instruction.op.padEnd(16)} ${value}`;
  }
  return `${address}  ${instruction.op.padEnd(16)}${instruction.arg === undefined ? "" : ` ${String(instruction.arg)}`}`;
}
