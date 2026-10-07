import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Activity, BookOpen, Braces, Check, CircleHelp, Copy, FileCode2, Keyboard,
  Layers3, ListPlus, Play, Terminal, X,
} from 'lucide-react';
import { runProgram } from '@/lib/tinylang';

type ProgramResult = {
  output: string[];
  bytecode: string[];
  inputCount: number;
  steps: number;
};
type RunError = { message: string; line?: number; column?: number };

const examples = [
  {
    id: 'hello',
    name: 'Hello, world',
    note: 'A first print',
    source: 'print "Hello, TinyLang!";',
    input: [],
  },
  {
    id: 'arithmetic',
    name: 'A little arithmetic',
    note: 'Expressions and names',
    source: 'let base = 17;\nlet offset = 25;\nlet total = base + offset;\nprint total;',
    input: [],
  },
  {
    id: 'stdin',
    name: 'Read a value',
    note: 'Try the input queue',
    source: 'let answer = input();\nprint "You entered: " + answer;',
    input: ['42'],
  },
  {
    id: 'loop',
    name: 'Count it out',
    note: 'A small loop',
    source: 'let n = 3;\nwhile (n > 0) {\n  print n;\n  n = n - 1;\n}\nprint "lift off";',
    input: [],
  },
];

function Home() {
  const [source, setSource] = useState(examples[0].source);
  const [selectedExample, setSelectedExample] = useState('hello');
  const [inputLines, setInputLines] = useState<string[]>([]);
  const [result, setResult] = useState<ProgramResult | null>(null);
  const [runError, setRunError] = useState<RunError | null>(null);
  const [activeTab, setActiveTab] = useState<'bytecode' | 'reference'>('bytecode');
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lineCount = Math.max(source.split('\n').length, 1);

  const run = useCallback(() => {
    setRunning(true);
    setRunError(null);
    window.setTimeout(() => {
      try {
        const next = runProgram(source, inputLines.join('\n'));
        setResult(next);
      } catch (thrown) {
        const error = thrown as Error & { line?: number; column?: number };
        setRunError({
          message: error?.message || 'The program could not be run.',
          line: error?.line,
          column: error?.column,
        });
        setResult(null);
      } finally {
        setRunning(false);
      }
    }, 40);
  }, [source, inputLines]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        run();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [run]);

  const chooseExample = (id: string) => {
    const example = examples.find((item) => item.id === id);
    if (!example) return;
    setSelectedExample(id);
    setSource(example.source);
    setInputLines([...example.input]);
    setResult(null);
    setRunError(null);
  };

  const updateSource = (value: string) => {
    setSource(value);
    setSelectedExample('');
  };

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const editorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const area = event.currentTarget;
      const start = area.selectionStart;
      const end = area.selectionEnd;
      const next = `${source.slice(0, start)}  ${source.slice(end)}`;
      updateSource(next);
      requestAnimationFrame(() => {
        area.selectionStart = area.selectionEnd = start + 2;
      });
    }
  };

  const location = runError?.line
    ? `Line ${runError.line}${runError.column ? `, column ${runError.column}` : ''}`
    : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="TinyLang Playground">
          <span className="brand-mark"><Braces size={19} strokeWidth={2.5} /></span>
          <span>tiny<span style={{ color: '#78952c' }}>lang</span></span>
        </div>
        <div className="topbar-meta" aria-label="Playground status">
          <span className="hide-mobile"><span className="live-dot" />LOCAL WORKBENCH</span>
          <span>v. 01</span>
        </div>
      </header>

      <div className="main-wrap">
        <section className="intro">
          <div>
            <p className="eyebrow">A small language, in motion</p>
            <h1>Make a thought executable.</h1>
            <p>Write a little TinyLang. Run it. See what it becomes.</p>
          </div>
          <label>
            <span className="sr-only">Load an example program</span>
            <select className="example-select" value={selectedExample} onChange={(e) => chooseExample(e.target.value)} data-testid="example-select" aria-label="Choose an example">
              <option value="" disabled>Choose an example…</option>
              {examples.map((example) => <option value={example.id} key={example.id}>{example.name} — {example.note}</option>)}
            </select>
          </label>
        </section>

        <div className="workspace">
          <section className="panel editor-panel" aria-label="TinyLang source editor">
            <div className="panel-head">
              <div className="panel-title"><FileCode2 size={15} /> main.tiny <span className="panel-kicker">SOURCE</span></div>
              <div className="head-tools">
                <button className="soft-button" onClick={copySource} data-testid="copy-source" aria-label="Copy source code">
                  {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}
                </button>
                <button className="run-button" onClick={run} disabled={running} data-testid="run-program" aria-label="Run TinyLang program">
                  <Play size={14} fill="currentColor" />{running ? 'Running…' : 'Run'} <span className="keyboard-hint"><kbd>⌘</kbd><kbd>↵</kbd></span>
                </button>
              </div>
            </div>
            <div className="editor-shell">
              <div className="line-numbers" aria-hidden="true">{Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}</div>
              <textarea
                ref={editorRef}
                className="code-editor"
                value={source}
                onChange={(event) => updateSource(event.target.value)}
                onKeyDown={editorKeyDown}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                aria-label="TinyLang source code"
                data-testid="source-editor"
                aria-describedby="editor-status"
              />
            </div>
            <div className="editor-foot" id="editor-status">
              <span><span style={{ color: '#c6e85e' }}>●</span> TinyLang</span>
              <span>{lineCount} {lineCount === 1 ? 'line' : 'lines'} <span aria-hidden="true">·</span> UTF-8</span>
            </div>
          </section>

          <div className="right-stack">
            <section className="panel input-panel" aria-labelledby="stdin-heading">
              <div className="panel-head">
                <div className="panel-title" id="stdin-heading"><ListPlus size={15} /> Input queue <span className="panel-kicker">STDIN</span></div>
                <span className="status-pill" data-testid="input-count">{inputLines.length} {inputLines.length === 1 ? 'line' : 'lines'}</span>
              </div>
              <div className="input-hint">One line per read. Values are fed in order when your program asks.</div>
              <div className="stdin-list">
                {inputLines.map((line, index) => (
                  <div className="stdin-row" key={index}>
                    <span className="stdin-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <input
                      className="stdin-field"
                      value={line}
                      onChange={(event) => setInputLines((current) => current.map((item, i) => i === index ? event.target.value : item))}
                      aria-label={`Input line ${index + 1}`}
                      data-testid={`stdin-line-${index + 1}`}
                    />
                    <button className="remove-input" onClick={() => setInputLines((current) => current.filter((_, i) => i !== index))} aria-label={`Remove input line ${index + 1}`} data-testid={`remove-stdin-${index + 1}`}><X size={15} /></button>
                  </div>
                ))}
                {inputLines.length === 0 && <div className="empty-output" style={{ minHeight: 42, padding: '5px 0' }} data-testid="stdin-empty">No queued input. Add a line if your program reads from stdin.</div>}
              </div>
              <button className="add-line" onClick={() => setInputLines((current) => [...current, ''])} data-testid="add-stdin"><ListPlus size={14} /> Add input line</button>
            </section>

            <section className="panel output-panel" aria-labelledby="output-heading" aria-live="polite">
              <div className="panel-head">
                <div className="panel-title" id="output-heading"><Terminal size={15} /> Run output <span className="panel-kicker">STDOUT</span></div>
                <div className={`status-pill ${runError ? 'error' : result ? 'success' : ''}`} data-testid="run-status">
                  <span aria-hidden="true">{runError ? '!' : result ? '✓' : '·'}</span>{runError ? 'Error' : result ? 'Finished' : 'Ready'}
                </div>
              </div>
              <div className="output-body" data-testid="program-output">
                {runError ? (
                  <div className="error-box fade-in" role="alert">
                    <div>{runError.message}</div>
                    {location && <div className="error-location">{location}</div>}
                  </div>
                ) : result ? (
                  result.output.length ? (
                    <div className="output-lines fade-in">
                      {result.output.map((line, index) => <div className="output-line" key={`${index}-${line}`}><span className="output-line-number">{String(index + 1).padStart(2, '0')}</span><span>{line}</span></div>)}
                    </div>
                  ) : <div className="empty-output fade-in"><Activity size={17} /><strong>Ran cleanly. Nothing printed.</strong><span>Your program finished without writing to stdout.</span></div>
                ) : (
                  <div className="empty-output"><Terminal size={18} /><strong>Your output will land here.</strong><span>Run the program to see what it says.</span></div>
                )}
              </div>
            </section>
          </div>
        </div>

        <section className="panel result-section" aria-label="Compiled program details">
          <div className="panel-head">
            <div className="panel-title"><Layers3 size={15} /> Under the hood</div>
            <div className="result-tabs" role="tablist" aria-label="Program details">
              <button className={`tab-button ${activeTab === 'bytecode' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'bytecode'} onClick={() => setActiveTab('bytecode')} data-testid="bytecode-tab">Bytecode</button>
              <button className={`tab-button ${activeTab === 'reference' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'reference'} onClick={() => setActiveTab('reference')} data-testid="reference-tab">Syntax notes</button>
            </div>
          </div>
          {activeTab === 'bytecode' ? (
            <>
              <div className="bytecode-body" role="tabpanel" data-testid="bytecode-view">
                {result?.bytecode.length ? result.bytecode.map((instruction, index) => <div className="byte-row" key={`${index}-${instruction}`}><span className="byte-address">{String(index).padStart(3, '0')}</span><span>{instruction}</span></div>) : (
                  <div className="byte-empty">{result ? 'No instructions emitted for this program.' : 'Run a program to inspect its compiled instructions.'}</div>
                )}
              </div>
              {result && <div className="stats-strip" data-testid="run-stats"><span>STEPS <b>{result.steps}</b></span><span>INPUTS USED <b>{result.inputCount}</b></span><span>INSTRUCTIONS <b>{result.bytecode.length}</b></span></div>}
            </>
          ) : (
            <div className="bytecode-body" role="tabpanel" data-testid="syntax-reference">
              <div className="ref-examples">
                <span><code>let name = value;</code></span><span><code>print expression;</code></span><span><code>input()</code></span><span><code>if (condition) {'{' } … {'}'}</code></span><span><code>while (condition) {'{' } … {'}'}</code></span>
              </div>
            </div>
          )}
        </section>

        <section className="reference" aria-label="TinyLang quick reference">
          <article className="ref-card">
            <div className="ref-heading"><BookOpen size={14} /> A few building blocks</div>
            <p><code>let score = 7;</code> names a value. Use <code>print score;</code> to write a line. Finish each statement with a semicolon. Numbers, text, and arithmetic expressions are ready to play with.</p>
          </article>
          <article className="ref-card">
            <div className="ref-heading"><CircleHelp size={14} /> Reading input</div>
            <p>Use <code>let answer = input();</code> to consume the next queued line. Add, edit, or remove lines in the input queue before you run.</p>
          </article>
          <article className="ref-card">
            <div className="ref-heading"><Keyboard size={14} /> Small shortcuts</div>
            <p><kbd>Tab</kbd> inserts two spaces in the editor. <kbd>⌘ Enter</kbd> or <kbd>Ctrl Enter</kbd> runs your program. Errors point to their source location.</p>
          </article>
        </section>
      </div>
    </main>
  );
}

function App() {
  return <Home />;
}

export default App;
