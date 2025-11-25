const express = require('express');
const cors = require('cors');
const session = require('express-session');
require('dotenv').config();
const passport = require('./config/passport');

const app = express();

app.disable('x-powered-by');

// CORS
app.use(cors({
  origin: "https://prueba-frontend-salvambiente.onrender.com",
  credentials: true
}));

app.use(express.json());

// Sesión
app.use(session({
  secret: process.env.SESSION_SECRET || 'mi_secreto',
  resave: false,
  saveUninitialized: true,
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Rutas
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/huella'));
app.use('/api', require('./routes/passwordReset'));
app.use('/api', require('./routes/googleOauth'));
app.use('/api', require('./routes/updatePerfil'));
app.use('/api', require('./routes/estadisticasHuella'));
app.use('/api/juego1', require('./routes/juego1'));
app.use('/api/juego2', require('./routes/juego2'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/soporte', require('./routes/soporte'));
app.use('/api', require('./routes/rolesAdmin')); // bien

// Puerto dinámico para deploy
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

module.exports = app;
