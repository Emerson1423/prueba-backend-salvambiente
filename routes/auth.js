const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../bd');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

const JWT_SECRET = '8116e6a30e1856625e50ead825375db00b7182bad1cfbc52c9770758d972a1e2';

router.post('/registro', async (req, res) => {
  const { usuario, correo, contraseña } = req.body;
  try {
    const [existingUser] = await pool.query('SELECT * FROM usuarios WHERE usuario = ? OR correo = ?', [usuario, correo]);
    if (existingUser.length > 0) return res.status(400).json({ error: 'El usuario o correo ya existe' });

    const hashedPassword = await bcrypt.hash(contraseña, 10);
    
    const [rolUsuario] = await pool.query('SELECT id FROM roles WHERE nombre = ?', ['usuario']);
    const rolId = rolUsuario[0]?.id || 2;
    
    await pool.query(
      'INSERT INTO usuarios (usuario, correo, contraseña, rol_id) VALUES (?, ?, ?, ?)', 
      [usuario, correo, hashedPassword, rolId]
    );

    res.status(201).json({ message: 'Usuario registrado exitosamente' });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

router.post('/login', async (req, res) => {
  const { usuario, contraseña } = req.body;
  
  console.log('🔍 Intentando login:', usuario);
  
  try {
    const [users] = await pool.query(
      `SELECT u.*, r.nombre as rol_nombre 
       FROM usuarios u 
       LEFT JOIN roles r ON u.rol_id = r.id 
       WHERE u.usuario = ?`, 
      [usuario]
    );
    
    if (users.length === 0) {
      console.log('❌ Usuario no encontrado:', usuario);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = users[0];
    console.log('✅ Usuario encontrado:', user.usuario, '- Rol:', user.rol_nombre);

    const validPassword = await bcrypt.compare(contraseña, user.contraseña);
    if (!validPassword) {
      console.log('❌ Contraseña incorrecta para:', usuario);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    console.log('✅ Contraseña correcta');

    const token = jwt.sign(
      { 
        id: user.id, 
        usuario: user.usuario, 
        correo: user.correo,
        rol: user.rol_nombre || 'usuario',
        rol_id: user.rol_id
      }, 
      JWT_SECRET, 
      { expiresIn: '4h' }
    );
    
    console.log('🎫 Token generado para:', user.usuario);
    
    return res.status(200).json({ 
      token, 
      usuario: {
        id: user.id, 
        usuario: user.usuario, 
        correo: user.correo,
        rol: user.rol_nombre || 'usuario'
      } 
    });
    
  } catch (error) {
    console.error('💥 Error en login:', error);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

router.post('/completar-registro-google', async (req, res) => {
  const { temp_token, usuario, contraseña } = req.body;
  
  try {
    const decoded = jwt.verify(temp_token, JWT_SECRET);
    
    if (decoded.verified) {
      return res.status(400).json({ error: 'Token ya utilizado' });
    }

    const [existingUser] = await pool.query(
      'SELECT * FROM usuarios WHERE usuario = ? OR correo = ?', 
      [usuario, decoded.email]
    );
    
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'El usuario o correo ya existe' });
    }

    const hashedPassword = await bcrypt.hash(contraseña, 10);
    
    const [rolUsuario] = await pool.query('SELECT id FROM roles WHERE nombre = ?', ['usuario']);
    const rolId = rolUsuario[0]?.id || 2;
    
    const [result] = await pool.query(
      'INSERT INTO usuarios (usuario, correo, contraseña, rol_id) VALUES (?, ?, ?, ?)', 
      [usuario, decoded.email, hashedPassword, rolId]
    );

    const token = jwt.sign(
      { 
        id: result.insertId, 
        usuario: usuario, 
        correo: decoded.email,
        rol: 'usuario',
        rol_id: rolId
      }, 
      JWT_SECRET, 
      { expiresIn: '4h' }
    );

    // ✅ También cambiado aquí
    res.status(201).json({ 
      message: 'Registro completado exitosamente',
      token,
      usuario: {  // ⭐ Cambiado de "user" a "usuario"
        id: result.insertId, 
        usuario, 
        correo: decoded.email,
        rol: 'usuario'
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(400).json({ error: 'Token inválido o expirado' });
  }
});

router.post('/logout', authenticateToken, (req, res) => {
  res.json({ success: true, message: 'Sesión cerrada exitosamente' });
});

router.get('/verificar-token', authenticateToken, (req, res) => {
  res.json({ 
    valido: true, 
    usuario: {  // ✅ Cambiado de "user" a "usuario"
      id: req.user.id,
      usuario: req.user.usuario,
      correo: req.user.correo,
      rol: req.user.rol || 'usuario'
    }
  });
});

module.exports = router;

