const express = require('express');
const pool = require('../bd');
const authenticateToken = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();


// Endpoint para verificar si puede calcular
router.get('/puede-calcular', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    
    // Verificar si ya hizo un cálculo este mes
    const [rows] = await conn.query(`
      SELECT h.fecha 
      FROM huella h
      JOIN perfiles p ON h.id = p.id_huella
      WHERE p.id_usuario = ? 
      AND YEAR(h.fecha) = YEAR(NOW())
      AND MONTH(h.fecha) = MONTH(NOW())
      ORDER BY h.fecha DESC 
      LIMIT 1
    `, [req.user.id]);
    
    conn.release();
    
    if (rows.length > 0) {
      // Ya tiene un cálculo este mes
      const fechaUltimoCalculo = rows[0].fecha;
      const proximoMes = new Date(fechaUltimoCalculo);
      proximoMes.setMonth(proximoMes.getMonth() + 1);
      proximoMes.setDate(1);

      const diasRestantes = Math.ceil((proximoMes - Date.now()) / (1000 * 60 * 60 * 24));

      return res.json({
        puede_calcular: false,
        mensaje: `Ya realizaste tu cálculo este mes el ${fechaUltimoCalculo.toLocaleDateString('es-ES')}`,
        dias_restantes: diasRestantes,
        proximo_calculo: proximoMes.toLocaleDateString('es-ES')
      });
    }
    
    // No tiene cálculo este mes, puede calcular
    res.json({
      puede_calcular: true,
      mensaje: 'Puedes realizar tu cálculo mensual'
    });
    
  } catch (error) {
    console.error('Error verificando cálculo mensual:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Modificar el router.post('/guardar') para agregar la validación
router.post('/guardar', authenticateToken, async (req, res) => {
  try {
    // NUEVA VALIDACIÓN: Verificar si ya calculó este mes
    const conn = await pool.getConnection();
    
    const [existeCalculo] = await conn.query(`
      SELECT h.id, h.fecha 
      FROM huella h
      JOIN perfiles p ON h.id = p.id_huella
      WHERE p.id_usuario = ? 
      AND YEAR(h.fecha) = YEAR(NOW())
      AND MONTH(h.fecha) = MONTH(NOW())
      LIMIT 1 
    `, [req.user.id]);
    
    if (existeCalculo.length > 0) {
      conn.release();
      const fecha = existeCalculo[0].fecha.toLocaleDateString('es-ES');
      return res.status(409).json({
        error: 'Ya realizaste tu cálculo mensual',
        mensaje: `Tu último cálculo fue el ${fecha}. Podrás realizar otro el próximo mes.`,
        fecha_anterior: fecha
      });
    }
    
    // Si no existe, continuar con el código original de guardado...
    const { kilometros, transporte, electricidad, energiaRenovable, reciclaje, total_emisiones } = req.body;


    const kilometrosNum = Number.parseFloat(kilometros);
    const electricidadNum = Number.parseFloat(electricidad);
    const totalEmisionesNum = Number.parseFloat(total_emisiones);

   
    if (Number.isNaN(kilometrosNum) || Number.isNaN(electricidadNum) || Number.isNaN(totalEmisionesNum)) {
      conn.release();
      return res.status(400).json({ 
        error: "Datos numéricos inválidos",
        recibido: { kilometros, electricidad, total_emisiones }
      });
    }

    if (!['si', 'no'].includes(energiaRenovable)) {
      conn.release();
      return res.status(400).json({ error: "energiaRenovable debe ser 'si' o 'no'" });
    }

    let reciclajeValue;
    if (Array.isArray(reciclaje)) {
      reciclajeValue = reciclaje.filter(item => item && item !== 'no_reciclo').join(',');
    } else {
      reciclajeValue = reciclaje === 'no_reciclo' ? '' : reciclaje;
    }
    reciclajeValue = reciclajeValue || 'no_reciclo';
    // Continuar con transacción
    await conn.beginTransaction();

    try {
      const [huellaResult] = await conn.query(
        `INSERT INTO huella (
          kilometros, transporte, electricidad, 
          renovable, reciclaje, total_emisiones
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [kilometrosNum, transporte, electricidadNum, energiaRenovable, reciclajeValue, totalEmisionesNum]
      );

      await conn.query(
        `INSERT INTO perfiles (id_usuario, id_huella) VALUES (?, ?)`,
        [req.user.id, huellaResult.insertId]
      );

      await conn.commit();
      
      res.status(201).json({ 
        success: true,
        id_huella: huellaResult.insertId,
        mensaje: 'Cálculo guardado correctamente'
      });

    } catch (error) {
      await conn.rollback();
      console.error('Error en transacción:', error);
      res.status(500).json({ 
        error: "Error al guardar datos",
        detalle: error.message
      });
    } finally {
      conn.release();
    }

  } catch (error) {
    console.error('Error general:', error);
    res.status(500).json({ 
      error: "Error interno del servidor",
      detalle: error.message
    });
  }
});

router.get('/historial', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const conn = await pool.getConnection();

    try {
      // Obtener cálculos con paginación

      const [calculos] = await conn.query(`
        SELECT 
          h.id,
          h.kilometros,
          h.transporte,
          h.electricidad,
          h.renovable,
          h.reciclaje,
          h.total_emisiones,
          h.fecha,
          MONTH(h.fecha) as mes,
          YEAR(h.fecha) as anio
        FROM huella h 
        INNER JOIN perfiles p ON h.id = p.id_huella 
        WHERE p.id_usuario = ? 
        ORDER BY h.fecha DESC 
        LIMIT ? OFFSET ?
      `, [req.user.id, Number.parseInt(limit, 10), offset]);

      // Total de registros
      const [totalCount] = await conn.query(`
        SELECT COUNT(*) as total 
        FROM huella h 
        INNER JOIN perfiles p ON h.id = p.id_huella 
        WHERE p.id_usuario = ?
      `, [req.user.id]);

      const total = totalCount[0].total;
      const totalPages = Math.ceil(total / limit);

      const calculosFormateados = calculos.map(calculo => {
        let categoria;
        if (calculo.total_emisiones < 50) categoria = "Baja";
        else if (calculo.total_emisiones < 100) categoria = "Media";
        else categoria = "Alta";

        return {
          id: calculo.id,
          puntuacionTotal: calculo.total_emisiones,
          categoria: categoria,
          fecha: calculo.fecha,
          mes: calculo.mes,
          anio: calculo.anio,
          detalles: {
            kilometros: calculo.kilometros,
            transporte: calculo.transporte,
            electricidad: calculo.electricidad,
            energiaRenovable: calculo.renovable,
            reciclaje: calculo.reciclaje ? calculo.reciclaje.split(',') : []
          }
        };
      });

      
      res.json({
        success: true,
        data: calculosFormateados,
        pagination: {
          currentPage: Number.parseInt(page, 10),
          totalPages: totalPages,
          totalItems: total,
          itemsPerPage: Number.parseInt(limit, 10),
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });

    } finally {
      conn.release();
    }

  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ 
      error: "Error al obtener historial",
      detalle: error.message
    });
  }
});


module.exports = router;