/**
 * Event Listener Detection Tests
 * Tests analyzer's ability to detect missing required event listeners
 *
 * Related: dev-notes/analyzer-enhancement/EVENT_LISTENER_RESEARCH.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { Analyzer } from '../src/analyzer.js';
import type { PackageContract, AnalyzerConfig } from '../src/types.js';

describe('Event Listener Detection', () => {
  let testDir: string;
  let contracts: Map<string, PackageContract>;

  beforeEach(() => {
    // Create temp directory for test files
    testDir = path.join(process.cwd(), 'tests', 'fixtures', 'event-listener-test');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create a mock ws (WebSocket) contract
    contracts = new Map();
    contracts.set('ws', {
      package: 'ws',
      semver: '*',
      contract_version: '1.0.0',
      maintainer: 'test',
      status: 'production',
      detection: {
        class_names: ['WebSocket'],
        type_names: [],
        factory_methods: [],
        await_patterns: [],
        require_instance_tracking: true,
        required_event_listeners: [
          {
            event: 'error',
            required: true,
            severity: 'error',
          },
        ],
      },
      functions: [],
    });

    // Add a mock bull contract for multi-listener testing
    contracts.set('bull', {
      package: 'bull',
      semver: '*',
      contract_version: '1.0.0',
      maintainer: 'test',
      status: 'production',
      detection: {
        class_names: ['Queue'],
        type_names: [],
        factory_methods: [],
        await_patterns: [],
        require_instance_tracking: true,
        required_event_listeners: [
          {
            event: 'error',
            required: true,
            severity: 'error',
          },
          {
            event: 'failed',
            required: true,
            severity: 'error',
          },
        ],
      },
      functions: [],
    });
  });

  /**
   * Helper to analyze a code snippet
   */
  function analyzeCode(code: string, importStatement: string = "import WebSocket from 'ws';"): any[] {
    // Clean up test directory first
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        if (file.endsWith('.ts') && file !== 'tsconfig.json') {
          fs.unlinkSync(path.join(testDir, file));
        }
      }
    }

    // Create test file
    const testFile = path.join(testDir, 'test.ts');
    const fullCode = `${importStatement}\n\n${code}`;
    fs.writeFileSync(testFile, fullCode);

    // Create tsconfig
    const tsconfigPath = path.join(testDir, 'tsconfig.json');
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ['*.ts'],
    };
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

    // Run analyzer
    const config: AnalyzerConfig = {
      tsconfigPath,
      corpusPath: process.cwd(),
      includeTests: true, // Must be true to analyze test fixtures
    };

    const analyzer = new Analyzer(config, contracts);
    return analyzer.analyze();
  }

  describe('Pattern 1: Missing error listener', () => {
    it('should detect missing error listener on WebSocket', () => {
      const code = `
        function connect(url: string) {
          const ws = new WebSocket(url);
          ws.on('open', () => {
            console.log('Connected');
          });
          // Missing: ws.on('error', handler)
        }
      `;

      const violations = analyzeCode(code);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].description).toContain('error');
      expect(violations[0].description).toContain('listener');
    });

    it('should NOT flag when error listener is present', () => {
      const code = `
        function connect(url: string) {
          const ws = new WebSocket(url);
          ws.on('error', (err) => {
            console.error('WebSocket error:', err);
          });
          ws.on('open', () => {
            console.log('Connected');
          });
        }
      `;

      const violations = analyzeCode(code);

      // Filter for event listener violations
      const eventViolations = violations.filter(v =>
        v.description && v.description.includes('listener')
      );
      expect(eventViolations.length).toBe(0);
    });

    it('should detect when only non-required listeners are attached', () => {
      const code = `
        function connect(url: string) {
          const ws = new WebSocket(url);
          ws.on('open', () => {
            console.log('Connected');
          });
          ws.on('message', (data) => {
            console.log('Message:', data);
          });
          ws.on('close', () => {
            console.log('Disconnected');
          });
          // Missing: ws.on('error', handler) - REQUIRED
        }
      `;

      const violations = analyzeCode(code);

      expect(violations.length).toBeGreaterThan(0);
      const errorListenerViolation = violations.find(v =>
        v.description && v.description.includes('error') && v.description.includes('listener')
      );
      expect(errorListenerViolation).toBeDefined();
    });
  });

  describe('Pattern 2: Multiple required listeners', () => {
    it('should detect BOTH missing listeners', () => {
      const code = `
        function createQueue(name: string) {
          const queue = new Queue(name);
          queue.on('completed', (job) => {
            console.log('Job completed');
          });
          // Missing: queue.on('error', handler)
          // Missing: queue.on('failed', handler)
        }
      `;

      const violations = analyzeCode(code, "import Queue from 'bull';");

      expect(violations.length).toBeGreaterThanOrEqual(2);

      const hasErrorViolation = violations.some(v =>
        v.description && v.description.includes('error') && v.description.includes('listener')
      );
      const hasFailedViolation = violations.some(v =>
        v.description && v.description.includes('failed') && v.description.includes('listener')
      );

      expect(hasErrorViolation).toBe(true);
      expect(hasFailedViolation).toBe(true);
    });

    it('should detect ONE missing listener when other is present', () => {
      const code = `
        function createQueue(name: string) {
          const queue = new Queue(name);
          queue.on('error', (err) => {
            console.error('Queue error:', err);
          });
          // Missing: queue.on('failed', handler)
        }
      `;

      const violations = analyzeCode(code, "import Queue from 'bull';");

      const failedViolation = violations.find(v =>
        v.description && v.description.includes('failed') && v.description.includes('listener')
      );
      const errorViolation = violations.find(v =>
        v.description && v.description.includes('error') && v.description.includes('listener')
      );

      expect(failedViolation).toBeDefined();
      expect(errorViolation).toBeUndefined(); // Should NOT complain about error (it's present)
    });

    it('should NOT flag when all required listeners are present', () => {
      const code = `
        function createQueue(name: string) {
          const queue = new Queue(name);
          queue.on('error', (err) => {
            console.error('Queue error:', err);
          });
          queue.on('failed', (job, err) => {
            console.error('Job failed:', job.id, err);
          });
        }
      `;

      const violations = analyzeCode(code, "import Queue from 'bull';");

      const eventViolations = violations.filter(v =>
        v.description && v.description.includes('listener')
      );
      expect(eventViolations.length).toBe(0);
    });
  });

  describe('Pattern 3: Listener in different method', () => {
    it('should NOT flag when listener is attached in separate method', () => {
      const code = `
        class WSClient {
          private ws: WebSocket;

          connect(url: string) {
            this.ws = new WebSocket(url);
            this.setupListeners();
          }

          private setupListeners() {
            this.ws.on('error', (err) => {
              console.error('WS Error:', err);
            });
          }
        }
      `;

      const violations = analyzeCode(code);

      const eventViolations = violations.filter(v =>
        v.description && v.description.includes('listener')
      );
      expect(eventViolations.length).toBe(0);
    });

    it('should detect missing listener even with other methods present', () => {
      const code = `
        class WSClient {
          private ws: WebSocket;

          connect(url: string) {
            this.ws = new WebSocket(url);
            this.setupListeners();
          }

          private setupListeners() {
            this.ws.on('open', () => {
              console.log('Connected');
            });
            // Missing: this.ws.on('error', handler)
          }
        }
      `;

      const violations = analyzeCode(code);

      expect(violations.length).toBeGreaterThan(0);
      const errorListenerViolation = violations.find(v =>
        v.description && v.description.includes('error') && v.description.includes('listener')
      );
      expect(errorListenerViolation).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle addEventListener in addition to .on()', () => {
      const code = `
        function connect(url: string) {
          const ws = new WebSocket(url);
          ws.addEventListener('error', (err) => {
            console.error('Error:', err);
          });
        }
      `;

      const violations = analyzeCode(code);

      const eventViolations = violations.filter(v =>
        v.description && v.description.includes('listener') && v.description.includes('error')
      );
      expect(eventViolations.length).toBe(0);
    });

    it('should handle once() as equivalent to on()', () => {
      const code = `
        function connect(url: string) {
          const ws = new WebSocket(url);
          ws.once('error', (err) => {
            console.error('Error (first time only):', err);
          });
        }
      `;

      const violations = analyzeCode(code);

      // .once() should satisfy the error listener requirement
      const eventViolations = violations.filter(v =>
        v.description && v.description.includes('listener') && v.description.includes('error')
      );
      expect(eventViolations.length).toBe(0);
    });

    it('should detect missing listener with reassigned variable', () => {
      const code = `
        function connect(url: string) {
          let connection = new WebSocket(url);
          connection.on('open', () => {
            console.log('Connected');
          });
          // Missing: connection.on('error', handler)
        }
      `;

      const violations = analyzeCode(code);

      expect(violations.length).toBeGreaterThan(0);
      const errorListenerViolation = violations.find(v =>
        v.description && v.description.includes('error') && v.description.includes('listener')
      );
      expect(errorListenerViolation).toBeDefined();
    });
  });
});
