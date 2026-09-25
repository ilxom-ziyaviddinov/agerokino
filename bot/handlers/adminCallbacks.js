// Admin menyusidagi inline tugmalar uchun handler.
// Asosiy callbacks.js faylidan alohida saqlanadi — tartibli bo'lishi uchun.

const { Markup } = require('telegraf');
const { getAdminRole, listBotAdmins, getOwnerId } = require('../../services/adminService');
const movieService = require('../../services/movieService');
const {
  startAddWizard,
  startEditFieldWizard,
} = require('../state/adminWizardState');
const { formatMovieCaption } = require('../../utils/movieFormat');

const PAGE_SIZE = 10;

const EDIT_FIELDS = [
  { field: 'title', label: '✏️ Nomi', prompt: '🎬 Yangi nomni yozing:' },
  { field: 'country', label: '🌍 Davlati', prompt: '🌍 Yangi davlatni yozing:' },
  { field: 'language', label: '🗣 Tili', prompt: '🗣 Yangi tilni yozing:' },
  { field: 'year', label: '📅 Yili', prompt: '📅 Yangi yilni yozing:' },
  { field: 'genre', label: '🎭 Janri', prompt: '🎭 Yangi janrni yozing:' },
  { field: 'hashtags', label: '# Hesh teglar', prompt: '# Yangi hesh teglarni yozing:' },
  { field: 'trailer_url', label: '🎞 Treyler', prompt: '🎞 Yangi treyler havolasini yuboring:' },
  { field: 'poster_url', label: '🖼 Poster', prompt: '🖼 Yangi rasmni yuboring:' },
  { field: 'description', label: '📝 Tavsif', prompt: '📝 Yangi tavsifni yozing:' },
];

function formatAdminsList(admins, ownerId) {
  const lines = ['👥 BOT ADMINLARI:', ''];

  if (ownerId) {
    lines.push(`👑 ${ownerId} — SUPER_ADMIN (OWNER)`);
  }

  if (admins.length === 0) {
    lines.push('(qo\'shimcha adminlar yo\'q)');
  } else {
    admins.forEach((a) => {
      lines.push(`• ${a.telegram_id} — ${a.role}${a.username ? ' (@' + a.username + ')' : ''}`);
    });
  }

  lines.push('');
  lines.push('➕ Yangi admin qo\'shish uchun:');
  lines.push('/addadmin <telegram_id> [ROLE]');
  lines.push('Masalan: /addadmin 123456789 ADMIN');
  lines.push('');
  lines.push('❌ O\'chirish uchun:');
  lines.push('/removeadmin <telegram_id>');

  return lines.join('\n');
}

function formatMoviesListText(movies, page, totalPages) {
  if (movies.length === 0) {
    return '📋 Filmlar topilmadi.';
  }
  const lines = [`📋 FILMLAR RO'YXATI (${page}/${totalPages})`, ''];
  movies.forEach((m) => {
    const status = m.is_published ? '🟢' : '⚪️';
    lines.push(`${status} #${m.id} — ${m.title} (${m.year || '—'})`);
  });
  return lines.join('\n');
}

function moviesListKeyboard(movies, page, totalPages) {
  const rows = movies.map((m) => [
    Markup.button.callback(`✏️ #${m.id} ${m.title}`, `admin_movie_edit_${m.id}`),
  ]);

  const nav = [];
  if (page > 1) nav.push(Markup.button.callback('⬅️', `admin_movies_list_${page - 1}`));
  nav.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('➡️', `admin_movies_list_${page + 1}`));
  rows.push(nav);

  rows.push([Markup.button.callback('⬅️ Admin menyuga qaytish', 'admin_menu_back')]);

  return Markup.inlineKeyboard(rows);
}

function movieEditKeyboard(movie) {
  const rows = EDIT_FIELDS.map((f) => [
    Markup.button.callback(f.label, `admin_field_${f.field}_${movie.id}`),
  ]);

  const toggleLabel = movie.is_published ? '⚪️ Yashirish' : '🟢 Ko\'rsatish';
  rows.push([Markup.button.callback(toggleLabel, `admin_toggle_${movie.id}`)]);
  rows.push([Markup.button.callback('🗑 O\'chirish', `admin_delete_${movie.id}`)]);
  rows.push([Markup.button.callback('⬅️ Ro\'yxatga qaytish', 'admin_movies_list_1')]);

  return Markup.inlineKeyboard(rows);
}

function adminMainMenuButtons(role) {
  const buttons = [
    [Markup.button.callback('➕ Film qo\'shish', 'admin_add_movie')],
    [Markup.button.callback('📋 Filmlar ro\'yxati', 'admin_movies_list_1')],
  ];
  if (role === 'SUPER_ADMIN') {
    buttons.push([Markup.button.callback('👥 Adminlar', 'admin_list_admins')]);
  }
  return buttons;
}

function registerAdminCallbacks(bot) {
  async function requireAdmin(ctx) {
    const role = await getAdminRole(ctx.from.id);
    if (!role) {
      await ctx.answerCbQuery('⛔️ Sizda admin huquqi yo\'q.', { show_alert: true });
      return null;
    }
    return role;
  }

  bot.action('admin_list_admins', async (ctx) => {
    const role = await requireAdmin(ctx);
    if (!role) return;
    await ctx.answerCbQuery();

    const admins = await listBotAdmins();
    const text = formatAdminsList(admins, getOwnerId());

    await ctx
      .editMessageText(
        text,
        Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin menyuga qaytish', 'admin_menu_back')]])
      )
      .catch(async () => {
        await ctx.reply(text);
      });
  });

  bot.action(/admin_movies_list_(\d+)/, async (ctx) => {
    const role = await requireAdmin(ctx);
    if (!role) return;
    await ctx.answerCbQuery();

    const page = parseInt(ctx.match[1], 10) || 1;
    const { movies, totalPages } = await movieService.listMoviesAdmin({ page, pageSize: PAGE_SIZE });

    const text = formatMoviesListText(movies, page, totalPages);
    const keyboard = moviesListKeyboard(movies, page, totalPages);

    await ctx.editMessageText(text, keyboard).catch(async () => {
      await ctx.reply(text, keyboard);
    });
  });

  bot.action(/admin_movie_edit_(\d+)/, async (ctx) => {
    const role = await requireAdmin(ctx);
    if (!role) return;
    await ctx.answerCbQuery();

    const movieId = parseInt(ctx.match[1], 10);
    const movie = await movieService.getMovieByIdAny(movieId);

    if (!movie) {
      await ctx.editMessageText('😕 Film topilmadi.').catch(() => {});
      return;
    }

    const caption = formatMovieCaption(movie) + `\n\n${movie.is_published ? '🟢 Faol' : '⚪️ Yashirin'}`;
    await ctx.editMessageText(caption, movieEditKeyboard(movie)).catch(async () => {
      await ctx.reply(caption, movieEditKeyboard(movie));
    });
  });

  EDIT_FIELDS.forEach((f) => {
    bot.action(new RegExp(`admin_field_${f.field}_(\\d+)`), async (ctx) => {
      const role = await requireAdmin(ctx);
      if (!role) return;
      await ctx.answerCbQuery();

      const movieId = parseInt(ctx.match[1], 10);
      startEditFieldWizard(ctx.from.id, movieId, f.field, f.prompt);

      if (f.field === 'poster_url') {
        await ctx.reply(f.prompt);
      } else {
        await ctx.reply(f.prompt + '\n\n(bo\'sh qilish uchun "-" yozing)');
      }
    });
  });

  bot.action(/admin_toggle_(\d+)/, async (ctx) => {
    const role = await requireAdmin(ctx);
    if (!role) return;

    const movieId = parseInt(ctx.match[1], 10);
    const movie = await movieService.getMovieByIdAny(movieId);
    if (!movie) {
      await ctx.answerCbQuery('😕 Film topilmadi.', { show_alert: true });
      return;
    }

    const updated = await movieService.setPublished(movieId, !movie.is_published);
    if (!updated) {
      await ctx.answerCbQuery('😕 Holatni o\'zgartirishda xatolik yuz berdi.', { show_alert: true });
      return;
    }
    await ctx.answerCbQuery(updated.is_published ? '🟢 Ko\'rsatilmoqda' : '⚪️ Yashirildi');

    const caption =
      formatMovieCaption(updated) + `\n\n${updated.is_published ? '🟢 Faol' : '⚪️ Yashirin'}`;
    await ctx.editMessageText(caption, movieEditKeyboard(updated)).catch(() => {});
  });

  bot.action(/admin_delete_(\d+)/, async (ctx) => {
    const role = await requireAdmin(ctx);
    if (!role) return;
    await ctx.answerCbQuery();

    const movieId = parseInt(ctx.match[1], 10);
    await ctx.editMessageText(
      '⚠️ Rostdan ham bu filmni o\'chirmoqchimisiz? Bu amalni ortga qaytarib bo\'lmaydi.',
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ HA, o\'chirish', `admin_delete_confirm_${movieId}`)],
        [Markup.button.callback('❌ Bekor qilish', `admin_movie_edit_${movieId}`)],
      ])
    );
  });

  bot.action(/admin_delete_confirm_(\d+)/, async (ctx) => {
    const role = await requireAdmin(ctx);
    if (!role) return;

    const movieId = parseInt(ctx.match[1], 10);
    const ok = await movieService.deleteMovie(movieId);

    await ctx.answerCbQuery(ok ? '🗑 O\'chirildi' : '😕 Xatolik yuz berdi');
    await ctx.editMessageText(ok ? '🗑 Film o\'chirildi.' : '😕 O\'chirishda xatolik yuz berdi.').catch(() => {});
  });

  bot.action('admin_add_movie', async (ctx) => {
    const role = await requireAdmin(ctx);
    if (!role) return;
    await ctx.answerCbQuery();

    const firstStep = startAddWizard(ctx.from.id);
    await ctx.reply(firstStep.prompt);
  });

  bot.action('admin_menu_back', async (ctx) => {
    const role = await requireAdmin(ctx);
    if (!role) return;
    await ctx.answerCbQuery();

    await ctx
      .editMessageText(
        `🛠 ADMIN MENYU\n\nSizning rolingiz: ${role}\n\nQuyidagilardan birini tanlang:`,
        Markup.inlineKeyboard(adminMainMenuButtons(role))
      )
      .catch(async () => {
        await ctx.reply('🛠 ADMIN MENYU', Markup.inlineKeyboard(adminMainMenuButtons(role)));
      });
  });

  bot.action('noop', async (ctx) => {
    await ctx.answerCbQuery();
  });
}

module.exports = registerAdminCallbacks;
