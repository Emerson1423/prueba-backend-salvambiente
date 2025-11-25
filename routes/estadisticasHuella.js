const express = require('express');
const pool = require('../bd');
const authenticateToken = require('../middleware/auth');



const router = express.Router();
router.get('/estadisticas', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();

    try {
      const [estadisticas] = await conn.query(`
        SELECT 
          COUNT(*) as total_calculos,
          AVG(h.total_emisiones) as promedio_emisiones,
          MIN(h.total_emisiones) as menor_emisiones,
          MAX(h.total_emisiones) as mayor_emisiones,
          MIN(h.fecha) as primer_calculo,
          MAX(h.fecha) as ultimo_calculo
        FROM huella h 
        INNER JOIN perfiles p ON h.id = p.id_huella 
        WHERE p.id_usuario = ?
      `, [req.user.id]);

      const [evolucionMensual] = await conn.query(`
        SELECT 
          YEAR(h.fecha) as anio,
          MONTH(h.fecha) as mes,
          h.total_emisiones,
          h.fecha
        FROM huella h 
        INNER JOIN perfiles p ON h.id = p.id_huella 
        WHERE p.id_usuario = ? 
          AND h.fecha >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        ORDER BY h.fecha ASC
      `, [req.user.id]);

      const [distribucionCategorias] = await conn.query(`
        SELECT 
          CASE 
            WHEN h.total_emisiones < 50 THEN 'Baja'
            WHEN h.total_emisiones < 100 THEN 'Media'
            ELSE 'Alta'
          END as categoria,
          COUNT(*) as cantidad
        FROM huella h 
        INNER JOIN perfiles p ON h.id = p.id_huella 
        WHERE p.id_usuario = ?
        GROUP BY categoria
      `, [req.user.id]);

      const stats = estadisticas[0];

      res.json({
        success: true,
        estadisticas: {
          totalCalculos: stats.total_calculos,
          promedioEmisiones: Math.round(stats.promedio_emisiones || 0),
          menorEmisiones: stats.menor_emisiones,
          mayorEmisiones: stats.mayor_emisiones,
          primerCalculo: stats.primer_calculo,
          ultimoCalculo: stats.ultimo_calculo,
          tieneCalculos: stats.total_calculos > 0
        },
        evolucionMensual: evolucionMensual.map(item => ({
          anio: item.anio,
          mes: item.mes,
          emisiones: item.total_emisiones,
          fecha: item.fecha
        })),
        distribucionCategorias: distribucionCategorias.reduce((acc, item) => {
          acc[item.categoria.toLowerCase()] = item.cantidad;
          return acc;
        }, { baja: 0, media: 0, alta: 0 })
      });

    } finally {
      conn.release();
    }

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ 
      error: "Error al obtener estadísticas",
      detalle: error.message
    });
  }
});
module.exports = router;



