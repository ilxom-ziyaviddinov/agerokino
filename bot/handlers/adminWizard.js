// Admin "film qo'shish" yoki "bitta maydonni tahrirlash" jarayonida
// kelgan matn va rasm xabarlarni qayta ishlaydi. messages.js (matn) va
// bot.js (rasm) shu yerga yo'naltiradi.

const { Markup } = require('telegraf');
const {
  ADD_STEPS,
  getWizard,
  clearWizard,
  advanceAddWizard,
  setPosterAndFinish,
} = require('../state/adminWizardState');
const movieService = require('../../services/movieService');

const NUMERIC_FIELDS = ['year', 'rating', 'duration'];

function validateAddData(rawData) {
  const errors = [];
  const clean = {};

  const title = (rawData.title || '').toString().trim();
  if (!title) errors.push('Kino nomi bo\'sh bo\'lishi mumkin emas.');
  if (title.length > 200) errors.push('Kino nomi juda uzun (200 belgidan kam bo\'lsin).');
  clean.title = title;

  clean.country = rawData.country ? rawData.country.trim() : null;
  clean.language = rawData.language ? rawData.language.trim() : null;
  clean.genre = rawData.genre ? rawData.genre.trim() : null;
  clean.hashtags = rawData.hashtags ? rawData.hashtags.trim() : null;
  clean.trailer_url = rawData.trailer_url ? rawData.trailer_url.trim() : null;

  if (rawData.year) {
    const year = parseInt(rawData.year, 10);
    if (Number.isNaN(year) || year < 1888 || year > 2100) {
      errors.push('Yil noto\'g\'ri (1888–2100 oralig\'ida bo\'lsin).');
    } else {
      clean.year = year;
    }
  } else {
    clean.year = null;
  }

  return { errors, clean };
}

/**
 * Wizard matn xabarini qayta ishlaydi.
 * @returns {boolean} true bo'lsa — xabar shu yerda "ishlatildi"
 */
async function handleAdminWizardText(ctx) {
  const telegramId = ctx.from.id;
  const wizard = getWizard(telegramId);
  if (!wizard) return false;

  const text = (ctx.message.text || '').trim();

  // ---------- ADD WIZARD: matn bosqichlari ----------
  if (wizard.mode === 'add') {
    const currentField = ADD_STEPS[wizard.stepIndex].field;
    const result = advanceAddWizard(telegramId, currentField, text);

    if (!result.done) {
      await ctx.reply(result.nextPrompt);
      return true;
    }

    // Matn bosqichlari tugadi — endi poster (rasm) so'raladi.
    await ctx.reply('🖼 Rasmini yuboring:');
    return true;
  }

  // ---------- ADD WIZARD: poster kutilmoqda, lekin matn kelsa ----------
  if (wizard.mode === 'add_await_poster') {
    await ctx.reply('🖼 Iltimos, rasm yuboring (fayl sifatida emas, oddiy rasm sifatida).');
    return true;
  }

  // ---------- SINGLE FIELD EDIT ----------
  if (wizard.mode === 'edit_field') {
    const { movieId, field } = wizard;
    let value = text === '-' ? null : text;

    if (NUMERIC_FIELDS.includes(field) && value !== null) {
      const num = field === 'rating' ? parseFloat(value) : parseInt(value, 10);
      if (Number.isNaN(num)) {
        await ctx.reply('😕 Raqam kiriting. Qayta urinib ko\'ring:');
        return true;
      }
      value = num;
    }

    const updated = await movieService.updateMovie(movieId, { [field]: value });
    clearWizard(telegramId);

    if (!updated) {
      await ctx.reply('😕 Yangilashda xatolik yuz berdi.');
      return true;
    }

    await ctx.reply(`✅ Yangilandi: ${field} = ${value === null ? '(bo\'sh)' : value}`);
    return true;
  }

  return false;
}

/**
 * Wizard rasm (photo) xabarini qayta ishlaydi — poster yuklash bosqichi.
 * Rasm Telegram orqali oddiy rasm (photo) yoki "fayl sifatida" (document,
 * masalan Telegram Desktop'da "Compression" o'chirilgan bo'lsa) yuborilishi
 * mumkin — ikkalasini ham qabul qilamiz, aks holda wizard poster kutgan
 * holatda "osilib" qoladi va admin uchun kino qo'shish ishlamayotgandek tuyuladi.
 * @returns {boolean} true bo'lsa — xabar shu yerda "ishlatildi"
 */
async function handleAdminWizardPhoto(ctx) {
  const telegramId = ctx.from.id;
  const wizard = getWizard(telegramId);
  if (!wizard) return false;

  // Faqat "poster kutilmoqda" holatida ishlaydi.
  if (wizard.mode !== 'add_await_poster' && wizard.mode !== 'edit_field') return false;

  const photos = ctx.message.photo;
  const document = ctx.message.document;
  const isImageDocument = document && document.mime_type && document.mime_type.startsWith('image/');

  let fileId;
  if (photos && photos.length > 0) {
    // Eng sifatli (oxirgi, eng katta o'lchamli) versiyasini olamiz.
    fileId = photos[photos.length - 1].file_id;
  } else if (isImageDocument) {
    fileId = document.file_id;
  } else {
    // Wizard rasm kutmoqda, lekin rasm bo'lmagan fayl (masalan video yoki hujjat) kelsa —
    // jim o'tkazib yubormasdan, aniq xabar beramiz.
    if (wizard.mode === 'add_await_poster' || (wizard.mode === 'edit_field' && wizard.field === 'poster_url')) {
      await ctx.reply('🖼 Iltimos, rasm yuboring (rasm yoki rasm fayli sifatida).');
      return true;
    }
    return false;
  }

  const fileLink = await ctx.telegram.getFileLink(fileId);
  const posterUrl = fileLink.href;

  // ---------- YANGI FILM QO'SHISHDA POSTER ----------
  if (wizard.mode === 'add_await_poster') {
    const data = setPosterAndFinish(telegramId, posterUrl);
    const { errors, clean } = validateAddData(data);

    if (errors.length > 0) {
      clearWizard(telegramId);
      await ctx.reply(`😕 Xatolik:\n${errors.join('\n')}\n\nQaytadan boshlash uchun /admin ni bosing.`);
      return true;
    }

    clean.poster_url = posterUrl;
    const created = await movieService.createMovie({ ...clean, type: 'movie' });
    clearWizard(telegramId);

    if (!created) {
      await ctx.reply('😕 Kino qo\'shishda xatolik yuz berdi.');
      return true;
    }

    await ctx.reply(
      `✅ Kino qo'shildi!\n\n🎬 ${created.title}\n🌍 ${created.country || '—'}\n🗣 ${created.language || '—'}\n📅 ${created.year || '—'}\n🎭 ${created.genre || '—'}\n\n🔑 Kino kodi: ${created.id}\n\nFoydalanuvchilar botga shu kodni yuborsa, kino chiqadi.`
    );
    return true;
  }

  // ---------- MAVJUD FILMNING POSTERINI TAHRIRLASH ----------
  if (wizard.mode === 'edit_field' && wizard.field === 'poster_url') {
    const updated = await movieService.updateMovie(wizard.movieId, { poster_url: posterUrl });
    clearWizard(telegramId);

    if (!updated) {
      await ctx.reply('😕 Yangilashda xatolik yuz berdi.');
      return true;
    }

    await ctx.reply('✅ Poster yangilandi.');
    return true;
  }

  return false;
}

module.exports = { handleAdminWizardText, handleAdminWizardPhoto, validateAddData };
