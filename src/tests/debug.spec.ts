import { test, expect } from '@playwright/test';

test('Debug page properties', async ({ page }) => {
  console.log('--- Debugging Page Properties ---');
  console.log('page.accessibility:', typeof page.accessibility);
  if (page.accessibility) {
    console.log('page.accessibility.snapshot:', typeof page.accessibility.snapshot);
  }
  console.log('---------------------------------');
});
