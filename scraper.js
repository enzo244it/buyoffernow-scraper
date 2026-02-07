const { chromium } = require('playwright-chromium');
const cheerio = require('cheerio');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function scrapeMerchant(url, merchantName, query) {
    let browser;
    try {
        console.log(`[VPS] Recherche Maximale Google Shopping pour : ${query}`);

        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
        });

        const context = await browser.newContext({ userAgent: 'Mozilla/5.0...' });
        const page = await context.newPage();

        // 🛡️ Bouclier déjà en place
        await page.route('**/*', (route) => {
            if (['media', 'font'].includes(route.request().resourceType())) route.abort();
            else route.continue();
        });

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop&hl=en&gl=us`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        
        await page.evaluate(() => window.scrollBy(0, 800)); // Scroll plus profond
        await page.waitForTimeout(1500);

        const html = await page.content();
        const $ = cheerio.load(html);
        
        let dataForAI = "";
        // 🚀 ON PASSE À 15 POUR QUE GROQ EN GARDE AU MOINS 10 BONS
        $('.sh-dgr__content, .sh-np__click-target').slice(0, 15).each((i, el) => {
            const title = $(el).find('h3').text().trim();
            const price = $(el).find('span[aria-hidden="true"]').first().text().trim();
            const merchant = $(el).find('.a8330w, .I89e9d').first().text().trim() || "Store";
            const img = $(el).find('img').attr('src');
            const link = $(el).find('a').attr('href');
            
            if (title && price) {
                dataForAI += `Produit: ${title} | Prix: ${price} | Boutique: ${merchant} | Image: ${img} | Lien: ${link}\n---\n`;
            }
        });

        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a Shopping API. Return a JSON object with a "products" array containing up to 10 products.' },
                { role: 'user', content: `Analyze this data and return exactly 10 products in JSON:\n\n${dataForAI}` }
            ],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        await browser.close();
        return result.products || [];

    } catch (error) {
        if (browser) await browser.close();
        return [];
    }
}

module.exports = { scrapeMerchant };
