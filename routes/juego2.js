const express = require('express');
const pool = require('../bd');
const router = express.Router();

const questions = [
    {
        id:1,
        question:"Regar las plantas por la mañana es mejor que por la tarde",
        answer: true,
        explicacion: "Verdadero: Regar por la mañana permite que el agua se absorba antes de que el sol evapore demasiada."
  
    },
    {
        id:2,
        question:"Todas las plantas necesitan luz solar directa todo el día",
        answer: false,
        explicacion: "Falso: Algunas plantas prefieren sombra parcial o luz indirecta."
    },
    {
        id:3,
        question:"Los animales pueden adaptarse a la pérdida de hábitat",
        answer: false,
        explicacion: "Falso: La velocidad a la que los ecosistemas están siendo destruidos supera la capacidad de adaptación de muchas especies, por ello trae una extinción masiva de flora y fauna."
    },    
    {
        id:4,
        question:"El reciclaje reduce la contaminación",
        answer: true,
        explicacion: "Verdad: Separar los residuos evita que terminen en ríos, mares o quemados."
    },
    {
        id:5,
        question:"El agua dulce es limitada.",
        answer: true,
        explicacion: "Verdadero: Solo una pequeña parte del agua del planeta es apta para consumo humano."
    }, 
    {
        id:6,
        question:"El calentamiento global es un invento moderno.",
        answer: false,
        explicacion: "Falso: Está comprobado científicamente desde hace décadas."
    },  
    {
        id:7,
        question:"El reciclaje siempre se mezcla y no sirve.",
        answer: false,
        explicacion: "Falso: Sí se recicla, solo falla cuando la gente no separa bien."
    },
    {
        id:8,
        question:"Los bosques son el “pulmón” del mundo",
        answer: true,
        explicacion: "Verdadero: Sin ellos, la calidad del aire y el clima empeoran."
    },    
    {
        id:9,
        question:"Podar las plantas ayuda a que crezcan más fuertes",
        answer: true,
        explicacion: "Verdadero: La poda elimina partes muertas y estimula nuevo crecimiento.."
    },   
    {
        id:10,
        question:"Todo lo biodegradable puede tirarse en cualquier lado",
        answer: false,
        explicacion: "Falso: Aunque se degrade, contamina y tarda meses o años."
    },              
];

    router.get('/questions', (req,res)=>{
      // NOSONAR - Math.random() es seguro para mezclar preguntas de juego
        const mezclarPreguntas = [...questions].sort(()=> Math.random()- 0.5);
        res.json(mezclarPreguntas);
    });


    router.get('/questions/:id', (req, res) => {
        // ✅ CAMBIO: parseInt → Number.parseInt con base 10
        const questionId = Number.parseInt(req.params.id, 10);
        const question = questions.find(q => q.id === questionId);
        if (!question) {
            return res.status(404).json({ error: 'Pregunta no encontrada' });
        }
        res.json(question);
    });

    router.post('/check-answer', (req,res)=> {
        const { questionId, userAnswer } = req.body;
        const question = questions.find(q => q.id === questionId);

    if (!question){
        return res.status(404).json({error: 'Pregunta no encontrada'});

    }

    const isCorrect = userAnswer === question.answer;

    res.json({
        isCorrect,
        correctAnswer: question.answer,
        explicacion: question.explicacion
    });


});
router.post('/puntuacion', async (req, res) => {
  try {
    const { usuario_id, puntuacion, crecimiento_final, aciertos, total_preguntas, etapa_alcanzada, tiempo_juego } = req.body;

    await pool.execute(
      `DELETE FROM puntuaciones_juego2 WHERE usuario_id = ?`,
      [usuario_id]
    );

    const [result] = await pool.execute(
      `INSERT INTO puntuaciones_juego2 
       (usuario_id, puntuacion, crecimiento_final, aciertos, total_preguntas, etapa_alcanzada, tiempo_juego, fecha_juego) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [usuario_id, puntuacion, crecimiento_final, aciertos, total_preguntas, etapa_alcanzada, tiempo_juego]
    );
    res.json({ 
      success: true, 
      message: 'Puntuación guardada correctamente',
      id: result.insertId
    });        
  } catch (error) {
    console.error('Error guardando puntuación juego 2:', error);
    res.status(500).json({ error: 'Error al guardar la puntuación' });
  }    
});

router.get('/leaderboard', async (req, res) => {    
  try {
    const [rows] = await pool.execute(`
      SELECT u.usuario, u.id as usuario_id, pj.puntuacion, pj.crecimiento_final, 
             pj.aciertos, pj.total_preguntas, pj.etapa_alcanzada, pj.tiempo_juego, pj.fecha_juego
      FROM puntuaciones_juego2 pj
      JOIN usuarios u ON pj.usuario_id = u.id
      ORDER BY pj.puntuacion DESC, pj.crecimiento_final DESC, pj.tiempo_juego ASC
      LIMIT 10
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error obteniendo leaderboard juego 2:', error);
    res.status(500).json({ error: 'Error al obtener el leaderboard' });
  }
});
router.get('/usuario/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT puntuacion, crecimiento_final, aciertos, total_preguntas, etapa_alcanzada, tiempo_juego, fecha_juego
      FROM puntuaciones_juego2 
      WHERE usuario_id = ?
      ORDER BY fecha_juego DESC
      LIMIT 1
    `, [req.params.id]);
    
    res.json(rows.length > 0 ? rows[0] : null);
  } catch (error) {
    console.error('Error obteniendo puntuación del usuario:', error);
    res.status(500).json({ error: 'Error al obtener la puntuación' });
  }

});

module.exports = router;