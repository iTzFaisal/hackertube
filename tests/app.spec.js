import { test, expect } from '@playwright/test';

async function waitForImages(page) {
  await page.waitForFunction(() => {
    const images = Array.from(document.images).filter((image) => image.offsetWidth > 0);
    return images.length === 0 || images.every((image) => image.complete);
  }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function focusACard(page) {
  await page.waitForSelector('.page.active .card', { timeout: 60000 });
  for (let i = 0; i < 4; i++) {
    const isCard = await page.evaluate(() => {
      const element = document.activeElement;
      return !!(element && element.classList && element.classList.contains('card'));
    });
    if (isCard) {
      return;
    }
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(250);
  }
  const isCard = await page.evaluate(() => {
    const element = document.activeElement;
    return !!(element && element.classList && element.classList.contains('card'));
  });
  expect(isCard).toBe(true);
}

test('home, details, search, categories and playlists', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForSelector('.page.active .card', { timeout: 60000 });
  await focusACard(page);
  await waitForImages(page);

  await page.screenshot({ path: 'docs/home.png' });

  const firstVid = await page.evaluate(() => {
    const element = document.activeElement;
    return element && element.getAttribute('data-vid');
  });
  expect(firstVid).toBeTruthy();

  // Hold OK opens the video's own page.
  await page.keyboard.down('Enter');
  await page.waitForTimeout(800);
  await page.keyboard.up('Enter');
  await page.waitForSelector('.page.active .details-head', { timeout: 30000 });
  await page.waitForTimeout(800);
  expect(await page.locator('.page.active .details-title').innerText()).not.toBe('');
  await waitForImages(page);

  await page.screenshot({ path: 'docs/details.png' });

  // The library writes to localStorage.
  await page.locator('.page.active [data-key="like"]').click();
  await page.locator('.page.active [data-key="later"]').click();
  const library = await page.evaluate(() => {
    return JSON.parse(localStorage.getItem('hackertube.library.v1'));
  });
  expect(library.liked.length).toBe(1);
  expect(library.later.length).toBe(1);

  // Back returns to the grid and the saved badge is visible.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.page.active .card', { timeout: 30000 });
  const savedBadges = await page.locator('.page.active .saved-badge.on').count();
  expect(savedBadges).toBeGreaterThan(0);

  // Search by words or meaning.
  await page.locator('#sidebar [data-section="search"]').click();
  await page.waitForSelector('.page.active .search-input', { timeout: 30000 });
  await page.locator('.page.active .search-input').fill('rust');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.page.active .row', { timeout: 60000 });
  await waitForImages(page);
  await page.screenshot({ path: 'docs/search.png' });

  // Categories and playlists load their own data.
  await page.locator('#sidebar [data-section="categories"]').click();
  await page.waitForSelector('.page.active .area-block', { timeout: 60000 });
  await page.screenshot({ path: 'docs/categories.png' });

  await page.locator('#sidebar [data-section="playlists"]').click();
  await page.waitForSelector('.page.active .tile', { timeout: 60000 });
  await waitForImages(page);
  await page.screenshot({ path: 'docs/playlists.png' });

  // Open the first playlist and make sure its ordered rows render.
  await page.locator('.page.active .tile').first().click();
  await page.waitForSelector('.page.active .playlist-title', { timeout: 30000 });
  await page.waitForSelector('.page.active .row', { timeout: 30000 });
  expect(await page.locator('.page.active .row').count()).toBeGreaterThan(0);
  await waitForImages(page);
  await page.screenshot({ path: 'docs/playlist.png' });

  // The Watch later grid reads the local library through /api/docs.
  await page.locator('#sidebar [data-section="later"]').click();
  await page.waitForSelector('.page.active .card', { timeout: 60000 });
  expect(await page.locator('.page.active .card').count()).toBeGreaterThan(0);

  // Back pops the section page and returns to Home.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.page.active .home-head', { timeout: 30000 });

  // A filtered grid page (Longs).
  await page.locator('#sidebar [data-section="longs"]').click();
  await page.waitForSelector('.page.active .card', { timeout: 60000 });
  expect(await page.locator('.page.active .page-title').innerText()).toBe('Longs');
  expect(await page.locator('.page.active .card').count()).toBeGreaterThan(0);

  // A category chip opens a filtered grid.
  await page.locator('#sidebar [data-section="categories"]').click();
  await page.waitForSelector('.page.active .area-block', { timeout: 60000 });
  const categoryChip = page.locator('.page.active .area-block .chip').first();
  const categoryName = await categoryChip.locator('span').first().innerText();
  await categoryChip.click();
  await page.waitForSelector('.page.active .page-title', { timeout: 30000 });
  expect(await page.locator('.page.active .page-title').innerText()).toBe(categoryName);
  await page.waitForSelector('.page.active .card', { timeout: 60000 });
  await waitForImages(page);
  await page.screenshot({ path: 'docs/category.png' });

  expect(pageErrors).toEqual([]);
});

test('hands a video to the Samsung YouTube app', async ({ page }) => {
  await page.addInitScript(() => {
    window.__controls = [];

    function ApplicationControl(operation, uri, mime, data, dataList) {
      this.operation = operation;
      this.uri = uri;
      this.data = dataList;
    }

    window.tizen = {
      ApplicationControl: ApplicationControl,
      ApplicationControlData: function (key, values) {
        this.key = key;
        this.values = values;
      },
      application: {
        findAppControl: function (control, success) {
          success([{ id: '111299001912', name: 'YouTube' }]);
        },
        getAppInfo: function () {
          return { id: '111299001912', name: 'YouTube' };
        },
        launchAppControl: function (control, appId, success, failure) {
          window.__controls.push({
            operation: control.operation,
            uri: control.uri,
            appId: appId,
            data: control.data
          });
          if (control.operation === 'http://tizen.org/appcontrol/operation/view') {
            if (failure) {
              failure();
            }
          } else if (success) {
            success();
          }
        },
        getCurrentApplication: function () {
          return { exit: function () {} };
        }
      },
      tvinputdevice: {
        registerKey: function () {}
      }
    };
  });

  await page.goto('/');
  await page.waitForSelector('.page.active .card', { timeout: 60000 });
  await focusACard(page);

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__controls.length >= 2, null, {
    timeout: 15000
  });

  const controls = await page.evaluate(() => window.__controls);
  expect(controls[0].operation).toBe('http://tizen.org/appcontrol/operation/view');
  expect(controls[0].uri).toContain('https://www.youtube.com/watch?v=');
  expect(controls[1].appId).toBe('111299001912');
  expect(controls[1].data[0].key).toBe('PAYLOAD');
  expect(controls[1].data[0].values[0]).toContain('v=');
});
