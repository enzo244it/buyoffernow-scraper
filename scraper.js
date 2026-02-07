const { chromium } = require('playwright-chromium');
const cheerio = require('cheerio');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function scrapeMerchant(url, merchantName, query) {
    let browser;
    try {
        console.log(`[VPS] Recherche Aggrégée pour : ${query}`);

        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop&hl=en&gl=us`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        
        // On attend que les images soient chargées
        await page.waitForTimeout(2000);

        const html = await page.content();
        const $ = cheerio.load(html);
        
        let dataForAI = "";
        // On extrait les titres, prix, marchands et images
        $('.sh-dgr__content, .sh-np__click-target').slice(0, 10).each((i, el) => {
            const title = $(el).find('h3').text().trim();
            const price = $(el).find('span[aria-hidden="true"]').first().text().trim();
            const merchant = $(el).find('.a8330w, .I89e9d').text().trim() || "Store";
            const img = $(el).find('img').attr('src');
            const link = $(el).find('a').attr('href');
            
            if (title && price) {
                dataForAI += `Produit: ${title} | Prix: ${price} | Boutique: ${merchant} | Image: ${img} | Lien: ${link}\n---\n`;
            }
        });

        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a Shopping API. Return a JSON object with a "products" array. Extract title, price (number), currency, image, link, and merchant name.' },
                { role: 'user', content: `Convert this Shopping data to JSON:\n\n${dataForAI}` }
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
