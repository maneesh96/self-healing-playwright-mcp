import { test, expect } from '../fixtures/selfHealingFixture';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';
import { HealingCache } from '../core/cache';
import { TelemetryStore } from '../core/telemetry';

test.describe('SauceDemo E2E Suite with AI Self-Healing Locators via MCP', () => {
  
  test.beforeEach(async () => {
    // Keep sqlite open and initialized
    await HealingCache.getDatabase();
  });

  test('Successful Login and Cart Flow (Normal)', async ({ page }) => {
    // Clear cache & telemetry to ensure standard benchmark execution
    await HealingCache.clear();
    await TelemetryStore.clear();

    const loginPage = new LoginPage(page);
    const inventoryPage = new InventoryPage(page);

    await loginPage.navigate();
    await loginPage.login('standard_user', 'secret_sauce');
    
    // Validate we successfully logged in by checking page URL
    await expect(page).toHaveURL(/inventory.html/);

    await inventoryPage.addBackpackToCart();
    await inventoryPage.goToCart();
    await expect(page).toHaveURL(/cart.html/);

    await inventoryPage.checkout();
    await expect(page).toHaveURL(/checkout-step-one.html/);

    await inventoryPage.fillCheckoutInformation('John', 'Doe', '90210');
    await expect(page).toHaveURL(/checkout-step-two.html/);

    await inventoryPage.finishCheckout();
    await expect(page).toHaveURL(/checkout-complete.html/);

    const successHeader = page.locator('.complete-header');
    await expect(successHeader).toHaveText('Thank you for your order!');
  });

  test('Self-Healing Flow (Corrupted Locators)', async ({ page }) => {
    // Clear cache & telemetry to ensure we test real-time AI/Mock healing resolution
    await HealingCache.clear();
    await TelemetryStore.clear();

    // Intentionally corrupt selectors to simulate component modifications / design system changes
    const loginPage = new LoginPage(page, {
      username: 'input#user-name-wrong',
      password: 'input#password-wrong',
      loginButton: 'input#login-button-wrong'
    });

    const inventoryPage = new InventoryPage(page, {
      addToCartBtn: 'button#add-to-cart-sauce-labs-backpack-wrong',
      cartLink: 'a.shopping_cart_link_wrong',
      checkoutBtn: 'button#checkout-wrong',
      firstName: '#first-name-wrong',
      lastName: '#last-name-wrong',
      postalCode: '#postal-code-wrong',
      continueBtn: '#continue-wrong',
      finishBtn: '#finish-wrong'
    });

    await loginPage.navigate();
    
    // Each of these steps will time out (circuit breaker triggers at 3s)
    // The framework will capture the accessibility tree, resolve via MCP, and succeed.
    await loginPage.login('standard_user', 'secret_sauce');
    await expect(page).toHaveURL(/inventory.html/);

    await inventoryPage.addBackpackToCart();
    await inventoryPage.goToCart();
    await expect(page).toHaveURL(/cart.html/);

    await inventoryPage.checkout();
    await expect(page).toHaveURL(/checkout-step-one.html/);

    await inventoryPage.fillCheckoutInformation('John', 'Doe', '90210');
    await expect(page).toHaveURL(/checkout-step-two.html/);

    await inventoryPage.finishCheckout();
    await expect(page).toHaveURL(/checkout-complete.html/);

    const successHeader = page.locator('.complete-header');
    await expect(successHeader).toHaveText('Thank you for your order!');
  });

  test('Cached Healing Verification (Second Run Performance)', async ({ page }) => {
    // Notice: We DO NOT clear the cache here. We expect all corrupted selectors to be resolved instantly from cache.
    const loginPage = new LoginPage(page, {
      username: 'input#user-name-wrong',
      password: 'input#password-wrong',
      loginButton: 'input#login-button-wrong'
    });

    const inventoryPage = new InventoryPage(page, {
      addToCartBtn: 'button#add-to-cart-sauce-labs-backpack-wrong',
      cartLink: 'a.shopping_cart_link_wrong',
      checkoutBtn: 'button#checkout-wrong',
      firstName: '#first-name-wrong',
      lastName: '#last-name-wrong',
      postalCode: '#postal-code-wrong',
      continueBtn: '#continue-wrong',
      finishBtn: '#finish-wrong'
    });

    // Time the execution of this test
    const startTime = Date.now();

    await loginPage.navigate();
    await loginPage.login('standard_user', 'secret_sauce');
    await expect(page).toHaveURL(/inventory.html/);

    await inventoryPage.addBackpackToCart();
    await inventoryPage.goToCart();
    await expect(page).toHaveURL(/cart.html/);

    await inventoryPage.checkout();
    await expect(page).toHaveURL(/checkout-step-one.html/);

    await inventoryPage.fillCheckoutInformation('John', 'Doe', '90210');
    await expect(page).toHaveURL(/checkout-step-two.html/);

    await inventoryPage.finishCheckout();
    await expect(page).toHaveURL(/checkout-complete.html/);

    const duration = Date.now() - startTime;
    console.log(`[Cache Verification] Cached self-healing test run duration: ${duration}ms`);

    // Verify it completed rapidly without 3-second circuit breaker waits since cache hit immediately
    // 9 healed elements with 3s timeout each would take at least 27 seconds if not cached.
    // If cached, the whole test should complete in 3-6 seconds.
    expect(duration).toBeLessThan(12000);
  });
});
