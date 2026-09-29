import { test as baseTest, Page, Locator, TestInfo } from '@playwright/test';
import { SelfHealingMcpClient } from '../core/mcpClient';
import { HealingCache } from '../core/cache';
import { TelemetryStore } from '../core/telemetry';

// Compile a healed selector string (e.g. "locator('[data-test=\"username\"]')") into a real Playwright Locator
function getPlaywrightLocator(page: Page, locatorStr: string): Locator {
  let expr = locatorStr.trim();
  if (expr.startsWith('page.')) {
    expr = expr.substring(5);
  }
  if (expr.endsWith(';')) {
    expr = expr.slice(0, -1);
  }

  // Safety whitelist check: only allow Playwright locator API methods
  const allowedMethods = [
    'locator', 'getByRole', 'getByText', 'getByLabel',
    'getByTestId', 'getByPlaceholder', 'getByAltText', 'getByTitle',
    'first', 'last', 'nth'
  ];
  const methodRegex = /[a-zA-Z0-9_]+(?=\()/g;
  const methodsUsed = expr.match(methodRegex) || [];

  for (const method of methodsUsed) {
    if (!allowedMethods.includes(method)) {
      throw new Error(`[Security] Forbidden locator method detected in expression: ${method}`);
    }
  }

  const execute = new Function('page', `return page.${expr}`);
  return execute(page);
}

// Wrap standard Locator with self-healing proxy interceptor
function wrapLocator(locator: Locator, selector: string, page: Page, testInfo: TestInfo): Locator {
  return new Proxy(locator, {
    get(target, prop, receiver) {
      // Intercept action methods
      const actionMethods = [
        'click', 'fill', 'type', 'press', 'check', 'uncheck',
        'hover', 'selectOption', 'setInputFiles', 'focus', 'blur', 'dblclick'
      ];

      if (actionMethods.includes(prop as string)) {
        return async function (...args: any[]) {
          // Check cache first
          const cacheEntry = await HealingCache.get(selector);
          let activeSelector = selector;
          let activeLocator = target;
          let alreadyHealed = false;

          if (cacheEntry) {
            console.log(`[Self-Healing Cache] HIT for selector: "${selector}" -> "${cacheEntry.healedSelector}"`);
            activeSelector = cacheEntry.healedSelector;
            activeLocator = getPlaywrightLocator(page, activeSelector);
            alreadyHealed = true;
          }

          try {
            // Apply fast-timeout (circuit breaker) if it's the original selector.
            // A 3-second limit allows fast detection of locator rot.
            const timeout = alreadyHealed ? undefined : 3000;
            const options = args[0] || {};
            const actionArgs = [...args];

            if (timeout !== undefined) {
              if (typeof options === 'object' && options !== null) {
                actionArgs[0] = { ...options, timeout };
              } else {
                actionArgs.push({ timeout });
              }
            }

            return await (activeLocator as any)[prop](...actionArgs);
          } catch (error: any) {
            console.warn(`[Circuit Breaker] Action "${prop}" failed/timed out on "${activeSelector}". Starting self-healing lifecycle...`);

            try {
              // 1. Extract accessibility tree snapshot
              let snapshot: any = null;
              if ((page as any).accessibility) {
                try {
                  snapshot = await (page as any).accessibility.snapshot();
                } catch (e) {
                  // Fallback to DOM-based extraction on failure
                }
              }
              if (!snapshot) {
                snapshot = await page.evaluate(() => {
                  function buildTree(element: Element): any {
                    const rect = element.getBoundingClientRect();
                    const style = window.getComputedStyle(element);
                    if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
                      return null;
                    }

                    let role = element.getAttribute('role') || '';
                    if (!role) {
                      const tagName = element.tagName.toLowerCase();
                      if (tagName === 'button') role = 'button';
                      else if (tagName === 'input') {
                        const type = element.getAttribute('type') || 'text';
                        if (type === 'submit' || type === 'button') role = 'button';
                        else role = 'textbox';
                      } else if (tagName === 'textarea') role = 'textbox';
                      else if (tagName === 'select') role = 'combobox';
                      else if (tagName === 'a') role = 'link';
                      else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) role = 'heading';
                    }

                    let name = '';
                    if (element.getAttribute('aria-label')) {
                      name = element.getAttribute('aria-label') || '';
                    } else if (element.getAttribute('placeholder')) {
                      name = element.getAttribute('placeholder') || '';
                    } else if (element.id) {
                      const label = document.querySelector(`label[for="${element.id}"]`);
                      if (label) {
                        name = label.textContent || '';
                      }
                    }

                    if (!name) {
                      if (['button', 'link', 'heading'].includes(role) || ['BUTTON', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName)) {
                        name = (element.textContent || '').trim().replace(/\s+/g, ' ');
                      }
                    }

                    const value = (element as any).value !== undefined ? (element as any).value : undefined;

                    const children: any[] = [];
                    for (let i = 0; i < element.children.length; i++) {
                      const childNode = buildTree(element.children[i]);
                      if (childNode) {
                        children.push(childNode);
                      }
                    }

                    const node: any = {};
                    if (role) node.role = role;
                    if (name) node.name = name;
                    if (value !== undefined && value !== '') node.value = value;
                    if (children.length > 0) {
                      node.children = children;
                    }

                    if (node.role || node.name || node.children) {
                      return node;
                    }
                    return null;
                  }
                  return buildTree(document.body);
                });
              }

              // 2. Query MCP Client for resilient locator
              const mcpClient = new SelfHealingMcpClient();
              const pageUrl = page.url();
              
              const healingResult = await mcpClient.requestHealing(
                selector,
                error.message || String(error),
                snapshot,
                pageUrl
              );

              // 3. Evaluate results
              if (healingResult.confidence >= 0.5) {
                console.log(`[Self-Healing Success] Target healed to: "${healingResult.healedSelector}" (Confidence: ${healingResult.confidence})`);

                // 4. Log to telemetry store
                await TelemetryStore.logEvent({
                  testName: testInfo.title,
                  originalSelector: selector,
                  healedSelector: healingResult.healedSelector,
                  confidence: healingResult.confidence,
                  reasoning: healingResult.reasoning,
                });

                // 5. Update SQLite cache
                await HealingCache.set(selector, healingResult.healedSelector, healingResult.confidence);

                // 6. Execute operation with healed locator using default Playwright timeout limits
                const healedLocator = getPlaywrightLocator(page, healingResult.healedSelector);
                return await (healedLocator as any)[prop](...args);
              } else {
                console.error(`[Self-Healing Aborted] Confidence score too low (${healingResult.confidence}). Propagating original failure.`);
                throw error;
              }
            } catch (healingError: any) {
              console.error('[Self-Healing Error] Fault in self-healing pipeline:', healingError);
              throw error; // Preserve original Playwright error context
            }
          }
        };
      }

      // Chain locator nesting e.g. page.locator('.btn').locator('.submit')
      if (prop === 'locator') {
        return function (subSelector: string, options?: any) {
          const subLocator = target.locator(subSelector, options);
          return wrapLocator(subLocator, `${selector} >> ${subSelector}`, page, testInfo);
        };
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

// Wrap Playwright Page instance with proxy to intercept locator creations
function wrapPage(page: Page, testInfo: TestInfo): Page {
  return new Proxy(page, {
    get(target, prop, receiver) {
      if (prop === 'locator') {
        return function (selector: string, options?: any) {
          const originalLocator = target.locator(selector, options);
          return wrapLocator(originalLocator, selector, page, testInfo);
        };
      }

      // If page methods are used directly (e.g. page.click('#id'))
      const shortcutMethods = ['click', 'fill', 'type', 'press', 'check', 'uncheck', 'hover'];
      if (shortcutMethods.includes(prop as string)) {
        return async function (selector: string, ...args: any[]) {
          const proxyLocator = wrapLocator(target.locator(selector), selector, page, testInfo);
          return (proxyLocator as any)[prop](...args);
        };
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

// Extend base Playwright test context to automatically inject wrapped page proxy
export const test = baseTest.extend<{
  page: Page;
}>({
  page: async ({ page }, use, testInfo) => {
    const wrappedPage = wrapPage(page, testInfo);
    await use(wrappedPage);
  }
});

export { expect } from '@playwright/test';
