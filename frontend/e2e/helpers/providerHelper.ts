import { Page } from '@playwright/test';

/**
 * Wait for providers to be loaded into the Redux store
 * This prevents race conditions where tests try to use the dropdown before data loads
 */
export async function waitForProvidersLoaded(page: Page, timeout = 10000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Check if provider select has options
    const optionCount = await page.locator('select#agent-type option').count();

    if (optionCount > 0) { // No placeholder - direct provider options
      console.log(`✅ Providers loaded: ${optionCount} providers available`);
      return;
    }

    // Wait a bit before checking again
    await page.waitForTimeout(100);
  }

  throw new Error(`Providers not loaded within ${timeout}ms`);
}

/**
 * Alternative: Wait for the /api/providers response
 */
export async function waitForProvidersResponse(page: Page): Promise<void> {
  await page.waitForResponse(
    (response) => response.url().includes('/api/providers') && response.status() === 200,
    { timeout: 10000 }
  );
  console.log('✅ Providers API response received');

  // Give Redux a moment to update state and re-render
  await page.waitForTimeout(500);
}
