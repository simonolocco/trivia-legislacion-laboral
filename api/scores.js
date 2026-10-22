// api/scores.js - Función de Vercel para el ranking de Derecho al Toque.
// Guarda los resultados en Upstash Redis (base conectada desde Vercel).
// Si las variables de la base no están, usa memoria (sirve para pruebas locales,
// pero se borra cuando el servidor se reinicia).

const KEY = 'trivia:ranking';
const MAX_KEPT = 200;   // resultados guardados
const TOP = 15;         // resultados que se muestran
const ADMIN_NAME = 'lorenzo olocco';

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);

let memory = [];

// Un solo número para ordenar: aciertos, después puntaje, después menos tiempo.
function rankValue(e) {
  return e.correctCount * 1e7 + e.score * 1e3 + (999 - Math.min(999, e.timeTaken));
}

function sortScores(list) {
  return [...list].sort((a, b) => rankValue(b) - rankValue(a));
}

async function redis(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!res.ok) throw new Error(`Redis respondió ${res.status}`);
  const data = await res.json();
  const failed = data.find((r) => r && r.error);
  if (failed) throw new Error(`Redis: ${failed.error}`);
  return data.map((r) => r.result);
}

function parseMembers(members) {
  return (members || []).map((m) => { try { return JSON.parse(m); } catch (e) { return null; } }).filter(Boolean);
}

const store = {
  async top() {
    if (!useRedis) return { list: sortScores(memory).slice(0, TOP), count: memory.length };
    const [members, count] = await redis([['ZREVRANGE', KEY, 0, TOP - 1], ['ZCARD', KEY]]);
    return { list: parseMembers(members), count };
  },
  async add(entry) {
    if (!useRedis) {
      memory = sortScores([...memory, entry]).slice(0, MAX_KEPT);
      return memory.findIndex((e) => e.id === entry.id) + 1;
    }
    const member = JSON.stringify(entry);
    const [, rank] = await redis([
      ['ZADD', KEY, rankValue(entry), member],
      ['ZREVRANK', KEY, member],
      ['ZREMRANGEBYRANK', KEY, 0, -(MAX_KEPT + 1)]
    ]);
    return rank === null || rank === undefined ? 0 : rank + 1;
  },
  async remove(id) {
    if (!useRedis) { memory = memory.filter((e) => e.id !== id); return; }
    const [members] = await redis([['ZRANGE', KEY, 0, -1]]);
    const target = (members || []).find((m) => { try { return JSON.parse(m).id === id; } catch (e) { return false; } });
    if (target) await redis([['ZREM', KEY, target]]);
  },
  async clear() {
    if (!useRedis) { memory = []; return; }
    await redis([['DEL', KEY]]);
  }
};

function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  return body && typeof body === 'object' ? body : {};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { list, count } = await store.top();
      return res.status(200).json({ success: true, count, storage: useRedis ? 'redis' : 'memory', topScores: list });
    }

    if (req.method === 'POST') {
      const { name, correctCount, score = 0, timeTaken = 0, unit = 'all' } = readBody(req);
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'El nombre es requerido' });
      }

      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: name.replace(/\s+/g, ' ').trim().slice(0, 40),
        correctCount: Math.min(12, Math.max(0, parseInt(correctCount, 10) || 0)),
        totalQuestions: 12,
        // 12 preguntas x 300 puntos como máximo por pregunta
        score: Math.min(3600, Math.max(0, parseInt(score, 10) || 0)),
        timeTaken: Math.min(999, Math.max(0, Math.round(Number(timeTaken) || 0))),
        unit: ['all', '4', '5'].includes(String(unit)) ? String(unit) : 'all',
        date: new Date().toISOString().split('T')[0]
      };

      const rank = await store.add(entry);
      const { list } = await store.top();
      return res.status(201).json({ success: true, rank, entry, topScores: list });
    }

    if (req.method === 'DELETE') {
      const body = readBody(req);
      const adminName = String(body.adminName || req.query?.adminName || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (adminName !== ADMIN_NAME) {
        return res.status(403).json({
          success: false,
          error: 'Acceso denegado: solo Lorenzo Olocco puede borrar resultados.'
        });
      }

      const targetId = body.id || req.query?.id;
      if (body.clearAll) {
        await store.clear();
      } else if (targetId) {
        await store.remove(String(targetId));
      } else {
        return res.status(400).json({ success: false, error: 'Se requiere ID o parámetro clearAll' });
      }

      const { list } = await store.top();
      return res.status(200).json({ success: true, message: 'Resultado eliminado.', topScores: list });
    }

    return res.status(405).json({ success: false, error: 'Método no permitido' });
  } catch (err) {
    console.error('Error en /api/scores:', err);
    return res.status(500).json({ success: false, error: 'No se pudo acceder al ranking. Probá de nuevo.' });
  }
}
