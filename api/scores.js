// api/scores.js - Vercel Serverless Function
// Almacena y retorna las mejores puntuaciones para la evaluación de Legislación Laboral

// Base de datos en memoria para registrar a los participantes reales
let leaderboard = [];

export default async function handler(req, res) {
  // Configuración de encabezados CORS y Cache
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
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
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          body = {};
        }
      }
      if (!body || typeof body !== 'object') {
        body = {};
      }

      const { name, correctCount, totalQuestions = 12, score = 0, timeTaken = 0 } = body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'El nombre es requerido' });
      }

      const cleanName = name.trim().slice(0, 40);
      const parsedCorrect = Math.min(12, Math.max(0, parseInt(correctCount, 10) || 0));
      const parsedScore = Math.max(0, parseInt(score, 10) || 0);

      const newEntry = {
        id: Date.now().toString(),
        name: cleanName,
        correctCount: parsedCorrect,
        totalQuestions: 12,
        score: parsedScore,
        timeTaken: Math.round(Number(timeTaken) || 0),
        date: new Date().toISOString().split('T')[0]
      };

      leaderboard.push(newEntry);

      const sorted = [...leaderboard].sort((a, b) => {
        if (b.correctCount !== a.correctCount) {
          return b.correctCount - a.correctCount;
        }
        return b.score - a.score;
      });

      leaderboard = sorted.slice(0, 50);
      const rank = sorted.findIndex(item => item.id === newEntry.id) + 1;

      return res.status(201).json({
        success: true,
        rank,
        entry: newEntry,
        topScores: sorted.slice(0, 15)
      });
    }

    if (req.method === 'DELETE') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          body = {};
        }
      }
      if (!body || typeof body !== 'object') {
        body = {};
      }

      // Verificación de autorización: solo "lorenzo olocco" (sin distinguir mayúsculas)
      const adminName = (body.adminName || req.query?.adminName || '').trim().toLowerCase();
      if (adminName !== 'lorenzo olocco') {
        return res.status(403).json({
          success: false,
          error: 'Acceso denegado: solo Lorenzo Olocco tiene permisos de moderación para eliminar calificaciones.'
        });
      }

      const { id, clearAll } = body;
      const targetId = id || req.query?.id;

      if (clearAll) {
        leaderboard = [];
      } else if (targetId) {
        leaderboard = leaderboard.filter(item => item.id !== targetId.toString());
      } else {
        return res.status(400).json({ success: false, error: 'Se requiere ID o parámetro clearAll' });
      }

      const sorted = [...leaderboard].sort((a, b) => {
        if (b.correctCount !== a.correctCount) {
          return b.correctCount - a.correctCount;
        }
        return b.score - a.score;
      });

      return res.status(200).json({
        success: true,
        message: 'Calificación eliminada correctamente.',
        topScores: sorted.slice(0, 15)
      });
    }

    return res.status(405).json({ success: false, error: 'Método no permitido' });
  } catch (err) {
    console.error('Error en /api/scores:', err);
    return res.status(500).json({ success: false, error: err.message || 'Error interno del servidor' });
  }
}
