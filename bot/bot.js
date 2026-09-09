// Botning "kirish nuqtasi" (entry point).
// Bu yerda faqat: commands/handlers/keyboardlarni ulash bor.
// Har bir bo'limning ICHKI logikasi alohida faylларда (commands/, handlers/).

const express = require('express');
const bot = require('../config/bot');
const logger = require('../utils/logger');

const startCommand = require('./commands/start');
const helpCommand = require('./commands/help');
const searchCommand = require('./commands/search');
const genresCommand = require('./commands/genres');
const favoritesCommand = require('./commands/favorites');
const topCommand = require('./commands/top');
const newMoviesCommand = require('./commands/newMovies');
const adminCommand = require('./commands/admin');
const addAdminCommand = require('./commands/addAdmin');
const removeAdminCommand = require('./commands/removeAdmin');
const registerCallbacks = require('./handlers/callbacks');
const registerAdminCallbacks = require('./handlers/adminCallbacks');
const textHandler = require('./handlers/messages');
const { handleAdminWizardPhoto } = require('./handlers/adminWizard');
const floodProtection = require('./middleware/floodProtection');

// ------- Global middleware -------
bot.use(floodProtection());

// ------- Komandalar -------
bot.start(startCommand);
bot.help(helpCommand);

// ------- Admin komandalar -------
bot.command('admin', adminCommand);
bot.command('addadmin', addAdminCommand);
bot.command('removeadmin', removeAdminCommand);

// ------- Inline tugmalar (callback_query) -------
registerCallbacks(bot);
registerAdminCallbacks(bot);

// ------- Reply-menyu tugmalari (matn orqali keladi) -------
bot.hears('ℹ️ Yordam', helpCommand);
bot.hears('🔎 Kino qidirish', searchCommand);
bot.hears('🎭 Janrlar', genresCommand);
bot.hears('❤️ Sevimlilar', favoritesCommand);
bot.hears('🔥 TOP kinolar', topCommand);
bot.hears('🆕 Yangi qo\'shilganlar', newMoviesCommand);

// Hali yozilmagan bo'limlar uchun vaqtinchalik javob (keyingi bosqichlarda almashtiriladi).
bot.hears(
  ['📺 Seriallar', '🎯 Menga kino tavsiya qil'],
  async (ctx) => {
    await ctx.reply('🚧 Bu bo\'lim keyingi bosqichlarda qo\'shiladi. Iltimos, kuting.');
  }
);

// ------- Boshqa barcha matn xabarlar (qidiruv oqimi shu yerda ishlaydi) -------
bot.on('text', textHandler);
bot.on('photo', handleAdminWizardPhoto);

// ------- Global xatolarni ushlash -------
// Bot foydalanuvchiga texnik xato (Error 500, TypeError...) ko'rsatmaydi.
bot.catch((err, ctx) => {
  logger.error(`Bot xatosi (update ${ctx.updateType}):`, err);
  ctx.reply('😕 Kechirasiz, hozircha xatolik yuz berdi. Birozdan keyin qayta urinib ko\'ring.').catch(() => {});
});

bot.launch();
logger.info('🤖 KinoBot ishga tushdi');

// ------- Health-check HTTP server -------
// Render (va shunga o'xshash hostinglar) "Web Service" turidagi joylashtirishlarni
// faqat biror portni tinglagan (HTTP so'rovlarga javob bergan) taqdirdagina "sog'lom"
// deb hisoblaydi va uni uxlab qolishdan saqlash uchun tashqi "ping" xizmati
// (masalan UptimeRobot yoki cron-job.org) shu manzilga so'rov yuborib turadi.
// Bot o'zi Telegram bilan polling orqali ishlaydi — bu server faqat "men tirikman"
// deb javob berish uchun kerak, botning asosiy logikasiga aloqasi yo'q.
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).send('KinoBot ishlab turibdi ✅');
});

app.listen(PORT, () => {
  logger.info(`🌐 Health-check server ${PORT}-portda ishga tushdi`);
});

// Botni to'g'ri to'xtatish (Ctrl+C bosilganda)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
