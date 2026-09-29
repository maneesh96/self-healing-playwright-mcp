import { Page, Locator } from '@playwright/test';

export interface InventoryOverrides {
  addToCartBtn?: string;
  cartLink?: string;
  checkoutBtn?: string;
  firstName?: string;
  lastName?: string;
  postalCode?: string;
  continueBtn?: string;
  finishBtn?: string;
}

export class InventoryPage {
  readonly page: Page;
  readonly addToCartBtn: Locator;
  readonly cartLink: Locator;
  readonly checkoutBtn: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly postalCodeInput: Locator;
  readonly continueBtn: Locator;
  readonly finishBtn: Locator;

  constructor(page: Page, overrides: InventoryOverrides = {}) {
    this.page = page;

    // Stable selectors with ability to override to simulate dynamic component issues
    const addToCartSel = overrides.addToCartBtn || 'button#add-to-cart-sauce-labs-backpack';
    const cartSel = overrides.cartLink || 'a.shopping_cart_link';
    const checkoutSel = overrides.checkoutBtn || 'button#checkout';
    const firstSel = overrides.firstName || 'input#first-name';
    const lastSel = overrides.lastName || 'input#last-name';
    const postalSel = overrides.postalCode || 'input#postal-code';
    const continueSel = overrides.continueBtn || 'input#continue';
    const finishSel = overrides.finishBtn || 'button#finish';

    this.addToCartBtn = page.locator(addToCartSel);
    this.cartLink = page.locator(cartSel);
    this.checkoutBtn = page.locator(checkoutSel);
    this.firstNameInput = page.locator(firstSel);
    this.lastNameInput = page.locator(lastSel);
    this.postalCodeInput = page.locator(postalSel);
    this.continueBtn = page.locator(continueSel);
    this.finishBtn = page.locator(finishSel);
  }

  async addBackpackToCart() {
    await this.addToCartBtn.click();
  }

  async goToCart() {
    await this.cartLink.click();
  }

  async checkout() {
    await this.checkoutBtn.click();
  }

  async fillCheckoutInformation(firstName: string, lastName: string, postalCode: string) {
    await this.firstNameInput.fill(firstName);
    await this.lastNameInput.fill(lastName);
    await this.postalCodeInput.fill(postalCode);
    await this.continueBtn.click();
  }

  async finishCheckout() {
    await this.finishBtn.click();
  }
}
