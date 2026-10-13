import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';

test.describe('SauceDemo checkout', () => {
  test('standard user can buy the backpack end to end', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const inventoryPage = new InventoryPage(page);

    await loginPage.navigate();
    await loginPage.login('standard_user', 'secret_sauce');
    await expect(page).toHaveURL(/\/inventory\.html$/);

    await inventoryPage.addBackpackToCart();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('1');

    await inventoryPage.goToCart();
    await expect(page).toHaveURL(/\/cart\.html$/);
    await expect(page.locator('.cart_item .inventory_item_name')).toHaveText('Sauce Labs Backpack');

    await inventoryPage.checkout();
    await expect(page).toHaveURL(/\/checkout-step-one\.html$/);

    await inventoryPage.fillCheckoutInformation('John', 'Doe', '90210');
    await expect(page).toHaveURL(/\/checkout-step-two\.html$/);

    await inventoryPage.finishCheckout();
    await expect(page).toHaveURL(/\/checkout-complete\.html$/);
    await expect(page.locator('.complete-header')).toHaveText('Thank you for your order!');
  });

  test('locked-out user is refused with an error message', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.navigate();
    await loginPage.login('locked_out_user', 'secret_sauce');

    await expect(page.locator('[data-test="error"]')).toHaveText(
      'Epic sadface: Sorry, this user has been locked out.',
    );
    await expect(page).not.toHaveURL(/inventory\.html/);
  });
});
