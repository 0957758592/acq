import puppeteer from 'puppeteer';

// Real Puppeteer connector for createCookieSessionRestorer: connects to a session's
// CDP url and returns { page, close }. Kept separate so the restorer stays
// puppeteer-free and unit-testable with a fake connector.
export async function puppeteerConnect(cdpUrl) {
  const browser = await puppeteer.connect({ browserWSEndpoint: cdpUrl });
  const page = (await browser.pages())[0] || (await browser.newPage());
  return {
    page,
    browser,
    close: async () => { await browser.disconnect(); }
  };
}
