const axios = require('axios');
// On garde merchant-config juste pour les logos si besoin, mais on fait confiance au VPS
const { MERCHANT_CONFIG } = require('./merchant-config');

const VPS_SCRAPER_URL = 'https://buyoffernow-scraper.onrender.com/scrape';

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { query } = JSON.parse(event.body);

        console.log(`[Relay] Demande au VPS pour : "${query}"`);

        // 1. On appelle le VPS (Google Shopping Aggrégateur)
        const response = await axios.post(VPS_SCRAPER_URL, {
            query: query,
            merchantName: "Google Shopping" 
        }, { timeout: 60000 });

        const rawProducts = response.data.results || [];
        console.log(`[Relay] Reçu ${rawProducts.length} produits du VPS.`);

        // 2. On nettoie juste un peu les données pour le frontend
        const cleanProducts = rawProducts.map(p => {
            // Si le lien est relatif (ex: /url?q=...), on ajoute google.com
            // Si le lien est absolu (ex: https://ebay...), on le garde tel quel !
            let finalLink = p.link;
            if (finalLink && !finalLink.startsWith('http')) {
                finalLink = `https://www.google.com${finalLink}`;
            }

            // On essaie de trouver un beau logo pour le marchand
            let merchantLogo = 'https://via.placeholder.com/50?text=Shop';
            if (p.shop || p.merchant) {
                const name = (p.shop || p.merchant).toLowerCase();
                // Recherche simple dans notre config
                const key = Object.keys(MERCHANT_CONFIG).find(k => name.includes(k.split('.')[0]));
                if (key) merchantLogo = MERCHANT_CONFIG[key].logo;
                else merchantLogo = `https://www.google.com/s2/favicons?domain=${name}.com&sz=64`;
            }

            return {
                title: p.title || p.item || 'Produit',
                price: p.price || 'Voir le prix',
                image: p.image || p.img || 'https://via.placeholder.com/150', // L'image vient du VPS !
                link: finalLink,
                merchant: p.shop || p.merchant || 'Boutique', // Le nom vient du VPS !
                merchantLogo: merchantLogo,
                platform: 'vps'
            };
        });

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ results: cleanProducts })
        };

    } catch (error) {
        console.error('[Relay] Error:', error.message);
        return { statusCode: 500, body: JSON.stringify({ results: [] }) };
    }
};
