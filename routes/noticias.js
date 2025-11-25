const express = require('express');
const axios = require('axios');
const router = express.Router();

router.get('/noticias', async (req, res) => {
  try {
    const API_KEY = process.env.GNEWS_API_KEY || '321bcd82eb1c22d5413cd2fc506fe018';
    const response = await axios.get(
      `https://gnews.io/api/v4/search?q=medio ambiente OR clima OR sostenibilidad&lang=es&max=10&apikey=${API_KEY}`
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Error al obtener noticias:', error.message);
    res.status(500).json({ 
      error: 'Error al obtener noticias',
      message: error.message 
    });
  }
});

module.exports = router;