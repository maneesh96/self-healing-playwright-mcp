import * as dotenv from 'dotenv';

dotenv.config();

export interface HealingResult {
  healedSelector: string;
  confidence: number;
  reasoning: string;
}

export class HealerEngine {
  /**
   * Cleans and minifies the Playwright accessibility tree to reduce token size and filter noise.
   */
  public static minifyAccessibilityTree(node: any): any {
    if (!node) return null;

    const minified: any = {};
    
    // Retain only key semantic qualities
    if (node.role) minified.role = node.role;
    if (node.name) minified.name = node.name;
    if (node.value !== undefined) minified.value = node.value;
    if (node.description) minified.description = node.description;

    // Recursively process children and remove empty children lists
    if (node.children && Array.isArray(node.children)) {
      const minifiedChildren = node.children
        .map((child: any) => this.minifyAccessibilityTree(child))
        .filter((child: any) => child !== null && Object.keys(child).length > 0);
      
      if (minifiedChildren.length > 0) {
        minified.children = minifiedChildren;
      }
    }

    // Only return node if it contains actual semantic content or children
    if (Object.keys(minified).length === 0) {
      return null;
    }

    return minified;
  }

  /**
   * Main entry point to perform locator self-healing.
   */
  public static async heal(
    originalSelector: string,
    errorMessage: string,
    rawAccessibilityTree: any,
    pageUrl: string
  ): Promise<HealingResult> {
    const minifiedTree = this.minifyAccessibilityTree(rawAccessibilityTree);
    const treeString = JSON.stringify(minifiedTree, null, 2);

    console.log(`[HealerEngine] Intercepted failure for selector: "${originalSelector}" on page: ${pageUrl}`);

    // If Gemini API key is present, attempt live AI resolution
    if (process.env.GEMINI_API_KEY) {
      try {
        return await this.healWithGemini(originalSelector, errorMessage, treeString, pageUrl);
      } catch (err) {
        console.warn('[HealerEngine] Live LLM healing failed, falling back to mock driver', err);
      }
    }

    // Fallback Mock Driver for SauceDemo (ensures framework works out of the box)
    return this.healWithMock(originalSelector, pageUrl);
  }

  /**
   * Resolves a broken selector using the Gemini API.
   */
  private static async healWithGemini(
    originalSelector: string,
    errorMessage: string,
    minifiedTree: string,
    pageUrl: string
  ): Promise<HealingResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `
You are an expert test automation AI assistant specializing in Playwright and the Page Object Model.
Your task is to fix a broken locator (selector) in a Playwright test.

Context:
- Current Page URL: ${pageUrl}
- Broken Selector: ${originalSelector}
- Failure Error: ${errorMessage}
- Minified Accessibility Tree of the current page:
\`\`\`json
${minifiedTree}
\`\`\`

Instructions for Selector Strategy:
We enforce a strict selector strategy priority matrix:
1. getByRole (e.g. page.getByRole('button', { name: 'Log In' })) - Prefer this for semantic elements.
2. getByTestId (e.g. page.getByTestId('login-button')) - Use if role is not unique or has style drift.
3. getByLabel (e.g. page.getByLabel('Username')) - For input forms.
4. getByText (e.g. page.getByText('Products')) - For text nodes.
5. locator('css') (e.g. page.locator('.btn-primary')) - ONLY use if above strategies are completely unavailable.

Do not use alphanumeric dynamic attributes that change per-build. Optimize for resilience.
If you believe the element is missing from the page (e.g., feature removed or page didn't load), return confidence <= 0.3.

Return ONLY a JSON object matching this schema. Do not wrap in markdown code blocks.
Schema:
{
  "healedSelector": "string (the exact Playwright locator chain e.g. \\"getByRole('button', { name: 'Login' })\\" or \\"locator('[data-test=\\\\\\"username\\\\\\"]')\\")",
  "confidence": number (float between 0.0 and 1.0 indicating your confidence),
  "reasoning": "string (brief justification of why this new locator is chosen)"
}
`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error('Gemini API returned empty candidate response');
    }

    // Clean up response if there are any enclosing markdown wrappers
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.substring(7);
    }
    if (cleanJson.endsWith('```')) {
      cleanJson = cleanJson.substring(0, cleanJson.length - 3);
    }
    cleanJson = cleanJson.trim();

    const result = JSON.parse(cleanJson) as HealingResult;
    console.log(`[HealerEngine] Gemini suggested locator: "${result.healedSelector}" with confidence ${result.confidence}`);
    return result;
  }

  /**
   * Offline mock healer containing specific DOM drift maps for the SauceDemo app.
   */
  private static healWithMock(originalSelector: string, pageUrl: string): HealingResult {
    console.log('[HealerEngine] Executing Offline Mock Healing Driver for SauceDemo...');

    const sauceDemoDb: Record<string, { healed: string; reasoning: string }> = {
      // Login Page Elements
      'input#user-name-wrong': {
        healed: "locator('[data-test=\"username\"]')",
        reasoning: "Original selector 'input#user-name-wrong' failed to resolve. Healed to semantic data-test selector."
      },
      '#user-name-wrong': {
        healed: "locator('[data-test=\"username\"]')",
        reasoning: "Original selector '#user-name-wrong' failed. Healed to target 'username' input."
      },
      'input#password-wrong': {
        healed: "locator('[data-test=\"password\"]')",
        reasoning: "Original selector 'input#password-wrong' failed. Recovered via data-test='password' input."
      },
      '#password-wrong': {
        healed: "locator('[data-test=\"password\"]')",
        reasoning: "Original selector '#password-wrong' failed. Recovered via data-test='password' input."
      },
      'input#login-button-wrong': {
        healed: "locator('[data-test=\"login-button\"]')",
        reasoning: "Healed login button selector to use stable data-test identifier."
      },
      '#login-button-wrong': {
        healed: "locator('[data-test=\"login-button\"]')",
        reasoning: "Healed login button selector to use stable data-test identifier."
      },

      // Inventory Page Elements
      'button#add-to-cart-sauce-labs-backpack-wrong': {
        healed: "locator('[data-test=\"add-to-cart-sauce-labs-backpack\"]')",
        reasoning: "Healed add-to-cart locator using the unique data-test attribute."
      },
      '#add-to-cart-sauce-labs-backpack-wrong': {
        healed: "locator('[data-test=\"add-to-cart-sauce-labs-backpack\"]')",
        reasoning: "Healed add-to-cart locator using the unique data-test attribute."
      },
      'a.shopping_cart_link_wrong': {
        healed: "locator('[data-test=\"shopping-cart-link\"]')",
        reasoning: "Healed shopping cart link selector to use data-test identifier."
      },
      '#shopping_cart_container_wrong': {
        healed: "locator('[data-test=\"shopping-cart-link\"]')",
        reasoning: "Healed shopping cart container locator to use data-test shopping-cart-link."
      },

      // Checkout Page Elements
      'button#checkout-wrong': {
        healed: "locator('[data-test=\"checkout\"]')",
        reasoning: "Healed checkout button using stable data-test checkout locator."
      },
      '#checkout-wrong': {
        healed: "locator('[data-test=\"checkout\"]')",
        reasoning: "Healed checkout button using stable data-test checkout locator."
      },
      '#first-name-wrong': {
        healed: "locator('[data-test=\"firstName\"]')",
        reasoning: "Healed input using standard data-test firstName attribute."
      },
      '#last-name-wrong': {
        healed: "locator('[data-test=\"lastName\"]')",
        reasoning: "Healed input using standard data-test lastName attribute."
      },
      '#postal-code-wrong': {
        healed: "locator('[data-test=\"postalCode\"]')",
        reasoning: "Healed input using standard data-test postalCode attribute."
      },
      '#continue-wrong': {
        healed: "locator('[data-test=\"continue\"]')",
        reasoning: "Healed continue button using stable data-test continue locator."
      },
      '#finish-wrong': {
        healed: "locator('[data-test=\"finish\"]')",
        reasoning: "Healed finish button using stable data-test finish locator."
      }
    };

    // Clean selector string from potential whitespace or single quotes
    const cleaned = originalSelector.trim();
    const matched = sauceDemoDb[cleaned];

    if (matched) {
      return {
        healedSelector: matched.healed,
        confidence: 0.95,
        reasoning: matched.reasoning
      };
    }

    // Default fallback if unknown element fails (simulate a failed healing attempt with low confidence)
    return {
      healedSelector: originalSelector,
      confidence: 0.2,
      reasoning: "No matching mock healing signature found for this selector. AI recovery failed."
    };
  }
}
