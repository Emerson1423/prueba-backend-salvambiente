const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('../bd');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/api/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      
      // Buscar usuario con su rol
      const [usuarios] = await pool.query(
        `SELECT u.*, r.nombre as rol_nombre 
         FROM usuarios u 
         LEFT JOIN roles r ON u.rol_id = r.id 
         WHERE u.correo = ?`, 
        [email]
      );
      
      if (usuarios.length > 0) {
        // Usuario YA existe - login directo con rol
        const usuario = usuarios[0];
        return done(null, {
          exists: true,
          id: usuario.id,
          usuario: usuario.usuario,
          correo: usuario.correo,
          rol: usuario.rol_nombre || 'usuario',
          rol_id: usuario.rol_id
        });
      } else {
        // Usuario NUEVO - NO crear en BD, solo pasar datos
        return done(null, {
          exists: false,
          correo: email,
          nombre: profile.displayName
        });
      }
      
    } catch (error) {
      console.error('Error en Google Strategy:', error);
      return done(error);
    }
  }
));

// Serializar usuario
passport.serializeUser((user, done) => {
  done(null, user);
});

// Deserializar usuario
passport.deserializeUser((user, done) => {
  done(null, user);
});

module.exports = passport;