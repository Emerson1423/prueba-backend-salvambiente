const express = require('express');
const pool = require('../bd');
const authenticateToken = require('../middleware/auth');
const { isAdmin, isModeratorOrAdmin } = require('../middleware/roleAuth');
const router = express.Router();

const executeQuery = async (query, errorMessage = 'Error al obtener datos') => {
  try {
    const [result] = await pool.query(query);
    return { success: true, data: result };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: errorMessage };
  }
};

const createStatsRoute = (queryFn) => {
  return async (req, res) => {
    const result = await queryFn();
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  };
};

// ============ ESTADÍSTICAS GENERALES ============
router.get('/resumen', authenticateToken, isModeratorOrAdmin, async (req, res) => {
  try {
    const [totalUsuarios] = await pool.query('SELECT COUNT(*) as total FROM usuarios');
    const [usuariosPorRol] = await pool.query(`
      SELECT r.nombre as rol, COUNT(u.id) as cantidad
      FROM roles r
      LEFT JOIN usuarios u ON r.id = u.rol_id
      GROUP BY r.id, r.nombre
    `);
    const [totalHuellas] = await pool.query('SELECT COUNT(*) as total FROM huella');
    const [promedioEmisiones] = await pool.query('SELECT AVG(total_emisiones) as promedio FROM huella');
    const [totalPartidas] = await pool.query('SELECT COUNT(*) as total FROM puntuaciones_juego1');
    const [promedioPuntuacion] = await pool.query('SELECT AVG(puntuacion) as promedio FROM puntuaciones_juego1');
    const [usuariosRecientes] = await pool.query(`
      SELECT COUNT(*) as total 
      FROM usuarios 
      WHERE fecha_creacion >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);
    const [topJugadores] = await pool.query(`
      SELECT u.usuario, COUNT(p.id) as partidas, AVG(p.puntuacion) as promedio
      FROM usuarios u
      INNER JOIN puntuaciones_juego1 p ON u.id = p.usuario_id
      GROUP BY u.id, u.usuario
      ORDER BY partidas DESC
      LIMIT 5
    `);
    
    res.json({
      usuarios: {
        total: totalUsuarios[0].total,
        recientes: usuariosRecientes[0].total,
        porRol: usuariosPorRol
      },
      huellaCarbono: {
        total: totalHuellas[0].total,
        promedioEmisiones: Number.parseFloat(promedioEmisiones[0].promedio || 0).toFixed(2)
      },
      juegos: {
        totalPartidas: totalPartidas[0].total,
        promedioPuntuacion: Number.parseFloat(promedioPuntuacion[0].promedio || 0).toFixed(2),
        topJugadores: topJugadores
      }
    });
  } catch (error) {
    console.error('Error al obtener resumen:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ============ ESTADÍSTICAS DE USUARIOS ============
router.get('/usuarios/por-mes', authenticateToken, isModeratorOrAdmin, 
  createStatsRoute(() => executeQuery(`
    SELECT 
      DATE_FORMAT(fecha_creacion, '%Y-%m') as mes,
      COUNT(*) as cantidad
    FROM usuarios
    WHERE fecha_creacion >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY mes
    ORDER BY mes ASC
  `))
);

router.get('/usuarios/por-rol', authenticateToken, isModeratorOrAdmin,
  createStatsRoute(() => executeQuery(`
    SELECT r.nombre as rol, COUNT(u.id) as cantidad
    FROM roles r
    LEFT JOIN usuarios u ON r.id = u.rol_id
    GROUP BY r.id, r.nombre
  `))
);

// ============ ESTADÍSTICAS DE HUELLA DE CARBONO ============
router.get('/huella/por-transporte', authenticateToken, isModeratorOrAdmin,
  createStatsRoute(() => executeQuery(`
    SELECT 
      transporte,
      COUNT(*) as cantidad,
      AVG(total_emisiones) as promedio_emisiones
    FROM huella
    GROUP BY transporte
    ORDER BY promedio_emisiones DESC
  `))
);

router.get('/huella/tendencia', authenticateToken, isModeratorOrAdmin,
  createStatsRoute(() => executeQuery(`
    SELECT 
      DATE_FORMAT(fecha, '%Y-%m') as mes,
      AVG(total_emisiones) as promedio_emisiones,
      COUNT(*) as registros
    FROM huella
    WHERE fecha >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY mes
    ORDER BY mes ASC
  `))
);

router.get('/huella/energia-renovable', authenticateToken, isModeratorOrAdmin,
  createStatsRoute(() => executeQuery(`
    SELECT 
      renovable,
      COUNT(*) as cantidad,
      AVG(total_emisiones) as promedio_emisiones
    FROM huella
    GROUP BY renovable
  `))
);

// ============ ESTADÍSTICAS DE JUEGOS ============
router.get('/juegos/estadisticas', authenticateToken, isModeratorOrAdmin,
  createStatsRoute(async () => {
    const result = await executeQuery(`
      SELECT 
        COUNT(*) as total_partidas,
        AVG(puntuacion) as puntuacion_promedio,
        MAX(puntuacion) as puntuacion_maxima,
        AVG(tiempo_segundos) as tiempo_promedio,
        AVG(eficiencia) as eficiencia_promedio,
        SUM(aciertos) as total_aciertos,
        SUM(total_residuos) as total_residuos
      FROM puntuaciones_juego1
    `);
    return result.success ? { success: true, data: result.data[0] } : result;
  })
);

router.get('/juegos/top-puntuaciones', authenticateToken, isModeratorOrAdmin,
  createStatsRoute(() => executeQuery(`
    SELECT 
      u.usuario,
      p.puntuacion,
      p.tiempo_segundos,
      p.eficiencia,
      p.fecha_juego
    FROM puntuaciones_juego1 p
    INNER JOIN usuarios u ON p.usuario_id = u.id
    ORDER BY p.puntuacion DESC
    LIMIT 10
  `))
);

router.get('/juegos/por-dia', authenticateToken, isModeratorOrAdmin,
  createStatsRoute(() => executeQuery(`
    SELECT 
      DATE_FORMAT(fecha_juego, '%Y-%m-%d') as dia,
      COUNT(*) as partidas
    FROM puntuaciones_juego1
    WHERE fecha_juego >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY dia
    ORDER BY dia ASC
  `))
);

// ============ ESTADÍSTICAS DE ACTIVIDAD ============
router.get('/actividad/reciente', authenticateToken, isModeratorOrAdmin, async (req, res) => {
  try {
    const [nuevosUsuarios] = await pool.query(`
      SELECT id, usuario, correo, fecha_creacion as fecha, 'registro' as tipo
      FROM usuarios
      ORDER BY fecha_creacion DESC
      LIMIT 5
    `);
    
    const [nuevasHuellas] = await pool.query(`
      SELECT h.id, u.usuario, h.total_emisiones, h.fecha, 'huella' as tipo
      FROM huella h
      INNER JOIN perfiles p ON h.id = p.id_huella
      INNER JOIN usuarios u ON p.id_usuario = u.id
      ORDER BY h.fecha DESC
      LIMIT 5
    `);
    
    const [nuevasPartidas] = await pool.query(`
      SELECT p.id, u.usuario, p.puntuacion, p.fecha_juego as fecha, 'juego' as tipo
      FROM puntuaciones_juego1 p
      INNER JOIN usuarios u ON p.usuario_id = u.id
      ORDER BY p.fecha_juego DESC
      LIMIT 5
    `);
    
    const actividad = [...nuevosUsuarios, ...nuevasHuellas, ...nuevasPartidas]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 10);
    
    res.json(actividad);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener actividad' });
  }
});

module.exports = router;