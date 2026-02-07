const { chromium } = require('playwright-chromium');
const cheerio = require('cheerio');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function scrapeMerchant(url, merchantName, query) {
    let browser;
    try {
        console.log(`[VPS] Lancement du scraping pour ${merchantName}...`);

        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 }
        });

        const page = await context.newPage();

        // Navigation plus rapide
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        
        // Pause pour le chargement des prix
        await page.waitForTimeout(2000);

        // Capture du HTML
        let html = await page.content();
        const $ = cheerio.load(html);

        // Nettoyage
        $('script, style, noscript, iframe, svg, header, footer, nav').remove();

        // EXTRACTION INTELLIGENTE : On cherche les blocs produits
        let productHTML = "";
        const productSelectors = ['.s-item', '[data-item-id]', '.product-card', '.result-item'];

        for (const selector of productSelectors) {
            if ($(selector).length > 2) {
                $(selector).slice(0, 4).each((i, el) => {
                    productHTML += $(el).html() + " ---ITEM_SEPARATOR--- ";
                });
                break;
            }
        }

        if (!productHTML) productHTML = $('body').html().substring(0, 15000);

        // Extraction Groq
        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a data extraction API. Output ONLY valid JSON array.' },
                { role: 'user', content: `Extract 3 products from this HTML. Return a JSON ARRAY of objects with: title, price (number), currency (string), image (url), link (url).\n\nHTML:\n${productHTML.substring(0, 15000)}` }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content);
        let products = Array.isArray(parsed) ? parsed : (parsed.products || []);

        await browser.close();
        return products;

    } catch (error) {
        console.error(`[VPS Error] ${merchantName}:`, error.message);
        if (browser) await browser.close();
        return [{ title: "Error", error: error.message }];
    }
}

module.exports = { scrapeMerchant };
