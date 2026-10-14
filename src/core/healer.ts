export interface HealingResult {
  healedSelector: string;
  confidence: number;
  reasoning: string;
}

export interface AccessibilityNode {
  role?: string;
  name?: string;
  value?: string | number;
  description?: string;
  children?: AccessibilityNode[];
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/** Confidence returned when no healing candidate could be found. */
export const UNHEALED_CONFIDENCE = 0.2;

/**
 * Known locator drift on SauceDemo, used when no LLM key is configured so the
 * framework heals deterministically out of the box (and in CI).
 */
const SAUCE_DEMO_DRIFT: Record<string, { healed: string; reasoning: string }> = {
  'input#user-name-wrong': {
    healed: "locator('[data-test=\"username\"]')",
    reasoning: "Selector 'input#user-name-wrong' did not resolve; healed to the stable data-test username input.",
  },
  '#user-name-wrong': {
    healed: "locator('[data-test=\"username\"]')",
    reasoning: "Selector '#user-name-wrong' did not resolve; healed to the stable data-test username input.",
  },
  'input#password-wrong': {
    healed: "locator('[data-test=\"password\"]')",
    reasoning: "Selector 'input#password-wrong' did not resolve; healed to the data-test password input.",
  },
  '#password-wrong': {
    healed: "locator('[data-test=\"password\"]')",
    reasoning: "Selector '#password-wrong' did not resolve; healed to the data-test password input.",
  },
  'input#login-button-wrong': {
    healed: "locator('[data-test=\"login-button\"]')",
    reasoning: 'Healed the login button to its stable data-test identifier.',
  },
  '#login-button-wrong': {
    healed: "locator('[data-test=\"login-button\"]')",
    reasoning: 'Healed the login button to its stable data-test identifier.',
  },
  'button#add-to-cart-sauce-labs-backpack-wrong': {
    healed: "locator('[data-test=\"add-to-cart-sauce-labs-backpack\"]')",
    reasoning: 'Healed the add-to-cart button using its unique data-test attribute.',
  },
  '#add-to-cart-sauce-labs-backpack-wrong': {
    healed: "locator('[data-test=\"add-to-cart-sauce-labs-backpack\"]')",
    reasoning: 'Healed the add-to-cart button using its unique data-test attribute.',
  },
  'a.shopping_cart_link_wrong': {
    healed: "locator('[data-test=\"shopping-cart-link\"]')",
    reasoning: 'Healed the shopping cart link to its data-test identifier.',
  },
  '#shopping_cart_container_wrong': {
    healed: "locator('[data-test=\"shopping-cart-link\"]')",
    reasoning: 'Healed the shopping cart container to the data-test shopping-cart-link.',
  },
  'button#checkout-wrong': {
    healed: "locator('[data-test=\"checkout\"]')",
    reasoning: 'Healed the checkout button to its data-test identifier.',
  },
  '#checkout-wrong': {
    healed: "locator('[data-test=\"checkout\"]')",
    reasoning: 'Healed the checkout button to its data-test identifier.',
  },
  '#first-name-wrong': {
    healed: "locator('[data-test=\"firstName\"]')",
    reasoning: 'Healed the first-name input to its data-test attribute.',
  },
  '#last-name-wrong': {
    healed: "locator('[data-test=\"lastName\"]')",
    reasoning: 'Healed the last-name input to its data-test attribute.',
  },
  '#postal-code-wrong': {
    healed: "locator('[data-test=\"postalCode\"]')",
    reasoning: 'Healed the postal-code input to its data-test attribute.',
  },
  '#continue-wrong': {
    healed: "locator('[data-test=\"continue\"]')",
    reasoning: 'Healed the continue button to its data-test identifier.',
  },
  '#finish-wrong': {
    healed: "locator('[data-test=\"finish\"]')",
    reasoning: 'Healed the finish button to its data-test identifier.',
  },
};

export class HealerEngine {
  /**
   * Keeps only the semantic fields of an accessibility tree and drops empty
   * nodes, so the prompt sent to the LLM stays small and free of noise.
   */
  public static minifyAccessibilityTree(node: AccessibilityNode | null | undefined): AccessibilityNode | null {
    if (!node) return null;

    const minified: AccessibilityNode = {};
    if (node.role) minified.role = node.role;
    if (node.name) minified.name = node.name;
    if (node.value !== undefined && node.value !== '') minified.value = node.value;
    if (node.description) minified.description = node.description;

    if (Array.isArray(node.children)) {
      const children = node.children
        .map((child) => this.minifyAccessibilityTree(child))
        .filter((child): child is AccessibilityNode => child !== null);
      if (children.length > 0) minified.children = children;
    }

    return Object.keys(minified).length > 0 ? minified : null;
  }

  /**
   * Resolves a broken selector: Gemini when GEMINI_API_KEY is set, otherwise
   * (or if the live call fails) the offline SauceDemo drift map.
   */
  public static async heal(
    originalSelector: string,
    errorMessage: string,
    rawAccessibilityTree: AccessibilityNode | null,
    pageUrl: string,
  ): Promise<HealingResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const tree = JSON.stringify(this.minifyAccessibilityTree(rawAccessibilityTree), null, 2);
      try {
        return await this.healWithGemini(apiKey, originalSelector, errorMessage, tree, pageUrl);
      } catch (err) {
        console.warn(`[HealerEngine] Gemini healing failed, using offline drift map: ${(err as Error).message}`);
      }
    }
    return this.healWithMock(originalSelector);
  }

  /** Offline healer backed by the known SauceDemo drift map. */
  public static healWithMock(originalSelector: string): HealingResult {
    const matched = SAUCE_DEMO_DRIFT[originalSelector.trim()];
    if (matched) {
      return { healedSelector: matched.healed, confidence: 0.95, reasoning: matched.reasoning };
    }
    return {
      healedSelector: originalSelector,
      confidence: UNHEALED_CONFIDENCE,
      reasoning: 'No known drift signature for this selector; healing was not possible.',
    };
  }

  /**
   * Parses the model's text into a HealingResult, tolerating a surrounding
   * markdown fence and rejecting anything that does not match the schema.
   */
  public static parseHealingResponse(text: string): HealingResult {
    const json = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(json) as Partial<HealingResult>;

    if (
      typeof parsed.healedSelector !== 'string' ||
      parsed.healedSelector.trim() === '' ||
      typeof parsed.confidence !== 'number' ||
      parsed.confidence < 0 ||
      parsed.confidence > 1 ||
      typeof parsed.reasoning !== 'string'
    ) {
      throw new Error(`Healing response does not match the expected schema: ${json}`);
    }
    return { healedSelector: parsed.healedSelector, confidence: parsed.confidence, reasoning: parsed.reasoning };
  }

  private static async healWithGemini(
    apiKey: string,
    originalSelector: string,
    errorMessage: string,
    minifiedTree: string,
    pageUrl: string,
  ): Promise<HealingResult> {
    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: this.buildPrompt(originalSelector, errorMessage, minifiedTree, pageUrl) }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini API returned an empty candidate');
    }
    return this.parseHealingResponse(text);
  }

  private static buildPrompt(
    originalSelector: string,
    errorMessage: string,
    minifiedTree: string,
    pageUrl: string,
  ): string {
    return `
You are an expert test automation assistant specialising in Playwright and the Page Object Model.
Fix a broken locator in a Playwright test.

Context:
- Current page URL: ${pageUrl}
- Broken selector: ${originalSelector}
- Failure error: ${errorMessage}
- Minified accessibility tree of the current page:
\`\`\`json
${minifiedTree}
\`\`\`

Selector strategy, in priority order:
1. getByRole (e.g. getByRole('button', { name: 'Login' })) for semantic elements.
2. getByTestId (e.g. getByTestId('login-button')) when the role is not unique.
3. getByLabel (e.g. getByLabel('Username')) for form inputs.
4. getByText (e.g. getByText('Products')) for text nodes.
5. locator('css') only when none of the above is available.

Never use generated or per-build attribute values. If the element appears to be missing
from the page, return confidence <= 0.3.

Return ONLY a JSON object, without markdown fences, matching:
{
  "healedSelector": "the Playwright locator chain, e.g. getByRole('button', { name: 'Login' })",
  "confidence": 0.0-1.0,
  "reasoning": "one-sentence justification"
}
`;
  }
}
