const { chromium } = require('playwright-chromium');
const cheerio = require('cheerio');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function scrapeMerchant(url, merchantName, query) {
    let browser;
    try {
        console.log(`[VPS] Mode Ultra-Premium pour : ${query}`);

        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--single-process', // Crucial pour Render 512Mo
                '--disable-gpu'
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 }
        });
        const page = await context.newPage();

        // 🛡️ BOUCLIER ANTI-CRASH (On bloque le lourd, on garde le texte et les URLs d'images)
        await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['media', 'font', 'other'].includes(type)) route.abort();
            else route.continue();
        });

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop&hl=en&gl=us`;
        
        // Navigation rapide
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        
        // ✨ Petit scroll magique pour faire apparaître les images cachées
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(1500);

        const html = await page.content();
        const $ = cheerio.load(html);
        
        let dataForAI = "";
        // On cible les cartes produits de Google
        $('.sh-dgr__content, .sh-np__click-target').slice(0, 8).each((i, el) => {
            const title = $(el).find('h3').text().trim();
            const price = $(el).find('span[aria-hidden="true"]').first().text().trim();
            const merchant = $(el).find('.a8330w, .I89e9d').first().text().trim() || "Store";
            const img = $(el).find('img').attr('src');
            const link = $(el).find('a').attr('href');
            
            if (title && price) {
                dataForAI += `Item: ${title} | Price: ${price} | Shop: ${merchant} | Img: ${img} | Link: ${link}\n---\n`;
            }
        });

        // 🧠 Intelligence Artificielle pour le nettoyage
        const response = await groq.chat.completions.create({
            messages: [
                { 
                    role: 'system', 
                    content: 'You are a professional Shopping API. Return a JSON object with a "products" array. Ensure prices are numbers and URLs are absolute.' 
                },
                { 
                    role: 'user', 
                    content: `Convert this shopping data to a clean JSON array:\n\n${dataForAI}` 
                }
            ],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        await browser.close();
        
        return result.products || [];

    } catch (error) {
        console.error("[VPS Error]", error.message);
        if (browser) await browser.close();
        return [];
    }
}

module.exports = { scrapeMerchant };
