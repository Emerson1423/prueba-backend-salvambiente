const nodemailer = require('nodemailer');


//configuracion de nodemailer para enviar correos
const transporter = nodemailer.createTransport({
  service: 'gmail', //servicio de correo
  secure: true,
  auth: {
    user: 'equiposalvambiente@gmail.com', // correo de envio de enlace de restablecimiento
    pass: process.env.GMAIL_APP_PASSWORD //contraseña de aplicacion 
  }
});

module.exports = transporter;