// api/scores.js - Vercel Serverless Function
// Almacena y retorna las mejores puntuaciones para la evaluación de Legislación Laboral

// Base de datos en memoria (persiste durante el ciclo de vida del contenedor)
// con registros base institucionales
let leaderboard = [
  { id: '1', name: 'Dr. Alejandro Morales', correctCount: 12, totalQuestions: 12, score: 1340, date: '2026-10-18' },
  { id: '2', name: 'Valeria S. Gómez', correctCount: 12, totalQuestions: 12, score: 1280, date: '2026-10-19' },
  { id: '3', name: 'Lucas Benítez (APM)', correctCount: 11, totalQuestions: 12, score: 1190, date: '2026-10-19' },
  { id: '4', name: 'Martina Rossi', correctCount: 11, totalQuestions: 12, score: 1120, date: '2026-10-20' },
  { id: '5', name: 'Facundo Quiroga', correctCount: 10, totalQuestions: 12, score: 980, date: '2026-10-20' }
];

export default async function handler(req, res) {
  // Configuración de encabezados CORS y Cache
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Ordenar por aciertos (descendente) y luego por puntaje (descendente)
      const sorted = [...leaderboard].sort((a, b) => {
        if (b.correctCount !== a.correctCount) {
          return b.correctCount - a.correctCount;
        }
        return b.score - a.score;
      });

      return res.status(200).json({
        success: true,
        count: sorted.length,
        topScores: sorted.slice(0, 15)
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { name, correctCount, totalQuestions = 12, score = 0, timeTaken = 0 } = body || {};

      // Validación
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'El nombre es requerido' });
      }

      const cleanName = name.trim().slice(0, 30);
      const parsedCorrect = Math.min(12, Math.max(0, parseInt(correctCount, 10) || 0));
      const parsedScore = Math.max(0, parseInt(score, 10) || 0);

      const newEntry = {
        id: Date.now().toString(),
        name: cleanName,
        correctCount: parsedCorrect,
        totalQuestions: 12,
        score: parsedScore,
        timeTaken: Math.round(timeTaken),
        date: new Date().toISOString().split('T')[0]
      };

      leaderboard.push(newEntry);

      // Reordenar
      const sorted = [...leaderboard].sort((a, b) => {
        if (b.correctCount !== a.correctCount) {
          return b.correctCount - a.correctCount;
        }
        return b.score - a.score;
      });

      // Mantener top 50
      leaderboard = sorted.slice(0, 50);

      // Encontrar la posición del participante
      const rank = sorted.findIndex(item => item.id === newEntry.id) + 1;

      return res.status(201).json({
        success: true,
        rank,
        entry: newEntry,
        topScores: sorted.slice(0, 15)
      });
    }

    return res.status(405).json({ success: false, error: 'Método no permitido' });
  } catch (err) {
    console.error('Error en /api/scores:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}
