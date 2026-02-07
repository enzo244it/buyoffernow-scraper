const { chromium } = require('playwright-chromium');
const cheerio = require('cheerio');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function scrapeMerchant(url, merchantName, query) {
    let browser;
    try {
        console.log(`[VPS] Scraping ${merchantName} (Mode Ultra-Léger)...`);

        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--single-process', // Crucial pour économiser la RAM sur Render
                '--hide-scrollbars'
            ]
        });

        const page = await browser.newPage();
        
        // BLOQUER LES IMAGES ET CSS pour économiser la RAM
        await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        // Navigation (on n'attend pas tout, juste le texte)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const html = await page.content();
        const $ = cheerio.load(html);
        
        // Nettoyage immédiat
        $('script, style, noscript, iframe, svg, header, footer, nav, ad').remove();

        let productHTML = "";
        const selectors = ['.s-item', '[data-item-id]', '.product-card'];
        for (const s of selectors) {
            if ($(s).length > 2) {
                $(s).slice(0, 3).each((i, el) => {
                    productHTML += $(el).text().replace(/\s+/g, ' ') + "\n"; 
                });
                break;
            }
        }

        if (!productHTML) productHTML = "Aucun produit trouvé dans le texte.";

        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'Extract 3 products as JSON array.' },
                { role: 'user', content: `Extract title, price, currency, image, link from:\n${productHTML.substring(0, 8000)}` }
            ],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: "json_object" }
        });

        const parsed = JSON.parse(response.choices[0].message.content);
        await browser.close();
        return Array.isArray(parsed) ? parsed : (parsed.products || []);

    } catch (error) {
        console.error(`[VPS Error] ${merchantName}:`, error.message);
        if (browser) await browser.close();
        return [{ title: "Error", error: "Serveur trop chargé, réessayez dans 10 sec." }];
    }
}

module.exports = { scrapeMerchant };
