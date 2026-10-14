import { test, expect } from '@playwright/test';
import { HealerEngine, UNHEALED_CONFIDENCE } from '../../core/healer';

test.describe('HealerEngine.healWithMock', () => {
  test('heals a known drifted selector to its data-test locator', () => {
    const result = HealerEngine.healWithMock('#user-name-wrong');

    expect(result.healedSelector).toBe(`locator('[data-test="username"]')`);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.reasoning).not.toBe('');
  });

  test('ignores surrounding whitespace in the original selector', () => {
    const result = HealerEngine.healWithMock('  #finish-wrong \n');

    expect(result.healedSelector).toBe(`locator('[data-test="finish"]')`);
  });

  test('returns the original selector with low confidence when no drift is known', () => {
    const result = HealerEngine.healWithMock('#does-not-exist');

    expect(result.healedSelector).toBe('#does-not-exist');
    expect(result.confidence).toBe(UNHEALED_CONFIDENCE);
    expect(result.confidence).toBeLessThan(0.5);
  });
});

test.describe('HealerEngine.minifyAccessibilityTree', () => {
  test('keeps only semantic fields and drops empty nodes', () => {
    const raw = {
      role: 'WebArea',
      name: 'Swag Labs',
      focused: true,
      children: [
        { role: 'textbox', name: 'Username', value: '', haspopup: false },
        { children: [] },
        { role: 'button', name: 'Login', description: 'Submit credentials' },
      ],
    };

    expect(HealerEngine.minifyAccessibilityTree(raw)).toEqual({
      role: 'WebArea',
      name: 'Swag Labs',
      children: [
        { role: 'textbox', name: 'Username' },
        { role: 'button', name: 'Login', description: 'Submit credentials' },
      ],
    });
  });

  test('keeps a non-empty value, including zero', () => {
    expect(HealerEngine.minifyAccessibilityTree({ role: 'spinbutton', value: 0 })).toEqual({
      role: 'spinbutton',
      value: 0,
    });
  });

  test('returns null for a missing or fully empty tree', () => {
    expect(HealerEngine.minifyAccessibilityTree(null)).toBeNull();
    expect(HealerEngine.minifyAccessibilityTree({ children: [{}, { children: [] }] })).toBeNull();
  });
});

test.describe('HealerEngine.parseHealingResponse', () => {
  const payload = { healedSelector: "getByRole('button', { name: 'Login' })", confidence: 0.9, reasoning: 'Unique role' };

  test('parses plain JSON', () => {
    expect(HealerEngine.parseHealingResponse(JSON.stringify(payload))).toEqual(payload);
  });

  test('strips a surrounding markdown fence', () => {
    const fenced = '```json\n' + JSON.stringify(payload) + '\n```';
    expect(HealerEngine.parseHealingResponse(fenced)).toEqual(payload);
  });

  test('rejects a response with confidence outside 0..1', () => {
    expect(() => HealerEngine.parseHealingResponse(JSON.stringify({ ...payload, confidence: 7 }))).toThrow(
      /expected schema/,
    );
  });
});

test.describe('HealerEngine.heal with GEMINI_API_KEY', () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  test('sends the key in the x-goog-api-key header, never in the URL', async () => {
    process.env.GEMINI_API_KEY = 'test-key-123';
    let requestUrl = '';
    let requestHeaders: Record<string, string> = {};
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input);
      requestHeaders = init?.headers as Record<string, string>;
      const text = JSON.stringify({ healedSelector: "getByTestId('username')", confidence: 0.8, reasoning: 'ok' });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
    }) as typeof fetch;

    const result = await HealerEngine.heal('#user-name-wrong', 'timeout', { role: 'textbox', name: 'Username' }, 'https://example.test');

    expect(requestHeaders['x-goog-api-key']).toBe('test-key-123');
    expect(requestUrl).not.toContain('test-key-123');
    expect(requestUrl).not.toContain('key=');
    expect(result.healedSelector).toBe("getByTestId('username')");
  });

  test('falls back to the offline drift map when the live call fails', async () => {
    process.env.GEMINI_API_KEY = 'test-key-123';
    globalThis.fetch = (async () => new Response('quota exceeded', { status: 429 })) as typeof fetch;

    const result = await HealerEngine.heal('#password-wrong', 'timeout', null, 'https://example.test');

    expect(result.healedSelector).toBe(`locator('[data-test="password"]')`);
  });
});
