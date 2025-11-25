const express = require('express');
const pool = require('../bd');
const router = express.Router();

// guardar puntuación 
router.post('/puntuacion', async (req, res) => {
  try {
    const { usuario_id, puntuacion, tiempo_segundos, eficiencia, aciertos, total_residuos } = req.body;

    await pool.execute(
      `DELETE FROM puntuaciones_juego1 WHERE usuario_id = ?`,
    [usuario_id]
    );

    await pool.execute(
      `INSERT INTO puntuaciones_juego1 
      (usuario_id, puntuacion, tiempo_segundos, eficiencia, aciertos, total_residuos, fecha_juego) 
      VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [usuario_id, puntuacion, tiempo_segundos, eficiencia, aciertos, total_residuos]
    );

    res.json({ 
      success: true, 
      message: 'Puntuación guardada correctamente',
    });

  } catch (error) {
    console.error('Error guardando puntuación:', error);
    res.status(500).json({ error: 'Error al guardar la puntuación' });
  }
});

// obtener leaderboard
router.get('/leaderboard', async (req, res) => {    
    const [rows] = await pool.execute(`
      SELECT u.usuario, pj.puntuacion, pj.aciertos, pj.total_residuos, pj.tiempo_segundos, pj.eficiencia, pj.fecha_juego
      FROM puntuaciones_juego1 pj
      JOIN usuarios u ON pj.usuario_id = u.id
      ORDER BY pj.puntuacion DESC, pj.tiempo_segundos ASC
      LIMIT 10
    `);
    res.json(rows);

});

// obtener puntuación específica del usuario 
router.get('/usuario/:id', async (req, res) => {

    const [rows] = await pool.execute(`
      SELECT puntuacion, tiempo_segundos, eficiencia, aciertos, total_residuos, fecha_juego
      FROM puntuaciones_juego1 
      WHERE usuario_id = ?
      ORDER BY fecha_juego DESC
      LIMIT 1
    `, [req.params.id]);
    
    res.json(rows.length > 0 ? rows[0] : null);
});

module.exports = router;