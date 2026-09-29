import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  constructor(page: Page, overrides: { username?: string; password?: string; loginButton?: string } = {}) {
    this.page = page;
    
    // Default selectors for SauceDemo. Allow overrides to simulate dynamic or broken locator rot.
    const usernameSel = overrides.username || 'input#user-name';
    const passwordSel = overrides.password || 'input#password';
    const loginButtonSel = overrides.loginButton || 'input#login-button';

    this.usernameInput = page.locator(usernameSel);
    this.passwordInput = page.locator(passwordSel);
    this.loginButton = page.locator(loginButtonSel);
  }

  async navigate() {
    await this.page.goto('https://www.saucedemo.com/');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
