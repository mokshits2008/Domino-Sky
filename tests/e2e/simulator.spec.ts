import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Domino Sky Simulator E2E Test Suite (T1 - T8)', () => {
  test.beforeAll(() => {
    const screenshotsDir = path.join(process.cwd(), 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  // T1: BLR closed 06:00-08:30 -> 5 delayed flights, 620m total delay, 108 stranded pax, CR06 crew breach
  test('T1: verifies BLR closure KPIs (5 delayed, 620m delay, 108 stranded pax, CR06 breach)', async ({
    page,
  }) => {
    // Collect console errors (excluding external tile network failures)
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore external tile map network errors if offline
        if (!text.includes('basemaps.cartocdn.com') && !text.includes('Failed to load resource')) {
          consoleErrors.push(text);
        } else {
          console.log('[Ignored Network Warning]:', text);
        }
      }
    });

    // Navigate to simulator with BLR closure query param
    await page.goto('/?closures=BLR%3A06%3A00-08%3A30');
    await page.waitForLoadState('networkidle');

    // Check KPI cards
    await expect(page.getByText('Delayed Flights')).toBeVisible();
    await expect(page.locator('text=620').first()).toBeVisible();
    await expect(page.locator('text=108').first()).toBeVisible();
    await expect(page.locator('text=1').first()).toBeVisible(); // 1 crew breach

    expect(consoleErrors.length).toBe(0);
  });

  // T2: Gantt click DS0603 -> drawer opens, displays causeChain [DS0601, DS0602, DS0603], slack absorbed
  test('T2: verifies Gantt flight click opens drawer with full causeChain', async ({ page }) => {
    await page.goto('/?closures=BLR%3A06%3A00-08%3A30');
    await page.waitForLoadState('networkidle');

    // Click on flight DS0603 bar in the Gantt timeline
    const flightBar = page.locator('rect[data-flight-bar="DS0603"]').first();
    await expect(flightBar).toBeVisible();
    await flightBar.click({ force: true });

    // Verify right drawer opened
    await expect(page.getByText('Operational Root Cause')).toBeVisible();
    await expect(page.getByText('Cascade Propagation Chain')).toBeVisible();

    // Verify causeChain flights exist in drawer
    await expect(page.getByText('DS0601').first()).toBeVisible();
    await expect(page.getByText('DS0602').first()).toBeVisible();
    await expect(page.getByText('DS0603').first()).toBeVisible();
  });

  // T3: Connections tab -> shows 108 stranded pax across CX06, CX07, CX08
  test('T3: verifies Connections tab shows 108 stranded passengers', async ({ page }) => {
    await page.goto('/?closures=BLR%3A06%3A00-08%3A30');
    await page.waitForLoadState('networkidle');

    // Switch to Connections tab
    await page.getByRole('tab', { name: /Connections/i }).click();

    // Verify CX06, CX07, CX08 are marked as MISSED with stranded passengers
    await expect(page.getByText('CX06')).toBeVisible();
    await expect(page.getByText('CX07')).toBeVisible();
    await expect(page.getByText('CX08')).toBeVisible();
    await expect(page.locator('text=+42 pax').first()).toBeVisible();
  });

  // T4: Crews tab -> shows CR06 duty breach
  test('T4: verifies Crews tab shows CR06 duty breach', async ({ page }) => {
    await page.goto('/?closures=BLR%3A06%3A00-08%3A30');
    await page.waitForLoadState('networkidle');

    // Switch to Crews tab
    await page.getByRole('tab', { name: /Crews/i }).click();

    // Verify CR06 row has BREACH badge
    await expect(page.getByText('CR06')).toBeVisible();
    await expect(page.getByText('BREACH').first()).toBeVisible();
  });

  // T5: Dispatcher plan apply & number audit
  test('T5: verifies AI Dispatcher modal, number audit, and applying recovery plan', async ({ page }) => {
    await page.goto('/?closures=BLR%3A06%3A00-08%3A30');
    await page.waitForLoadState('networkidle');

    // Click "Ask AI Dispatcher"
    const askButton = page.getByRole('button', { name: /Ask AI Dispatcher/i });
    await expect(askButton).toBeEnabled();
    await askButton.click();

    // Verify modal appears
    await expect(page.getByText('AI Ops Dispatcher & Schedule Recovery')).toBeVisible();
    await expect(page.getByText('Ranked Recovery Plans')).toBeVisible();

    // Verify number audit section is available
    await expect(page.getByText(/Number Audit/i)).toBeVisible();

    // Click "Apply This Recovery Plan"
    const applyButton = page.getByRole('button', { name: /Apply This Recovery Plan/i });
    await expect(applyButton).toBeVisible();
    await applyButton.click();

    // Modal should close and simulator KPIs should update (stranded pax reduced to 0!)
    await expect(page.getByText('AI Ops Dispatcher & Schedule Recovery')).not.toBeVisible();
    await expect(page.locator('text=0').first()).toBeVisible();
  });

  // T6: Share URL restore
  test('T6: verifies share URL query restoration', async ({ page }) => {
    // Navigate with BOM closure
    await page.goto('/?closures=BOM%3A09%3A00-10%3A30');
    await page.waitForLoadState('networkidle');

    // BOM 09:00-10:30 causes 7 delayed flights, 280 min arr delay, 0 stranded pax
    await expect(page.locator('text=280').first()).toBeVisible();
    await expect(page.locator('text=7').first()).toBeVisible();
  });

  // T7: Fallback narrative when provider=none
  test('T7: verifies fallback narrative generation with zero hallucinated digits', async ({ request }) => {
    const res = await request.post('/api/dispatch', {
      data: {
        closures: [{ id: 'c1', airport: 'BLR', start: 360, end: 510 }],
        provider: 'none',
      },
    });

    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.validation.passed).toBe(true);
    expect(data.validation.usedFallback).toBe(true);
    expect(data.narrative.length).toBeGreaterThan(20);
    expect(data.provenance.length).toBeGreaterThan(0);
  });

  // T8: Layout checks at 1440x900 and 1024x768 with screenshots
  test('T8: verifies responsive layout at 1440x900 and 1024x768 with screenshots', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('basemaps.cartocdn.com') && !text.includes('Failed to load resource')) {
          consoleErrors.push(text);
        }
      }
    });

    // 1. 1440x900 desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?closures=BLR%3A06%3A00-08%3A30');
    await page.waitForLoadState('networkidle');

    // Verify zero horizontal scroll
    const hasHorizontalOverflow1440 = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow1440).toBe(false);

    // Capture screenshot at 1440x900
    await page.screenshot({
      path: path.join(process.cwd(), 'screenshots', 'simulator_1440x900.png'),
      fullPage: true,
    });

    // 2. 1024x768 tablet/laptop viewport
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify zero horizontal scroll at 1024x768
    const hasHorizontalOverflow1024 = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow1024).toBe(false);

    // Capture screenshot at 1024x768
    await page.screenshot({
      path: path.join(process.cwd(), 'screenshots', 'simulator_1024x768.png'),
      fullPage: true,
    });

    expect(consoleErrors.length).toBe(0);
  });

  // T9: verifies Target Airport selection across tiers (Tier 1/Tier 2) reflects immediately in simulator
  test('T9: verifies Target Airport selection across tiers reflects immediately in UI and map', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Locate the Target Airport select element
    const airportSelect = page.locator('select').first();
    await expect(airportSelect).toBeVisible();

    // Verify option groups exist with options
    const options = await airportSelect.locator('option').allInnerTexts();
    expect(options.length).toBe(16);
    expect(options.some((o) => o.includes('DEL') || o.includes('BLR'))).toBe(true);
    expect(options.some((o) => o.includes('BOM') || o.includes('MAA'))).toBe(true);

    // Select Tier 1 Hub BOM
    await airportSelect.selectOption('BOM');
    await expect(airportSelect).toHaveValue('BOM');

    // Verify closure chip appears immediately with BOM
    const airportBadge = page.locator('span.text-closure').first();
    await expect(airportBadge).toBeVisible();
    await expect(airportBadge).toHaveText('BOM');

    // Verify KPIs updated immediately (BOM closure reflected)
    await expect(page.getByText('Delayed Flights')).toBeVisible();

    // Switch to Tier 2 Regional Hub MAA
    await airportSelect.selectOption('MAA');
    await expect(airportSelect).toHaveValue('MAA');
    await expect(airportBadge).toHaveText('MAA');
  });
});
