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

        // Navigation (on attend que le réseau soit calme)
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

        // On attend un peu pour être sûr que le JS a fini de charger les prix
        await page.waitForTimeout(3000);

        // Capture du HTML
        let html = await page.content();

        // Nettoyage rapide du HTML pour Groq
        const $ = cheerio.load(html);
        $('script, style, noscript, iframe, svg, header, footer').remove();
        let cleanHTML = $('body').html().substring(0, 15000); // 15k caractères max

        // Extraction Groq
        const response = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'Tu es un expert en extraction de données. Extrait exactement 3 produits (titre, prix sans devise, devise, lien, image) sous forme de JSON pur.'
                },
                {
                    role: 'user',
                    content: `HTML de ${merchantName} pour "${query}":\n\n${cleanHTML}`
                }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            max_tokens: 1000
        });

        let products = JSON.parse(response.choices[0].message.content.trim().replace(/```json|```/g, ''));

        await browser.close();
        return products;

    } catch (error) {
        console.error(`[VPS Error] ${merchantName}:`, error.message);
        if (browser) await browser.close();
        return [];
    }
}

module.exports = { scrapeMerchant };
