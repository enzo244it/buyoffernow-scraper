const { chromium } = require('playwright-chromium');
const cheerio = require('cheerio');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function scrapeMerchant(url, merchantName, query) {
    let browser;
    try {
        console.log(`[VPS] Scraping ${merchantName}...`);

        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        const context = await browser.newContext({ userAgent: 'Mozilla/5.0...' });
        const page = await context.newPage();

        // On bloque JUSTE les images et vidéos (on garde le CSS pour la structure)
        await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'media', 'font'].includes(type)) route.abort();
            else route.continue();
        });

        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        
        // On récupère tout le texte de la page, c'est plus léger que le HTML
        const text = await page.evaluate(() => document.body.innerText);
        const html = await page.content(); // On garde un peu de HTML au cas où
        
        const $ = cheerio.load(html);
        let sample = "";
        
        // On cible spécifiquement les liens qui ont l'air d'être des produits
        $('a').each((i, el) => {
            const linkText = $(el).text().trim();
            if (linkText.length > 20) { // Un titre de produit est long
                sample += linkText + " | URL: " + $(el).attr('href') + "\n";
            }
        });

        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are a product extractor. Return JSON array.' },
                { role: 'user', content: `Extract 3 products (title, price, currency, link, image) from this text search results for "${query}":\n\n${sample.substring(0, 10000)}` }
            ],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: "json_object" }
        });

        const parsed = JSON.parse(response.choices[0].message.content);
        await browser.close();
        return parsed.products || parsed;

    } catch (error) {
        if (browser) await browser.close();
        return [{ title: "Error", message: error.message }];
    }
}

module.exports = { scrapeMerchant };
