const express = require('express');
const cors = require('cors');
const { scrapeMerchant } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('BuyOfferNow VPS Scraper is LIVE! 🚀'));

app.post('/scrape', async (req, res) => {
    const { query, merchantUrl, merchantName } = req.body;

    if (!query || !merchantUrl) {
        return res.status(400).json({ error: 'Paramètres manquants' });
    }

    console.log(`[Requête] Scraping demandé pour : ${merchantName} -> ${query}`);

    try {
        const results = await scrapeMerchant(merchantUrl, merchantName, query);
        res.json({ results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
