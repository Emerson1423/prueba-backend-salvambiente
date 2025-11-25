const express = require('express');
const pool = require('../bd');
const authenticateToken = require('../middleware/auth');
const { isModeratorOrAdmin, isAdmin } = require('../middleware/roleAuth');
const router = express.Router();

// ============================================
// FUNCIONES AUXILIARES
// ============================================

// Validar estados válidos
const ESTADOS_VALIDOS = new Set(['pendiente', 'en_proceso', 'resuelto', 'cerrado']);
const PRIORIDADES_VALIDAS = new Set(['baja', 'media', 'alta', 'urgente']);

// Función para construir query con filtros
function construirQueryFiltros(baseQuery, filtros, params) {
  let query = baseQuery;
  
  if (filtros.estado && ESTADOS_VALIDOS.has(filtros.estado)) {
    query += ' AND estado = ?';
    params.push(filtros.estado);
  }
  
  if (filtros.prioridad && PRIORIDADES_VALIDAS.has(filtros.prioridad)) {
    query += ' AND prioridad = ?';
    params.push(filtros.prioridad);
  }
  
  if (filtros.categoria) {
    query += ' AND categoria_id = ?';
    params.push(filtros.categoria);
  }
  
  return query;
}

// Función para obtener paginación
function calcularPaginacion(page, limit, total) {
  return {
    currentPage: Number.parseInt(page, 10),
    totalPages: Math.ceil(total / limit),
    totalItems: total,
    itemsPerPage: Number.parseInt(limit, 10)
  };
}

// Función para manejar errores de forma consistente
function manejarError(res, error, mensaje = 'Error en el servidor') {
  console.error('Error:', error);
  res.status(500).json({ error: mensaje });
}

// ============================================
// RUTAS PÚBLICAS
// ============================================

router.get('/categorias', async (req, res) => {
  try {
    const [categorias] = await pool.query(
      'SELECT * FROM soporte_categorias WHERE activo = TRUE ORDER BY nombre'
    );
    res.json({ success: true, categorias });
  } catch (error) {
    manejarError(res, error, 'Error al obtener categorías');
  }
});

// ============================================
// RUTAS DE USUARIO
// ============================================

// Crear un nuevo mensaje de soporte
router.post('/mensaje', authenticateToken, async (req, res) => {
  const { categoria_id, asunto, mensaje } = req.body;
  const usuario_id = req.user.id;

  // Validaciones
  if (!categoria_id || !asunto || !mensaje) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  if (asunto.length < 5 || asunto.length > 200) {
    return res.status(400).json({ 
      error: 'El asunto debe tener entre 5 y 200 caracteres' 
    });
  }

  if (mensaje.length < 20 || mensaje.length > 5000) {
    return res.status(400).json({ 
      error: 'El mensaje debe tener entre 20 y 5000 caracteres' 
    });
  }

  try {
    // Verificar que la categoría existe
    const [categoria] = await pool.query(
      'SELECT id FROM soporte_categorias WHERE id = ? AND activo = TRUE',
      [categoria_id]
    );

    if (categoria.length === 0) {
      return res.status(400).json({ error: 'Categoría no válida' });
    }

    // Insertar mensaje
    const [result] = await pool.query(
      `INSERT INTO soporte_mensajes 
       (usuario_id, categoria_id, asunto, mensaje, estado, prioridad) 
       VALUES (?, ?, ?, ?, 'pendiente', 'media')`,
      [usuario_id, categoria_id, asunto, mensaje]
    );

    res.status(201).json({ 
      success: true, 
      mensaje_id: result.insertId,
      message: 'Mensaje enviado exitosamente' 
    });
  } catch (error) {
    manejarError(res, error, 'Error al enviar el mensaje');
  }
});

// Obtener mensajes del usuario
router.get('/mis-mensajes', authenticateToken, async (req, res) => {
  const usuario_id = req.user.id;
  const { page = 1, limit = 10, estado } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT 
        sm.id, sm.asunto, sm.mensaje, sm.estado, sm.prioridad,
        sm.fecha_creacion, sm.fecha_actualizacion,
        sc.nombre as categoria_nombre, sc.icono as categoria_icono
      FROM soporte_mensajes sm
      INNER JOIN soporte_categorias sc ON sm.categoria_id = sc.id
      WHERE sm.usuario_id = ?
    `;
    
    const params = [usuario_id];
    query = construirQueryFiltros(query, { estado }, params);
    query += ' ORDER BY sm.fecha_creacion DESC LIMIT ? OFFSET ?';
    params.push(Number.parseInt(limit, 10), offset);

    const [mensajes] = await pool.query(query, params);

    // Contar total
    let countQuery = 'SELECT COUNT(*) as total FROM soporte_mensajes WHERE usuario_id = ?';
    const countParams = [usuario_id];
    countQuery = construirQueryFiltros(countQuery, { estado }, countParams);

    const [totalCount] = await pool.query(countQuery, countParams);
    const total = totalCount[0].total;

    res.json({
      success: true,
      mensajes,
      pagination: calcularPaginacion(page, limit, total)
    });
  } catch (error) {
    manejarError(res, error, 'Error al obtener mensajes');
  }
});

// Obtener un mensaje específico con sus respuestas
router.get('/mensaje/:id', authenticateToken, async (req, res) => {
  const mensaje_id = req.params.id;
  const usuario_id = req.user.id;

  try {
    const [mensajes] = await pool.query(
      `SELECT sm.*, sc.nombre as categoria_nombre, sc.icono as categoria_icono,
              u.usuario as nombre_usuario
       FROM soporte_mensajes sm
       INNER JOIN soporte_categorias sc ON sm.categoria_id = sc.id
       INNER JOIN usuarios u ON sm.usuario_id = u.id
       WHERE sm.id = ? AND sm.usuario_id = ?`,
      [mensaje_id, usuario_id]
    );

    if (mensajes.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    const mensaje = mensajes[0];

    const [respuestas] = await pool.query(
      `SELECT sr.*, u.usuario as nombre_usuario
       FROM soporte_respuestas sr
       LEFT JOIN usuarios u ON sr.usuario_id = u.id
       WHERE sr.mensaje_id = ?
       ORDER BY sr.fecha_creacion ASC`,
      [mensaje_id]
    );

    const respuestaAdmin = respuestas.find(r => r.es_admin === 1 || r.es_admin === true);
    
    if (respuestaAdmin) {
      mensaje.respuesta = respuestaAdmin.respuesta;
      mensaje.respondido_por = respuestaAdmin.nombre_usuario;
      mensaje.fecha_respuesta = respuestaAdmin.fecha_creacion;
    }

    res.json({ success: true, mensaje, respuestas });
  } catch (error) {
    manejarError(res, error, 'Error al obtener el mensaje');
  }
});

// Estadísticas de mensajes del usuario
router.get('/estadisticas', authenticateToken, async (req, res) => {
  const usuario_id = req.user.id;

  try {
    const [stats] = await pool.query(
      `SELECT 
        COUNT(*) as total_mensajes,
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
        SUM(CASE WHEN estado = 'en_proceso' THEN 1 ELSE 0 END) as en_proceso,
        SUM(CASE WHEN estado = 'resuelto' THEN 1 ELSE 0 END) as resueltos,
        SUM(CASE WHEN estado = 'cerrado' THEN 1 ELSE 0 END) as cerrados
      FROM soporte_mensajes WHERE usuario_id = ?`,
      [usuario_id]
    );

    res.json({ success: true, estadisticas: stats[0] });
  } catch (error) {
    manejarError(res, error, 'Error al obtener estadísticas');
  }
});

// ============================================
// RUTAS DE ADMINISTRACIÓN
// ============================================

router.get('/admin/estadisticas', authenticateToken, isModeratorOrAdmin, async (req, res) => {
  try {
    const [stats] = await pool.query(
      `SELECT 
        COUNT(*) as total_mensajes,
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
        SUM(CASE WHEN estado = 'en_proceso' THEN 1 ELSE 0 END) as en_proceso,
        SUM(CASE WHEN estado = 'resuelto' THEN 1 ELSE 0 END) as resueltos,
        SUM(CASE WHEN estado = 'cerrado' THEN 1 ELSE 0 END) as cerrados
      FROM soporte_mensajes`
    );
    res.json({ success: true, estadisticas: stats[0] });
  } catch (error) {
    manejarError(res, error, 'Error al obtener estadísticas');
  }
});

// Ver TODOS los mensajes (admin)
router.get('/admin/mensajes', authenticateToken, isModeratorOrAdmin, async (req, res) => {
  const { page = 1, limit = 10, estado, prioridad, categoria } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT 
        sm.id, sm.usuario_id, sm.asunto, sm.mensaje, sm.estado, sm.prioridad,
        sm.fecha_creacion, sm.fecha_actualizacion,
        sc.nombre as categoria_nombre, sc.icono as categoria_icono,
        u.usuario as nombre_usuario,
        (SELECT COUNT(*) FROM soporte_respuestas WHERE mensaje_id = sm.id) as total_respuestas
      FROM soporte_mensajes sm
      INNER JOIN soporte_categorias sc ON sm.categoria_id = sc.id
      INNER JOIN usuarios u ON sm.usuario_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    query = construirQueryFiltros(query, { estado, prioridad, categoria }, params);
    query += ' ORDER BY sm.fecha_creacion DESC LIMIT ? OFFSET ?';
    params.push(Number.parseInt(limit, 10), offset);

    const [mensajes] = await pool.query(query, params);

    let countQuery = 'SELECT COUNT(*) as total FROM soporte_mensajes WHERE 1=1';
    const countParams = [];
    countQuery = construirQueryFiltros(countQuery, { estado, prioridad, categoria }, countParams);

    const [totalCount] = await pool.query(countQuery, countParams);
    const total = totalCount[0].total;

    res.json({
      success: true,
      mensajes,
      pagination: calcularPaginacion(page, limit, total)
    });
  } catch (error) {
    manejarError(res, error, 'Error al obtener mensajes');
  }
});

// Ver mensaje específico (admin)
router.get('/admin/mensaje/:id', authenticateToken, isModeratorOrAdmin, async (req, res) => {
  const mensaje_id = req.params.id;

  try {
    const [mensajes] = await pool.query(
      `SELECT sm.*, sc.nombre as categoria_nombre, sc.icono as categoria_icono,
              u.usuario as nombre_usuario, u.correo as correo_usuario
       FROM soporte_mensajes sm
       INNER JOIN soporte_categorias sc ON sm.categoria_id = sc.id
       INNER JOIN usuarios u ON sm.usuario_id = u.id
       WHERE sm.id = ?`,
      [mensaje_id]
    );

    if (mensajes.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    const [respuestas] = await pool.query(
      `SELECT sr.*, u.usuario as nombre_usuario
       FROM soporte_respuestas sr
       LEFT JOIN usuarios u ON sr.usuario_id = u.id
       WHERE sr.mensaje_id = ?
       ORDER BY sr.fecha_creacion ASC`,
      [mensaje_id]
    );

    res.json({ success: true, mensaje: mensajes[0], respuestas });
  } catch (error) {
    manejarError(res, error, 'Error al obtener el mensaje');
  }
});

// Responder mensaje (admin)
router.post('/admin/respuesta', authenticateToken, isModeratorOrAdmin, async (req, res) => {
  const { mensaje_id, respuesta } = req.body;
  const usuario_id = req.user.id;

  if (!mensaje_id || !respuesta) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  if (respuesta.length < 10 || respuesta.length > 5000) {
    return res.status(400).json({ 
      error: 'La respuesta debe tener entre 10 y 5000 caracteres' 
    });
  }

  try {
    const [mensaje] = await pool.query(
      'SELECT id, usuario_id, estado FROM soporte_mensajes WHERE id = ?',
      [mensaje_id]
    );

    if (mensaje.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    const [result] = await pool.query(
      `INSERT INTO soporte_respuestas 
       (mensaje_id, usuario_id, respuesta, es_admin) 
       VALUES (?, ?, ?, TRUE)`,
      [mensaje_id, usuario_id, respuesta]
    );

    const nuevoEstado = mensaje[0].estado === 'pendiente' ? 'en_proceso' : mensaje[0].estado;
    await pool.query(
      `UPDATE soporte_mensajes 
       SET estado = ?, fecha_actualizacion = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [nuevoEstado, mensaje_id]
    );

    res.status(201).json({ 
      success: true, 
      respuesta_id: result.insertId,
      message: 'Respuesta enviada exitosamente' 
    });
  } catch (error) {
    manejarError(res, error, 'Error al enviar la respuesta');
  }
});

// Actualizar estado
router.patch('/admin/mensaje/:id/estado', authenticateToken, isModeratorOrAdmin, async (req, res) => {
  const mensaje_id = req.params.id;
  const { estado } = req.body;

  if (!estado || !ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE soporte_mensajes 
       SET estado = ?, fecha_actualizacion = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [estado, mensaje_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    res.json({ success: true, message: 'Estado actualizado correctamente' });
  } catch (error) {
    manejarError(res, error, 'Error al actualizar estado');
  }
});

// Actualizar prioridad
router.patch('/admin/mensaje/:id/prioridad', authenticateToken, isModeratorOrAdmin, async (req, res) => {
  const mensaje_id = req.params.id;
  const { prioridad } = req.body;

  if (!prioridad || !PRIORIDADES_VALIDAS.includes(prioridad)) {
    return res.status(400).json({ error: 'Prioridad no válida' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE soporte_mensajes 
       SET prioridad = ?, fecha_actualizacion = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [prioridad, mensaje_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    res.json({ success: true, message: 'Prioridad actualizada correctamente' });
  } catch (error) {
    manejarError(res, error, 'Error al actualizar prioridad');
  }
});

module.exports = router;