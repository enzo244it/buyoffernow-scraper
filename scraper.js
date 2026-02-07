const { chromium } = require('playwright-chromium');
const cheerio = require('cheerio');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function scrapeMerchant(url, merchantName, query) {
    let browser;
    try {
        console.log(`[VPS] Extraction Google Shopping + Images...`);

        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
        });

        const page = await browser.newPage();

        // 💡 L'astuce : On bloque le chargement visuel mais on autorise le HTML
        await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'media', 'font'].includes(type)) route.abort();
            else route.continue();
        });

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop&hl=en&gl=us`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // On récupère le HTML partiel (très léger sans images)
        const html = await page.content();
        const $ = cheerio.load(html);
        
        let dataForAI = "";
        // On cible les blocs de résultats Google Shopping
        $('.sh-dgr__content').slice(0, 6).each((i, el) => {
            const title = $(el).find('h3').text();
            const price = $(el).find('.a8330w').text() || $(el).find('span[aria-hidden="true"]').first().text();
            const imgUrl = $(el).find('img').attr('src');
            const link = "https://www.google.com" + $(el).find('a').attr('href');
            
            dataForAI += `Produit: ${title} | Prix: ${price} | ImageURL: ${imgUrl} | Link: ${link}\n---\n`;
        });

        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a product JSON API. Result must be a JSON array of objects.' },
                { role: 'user', content: `Format this Google Shopping data into a clean JSON array (title, price (number), currency, image, link, merchant):\n\n${dataForAI}` }
            ],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        await browser.close();
        return result.products || result;

    } catch (error) {
        if (browser) await browser.close();
        return [{ title: "Erreur", error: error.message }];
    }
}

module.exports = { scrapeMerchant };
