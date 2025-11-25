

const express = require('express');
const pool = require('../bd');
const authenticateToken = require('../middleware/auth');
const { checkRole, isAdmin } = require('../middleware/roleAuth');
const router = express.Router();

router.get('/admin/usuarios', authenticateToken, isAdmin, async (req, res) => {
  try {
    const [usuarios] = await pool.query(
      `SELECT u.id, u.usuario, u.correo, r.nombre as rol, u.fecha_creacion 
       FROM usuarios u 
       LEFT JOIN roles r ON u.rol_id = r.id 
       ORDER BY u.fecha_creacion DESC`
    );
    res.json(usuarios);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

router.put('/admin/usuarios/:id/rol', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { rol_id } = req.body;
  
  try {
    const [roles] = await pool.query('SELECT id FROM roles WHERE id = ?', [rol_id]);
    if (roles.length === 0) {
      return res.status(400).json({ error: 'Rol no válido' });
    }


    if (Number.parseInt(id, 10) === req.user.id) {
      const [usuarioActual] = await pool.query('SELECT rol_id FROM usuarios WHERE id = ?', [id]);
      const [rolAdmin] = await pool.query('SELECT id FROM roles WHERE nombre = ?', ['admin']);
      
      if (usuarioActual[0].rol_id === rolAdmin[0].id && rol_id !== rolAdmin[0].id) {
        return res.status(400).json({ error: 'No puedes quitarte el rol de administrador a ti mismo' });
      }
    }

    await pool.query('UPDATE usuarios SET rol_id = ? WHERE id = ?', [rol_id, id]);
    
    const [usuarioActualizado] = await pool.query(
      `SELECT u.id, u.usuario, u.correo, r.nombre as rol 
       FROM usuarios u 
       LEFT JOIN roles r ON u.rol_id = r.id 
       WHERE u.id = ?`, 
      [id]
    );
    
    res.json({ 
      message: 'Rol actualizado exitosamente',
      usuario: usuarioActualizado[0]
    });
  } catch (error) {
    console.error('Error al actualizar rol:', error);
    res.status(500).json({ error: 'Error al actualizar rol' });
  }
});

router.get('/admin/roles', authenticateToken, isAdmin, async (req, res) => {
  try {
    const [roles] = await pool.query('SELECT id, nombre, descripcion FROM roles ORDER BY nombre');
    res.json(roles);
  } catch (error) {
    console.error('Error al obtener roles:', error);
    res.status(500).json({ error: 'Error al obtener roles' });
  }
});

router.delete('/admin/usuarios/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {

    if (Number.parseInt(id, 10) === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    }

    await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

module.exports = router;