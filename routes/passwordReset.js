
const express = require('express');
const pool = require('../bd');
const bcrypt = require('bcrypt');
const transporter = require('../config/mailer');
const router = express.Router();
const crypto = require('node:crypto');

const resetTokens = {};


// Solicitar restablecimiento
router.post('/solicitar-restablecimiento', async (req, res) => { // Endpoint para solicitar restablecimiento de contraseña
  const { correo } = req.body;
  try {
    const [users] = await pool.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Correo no encontrado' });
    }
    
    // Generar código de 6 dígitos
    const codigo = crypto.randomInt(100000, 1000000).toString();
    resetTokens[codigo] = {correo, expires: Date.now() + 1000 * 60 * 15, // 15 minutos
      verified: false // Marca si el código ha sido verificado
    };

    await transporter.sendMail({
      from: '"Salvambiente" <equiposalvambiente@gmail.com>', //correo de envio de enlace de restablecimiento de contraseña
      to: correo,
      subject: 'Código de recuperación de contraseña',
      html: `<p>Tu código de recuperación es: <b>${codigo}</b></p>
             <p>Este código es válido por 15 minutos.</p>`
    });

    res.json({ message: 'Se ha enviado un código de recuperación a tu correo.' });
  } catch (error) {
    console.error('Error en /api/solicitar-restablecimiento:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});
//
////////
// Verifica el código para comprobar que el token es valido, aca se verifican los token q estan disponibles
//si el usuario hace la peticion para otro codigo y ese codigo aun es valido lo mueestra en la consola
//aca se resetea el token si a expirado para q no interfiera y el usuario no pueda seguir usandolo
router.post('/verificar-codigo', (req, res) => {
  const { token } = req.body;
  console.log('Verificando token:', token);
  console.log('Tokens disponibles:', Object.keys(resetTokens));
  const data = resetTokens[token];
  if (!data) {
    console.log('Token no encontrado');
    return res.status(400).json({ error: 'Código inválido' });
  }
  if (data.expires < Date.now()) {
    console.log('Token expirado');
    delete resetTokens[token]; // Limpiar token expirado
    return res.status(400).json({ error: 'Código expirado' });
  }//
  // Marcar como verificado pero NO eliminar
  data.verified = true;
  console.log('Token verificado exitosamente');
  res.json({ valido: true });
});
// Restablecer contraseña
router.post('/restablecer-contra', async (req, res) => { //
  const { token, nuevaContraseña } = req.body;
  console.log('Restableciendo con token:', token);//par ver si funciona
  console.log('Tokens en memoria:', resetTokens);//
  const data = resetTokens[token];
  if (!data) {
    console.log('Token no encontrado para restablecimiento');
    return res.status(400).json({ error: 'Código inválido' });
  }
  if (data.expires < Date.now()) {
    console.log('Token expirado en restablecimiento');
    delete resetTokens[token];
    return res.status(400).json({ error: 'Código inválido o expirado' });
  }
  // Verificar que el token haya sido previamente verificado
  if (!data.verified) {
    return res.status(400).json({ error: 'Código no verificado' });
  }
  if (!nuevaContraseña || nuevaContraseña.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  try {
    const hashedPassword = await bcrypt.hash(nuevaContraseña, 10);
    await pool.query('UPDATE usuarios SET contraseña = ? WHERE correo = ?', [hashedPassword, data.correo]); // Actualiza la contraseña del usuario en la base de datos
    delete resetTokens[token];//aca se cambia x el token// elimina el token despues de restablecer la contraseña
    res.json({ message: 'Contraseña restablecida correctamente' }); // texto que muestra que la contraseña se ha restablecido correctamente
  } catch (error) {
    console.error('Error en restablecimiento:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});
/////
//Recordar q el correo debe de ser real, sino no funcionara el restablecimiento.

// Exportar el router
module.exports = router;