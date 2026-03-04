/**
 * Verify agent.py OpenAI client consolidation and load_dotenv cleanup.
 * Checks via static analysis (AST-like regex) since we can't import Python.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const agentCode = fs.readFileSync(
  path.resolve(process.cwd(), 'agents/livekit-voice-agent/agent.py'),
  'utf8'
);

describe('agent.py: OpenAI client consolidation', () => {
  it('defines openai_client at module level', () => {
    expect(agentCode).toMatch(/^openai_client = openai\.AsyncOpenAI\(/m);
  });

  it('has exactly one AsyncOpenAI instantiation', () => {
    const matches = agentCode.match(/openai\.AsyncOpenAI\(/g);
    expect(matches).toHaveLength(1);
  });

  it('all function-local usages reference openai_client', () => {
    // Find all lines like "client = openai_client"
    const assignments = agentCode.match(/client = openai_client/g) || [];
    // There should be 6 (one per function that used to create its own)
    expect(assignments.length).toBe(6);
  });

  it('no function creates its own AsyncOpenAI instance', () => {
    const lines = agentCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('openai.AsyncOpenAI(') && !line.startsWith('openai_client')) {
        throw new Error(`Line ${i + 1} creates a local AsyncOpenAI: ${line.trim()}`);
      }
    }
  });
});

describe('agent.py: load_dotenv cleanup', () => {
  it('has exactly 2 load_dotenv calls (root .env + agent .env)', () => {
    const matches = agentCode.match(/load_dotenv\(/g);
    expect(matches).toHaveLength(2);
  });

  it('both load_dotenv calls have explicit path arguments', () => {
    const lines = agentCode.split('\n').filter(l => l.includes('load_dotenv('));
    for (const line of lines) {
      // Should have os.path.join inside the call, not bare load_dotenv()
      expect(line).toMatch(/load_dotenv\(os\.path\.join/);
    }
  });

  it('does not have a bare load_dotenv() call', () => {
    expect(agentCode).not.toMatch(/^load_dotenv\(\)\s*$/m);
  });

  it('does not import load_dotenv twice', () => {
    const imports = agentCode.match(/from dotenv import load_dotenv/g);
    expect(imports).toHaveLength(1);
  });
});
