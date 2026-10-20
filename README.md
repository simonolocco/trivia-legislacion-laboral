# Evaluación de Legislación General y Laboral Argentina

Sistema profesional e individual de evaluación normativa y certificación de conocimientos sobre Derecho Laboral Argentino, diseñado con estética institucional sobria (blanco y azul marino) y optimizado para dispositivos móviles y escritorio.

---

## 🏛️ Características de la Plataforma

- **Diseño Profesional & Ejecutivo**: Interfaz sobria en blanco y azul corporativo (`#0f2e5a` / `#2563eb`), sin animaciones informales ni emojis, con tipografía clara y jerárquica.
- **Evaluación 100% Individual**: 12 preguntas oficiales distribuidas en 4 módulos normativos:
  1. **Constitución y Derechos**: Ley suprema (Art. 31 y 75 inc. 22 CN), Art. 14 bis y vacaciones pagadas.
  2. **Historia y Principios**: Mártires de Chicago de 1886 (jornada de 8 horas), Principio Protectorio (in dubio pro operario - Art. 9 LCT) y Principio de Irrenunciabilidad (Art. 12 LCT).
  3. **Contrato de Trabajo**: Ley de Contrato de Trabajo 20.744, concepto de relación de dependencia y condición indefectible de persona física del trabajador.
  4. **Unidad 5 (Córdoba & Régimen Indemnizatorio)**: Ley Provincial Córdoba 7186 de APM, jornada legal ordinaria de 8 horas (Ley 11.544) e indemnización por despido sin causa (Art. 245 LCT).
- **Mini Backend Integrado para Vercel (`/api/scores`)**:
  - Función serverless en Node.js que gestiona el cuadro de honor (leaderboard).
  - Almacena y clasifica a los participantes por **cantidad de aciertos** y puntuación.
  - Fallback automático y resiliente a `localStorage` para despliegues estáticos (GitHub Pages) u offline.

---

## 🚀 Despliegue en Vercel

El proyecto está preparado para desplegarse con un solo clic en **Vercel**:

1. Subir a GitHub o conectar este repositorio en Vercel.
2. Vercel detecta automáticamente la ruta `/api/scores.js` como una **Serverless Function** y los archivos estáticos en la raíz (`index.html`).
3. No requiere variables de entorno obligatorias para operar.

---

## 💻 Ejecución Local

Para probarlo localmente con servidor HTTP:
```bash
npx serve .
```
O simplemente abrir `index.html` en cualquier navegador web.
