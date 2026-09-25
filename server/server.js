// Admin panel uchun backend API'ning kirish nuqtasi.

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const moviesRoutes = require('./routes/movies');

const app = express();
const PORT = process.env.PORT || 3000;

// Agar server reverse proxy (Nginx, Render, Railway va h.k.) orqasida ishlasa,
// bu qator rate-limiter'ga foydalanuvchining haqiqiy IP'sini to'g'ri aniqlashga yordam beradi.
app.set('trust proxy', 1);

// ------- Xavfsizlik middleware'lari -------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // Statistika sahifasi (admin/stats.html) Chart.js'ni CDN orqali yuklaydi.
        'script-src': ["'self'", 'https://cdnjs.cloudflare.com'],
      },
    },
  })
);

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || '*',
  })
);

// JSON payload hajmini cheklaymiz — katta so'rovlar orqali server ortiqcha yuklanmasin.
app.use(express.json({ limit: '1mb' }));

// Admin panel frontend fayllarini (login.html, style.css, app.js, ...) xizmat qilish
app.use(express.static(path.join(__dirname, '..', 'admin')));

// Barcha /api so'rovlari uchun umumiy rate limit (login route'ida alohida, qattiqroq limit bor).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Test uchun oddiy health-check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'KinoBot server ishlayapti' });
});

// ------- API route'lar -------
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/movies', moviesRoutes);

// 404 — noma'lum API endpoint uchun
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint topilmadi.' });
});

// Global error handler — foydalanuvchiga texnik xato ko'rsatmaydi
app.use((err, req, res, next) => {
  logger.error('Server xatosi:', err);
  res.status(500).json({ error: 'Ichki server xatosi yuz berdi.' });
});

// Faqat shu fayl to'g'ridan-to'g'ri ishga tushirilganda (masalan `npm run server:start`
// yoki `npm run server:dev` orqali, lokal rivojlantirishda) portni o'zi tinglaydi.
// `bot/bot.js` esa bu ilovani import qilib, o'zi bitta umumiy portda ishga tushiradi —
// shunda bitta Render xizmatida ham bot, ham admin panel birga ishlaydi.
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`🖥️  Server http://localhost:${PORT} portida ishga tushdi`);
  });
}

module.exports = app;
