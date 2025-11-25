const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || '8116e6a30e1856625e50ead825375db00b7182bad1cfbc52c9770758d972a1e2';

// Ruta para iniciar autenticación con Google
router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })
);

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    
    if (req.user.exists) {
      // Usuario existente - incluir rol en el token
      const token = jwt.sign(
        {
          id: req.user.id,
          usuario: req.user.usuario,
          correo: req.user.correo,
          rol: req.user.rol || 'usuario',
          rol_id: req.user.rol_id
        },
        JWT_SECRET,
        { expiresIn: '4h' }
      );
      res.redirect(`http://localhost:8080/login-google?token=${token}`);
      
    } else {
      // Usuario nuevo - token temporal sin rol
      const tempToken = jwt.sign(
        {
          email: req.user.correo || req.user.email, 
          name: req.user.name || req.user.nombre,
          verified: false
        },
        JWT_SECRET,
        { expiresIn: '10m' }
      );
      
      res.redirect(`http://localhost:8080/completar-registro-google?temp_token=${tempToken}`);
    }
  }
);

module.exports = router;