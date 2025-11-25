const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../bd');
const authenticateToken = require('../middleware/auth');
const router = express.Router();






router.get('/perfil', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, usuario, correo, fecha_creacion FROM usuarios WHERE id = ?',
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json({ user: users[0] });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Actualizar perfil del usuario (solo datos básicos)
router.put('/perfil', authenticateToken, async (req, res) => {
  const { usuario } = req.body;
  
  try {
    // Verificar que el usuario existe
    const [users] = await pool.query('SELECT id FROM usuarios WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Verificar si el nombre de usuario ya existe (excluyendo el usuario actual)
    const [existingUsers] = await pool.query(
      'SELECT id FROM usuarios WHERE usuario = ? AND id != ?',
      [usuario, req.user.id]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
    }

    // Actualizar solo el nombre de usuario
    await pool.query(
      'UPDATE usuarios SET usuario = ? WHERE id = ?',
      [usuario, req.user.id]
    );

    // Obtener datos actualizados
    const [updatedUsers] = await pool.query(
      'SELECT id, usuario, correo, fecha_creacion FROM usuarios WHERE id = ?',
      [req.user.id]
    );

    res.json({ 
      message: 'Perfil actualizado exitosamente', 
      user: updatedUsers[0] 
    });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Cambiar contraseña
router.put('/cambiar-contra', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  try {
    // Obtiene usuario
    const [users] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = users[0];
    
    // Verificar contraseña actual
    const validPassword = await bcrypt.compare(currentPassword, user.contraseña);
    if (!validPassword) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Validar nueva contraseña 
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }

    // Hashear y actualizar
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE usuarios SET contraseña = ? WHERE id = ?',
      [hashedPassword, req.user.id]
    );

    res.json({ message: 'Contraseña actualizada exitosamente' });
    
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;