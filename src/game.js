(() => {
  'use strict';

  const V = window.CHUKO_VISUAL;
  const DICT = window.CHUKO_I18N;
  const CFG = window.X2_GAME_CONFIG || {};
  const LMS = window.X2LMS;
  const GAME_ID = new URLSearchParams(location.search).get('gameId') || CFG.gameId || 'CHUKO';

  if (!window.PIXI || !window.Matter) {
    document.getElementById('status').textContent = 'Ошибка загрузки графического движка';
    document.getElementById('action-btn').textContent = 'Повторить';
    return;
  }

  const { Engine, Bodies, Body, Composite, Events } = Matter;

  const ui = {
    host: document.getElementById('pixi-host'),
    balance: document.getElementById('balance-value'),
    denomStrip: document.getElementById('denom-strip'),
    denomViewport: document.getElementById('denom-viewport'),
    denomTrack: document.getElementById('denom-track'),
    denomPrev: document.getElementById('denom-prev'),
    denomNext: document.getElementById('denom-next'),
    deposit: document.getElementById('deposit-btn'),
    modeSwitch: document.getElementById('mode-switch'),
    action: document.getElementById('action-btn'),
    autoPlay: document.getElementById('autoplay-btn'),
    autoMenu: document.getElementById('autoplay-menu'),
    autoMenuTitle: document.getElementById('autoplay-menu-title'),
    autoCounts: document.getElementById('autoplay-counts'),
    status: document.getElementById('status'),
    toast: document.getElementById('result-toast'),
    knocked: document.getElementById('score-knocked'),
    scoreWin: document.getElementById('score-win'),
    khan: document.getElementById('score-khan'),

    info: document.getElementById('info-btn'),
    infoMenu: document.getElementById('info-menu'),
    infoPayout: document.getElementById('info-payout'),
    infoHow: document.getElementById('info-how'),
    infoTickets: document.getElementById('info-tickets'),

    sound: document.getElementById('sound-btn'),
    music: document.getElementById('music-btn'),
    ticketNumber: document.getElementById('ticket-number'),

    helpModal: document.getElementById('help-modal'),
    helpClose: document.getElementById('help-close'),
    helpOk: document.getElementById('help-ok'),

    payoutModal: document.getElementById('payout-modal'),
    payoutClose: document.getElementById('payout-close'),
    payoutOk: document.getElementById('payout-ok'),

    ticketsModal: document.getElementById('tickets-modal'),
    ticketsClose: document.getElementById('tickets-close'),
    ticketsOk: document.getElementById('tickets-ok'),
    ticketsList: document.getElementById('tickets-list')
  };

  let language = 'RU';
  let currency = 'KGS';
  let currencyDisplay = 'сом';
  let denominations = [100];
  let stake = Number(CFG.denomination || 100);
  let gameMode = String(CFG.mode || 'real').toLowerCase() === 'demo' ? 'demo' : 'real';
  let demoAllowed = Boolean(CFG.demoAllowed);
  let demoBalance = Number(CFG.demoBalance || 10000);
  let realBalance = null;
  let balance = null;

  let state = 'boot';
  let ticket = null;
  let pendingBalance = null;
  let resultVisible = false;

  const audioSettings = {
    soundEnabled: Boolean(CFG.audio?.soundEnabled ?? true),
    musicEnabled: Boolean(CFG.audio?.musicEnabled ?? false),
    soundVolume: Math.max(0, Math.min(1, Number(CFG.audio?.soundVolume ?? 0.22))),
    musicVolume: Math.max(0, Math.min(1, Number(CFG.audio?.musicVolume ?? 0.055)))
  };

  try {
    const storedSound = localStorage.getItem('x2-chuko-sound');
    const storedMusic = localStorage.getItem('x2-chuko-music');
    if (storedSound !== null) audioSettings.soundEnabled = storedSound === '1';
    if (storedMusic !== null) audioSettings.musicEnabled = storedMusic === '1';
  } catch (_) {}

  const audioRuntime = {
    ctx: null,
    master: null,
    sfxGain: null,
    musicGain: null,
    musicTimer: null,
    impactTimer: null,
    lastState: null,
    unlocked: false
  };

  const autoPlay = {
    active: false,
    stopRequested: false,

    // Selected count before the user confirms with "Старт N".
    selected: null,

    total: 0,
    completed: 0,
    remaining: 0,
    fixedStake: null,
    nextTimer: null,
    throwTimer: null
  };

  let app = null;
  let engine = null;
  let fieldLayer = null;
  let pieceLayer = null;
  let outLayer = null;
  let fxLayer = null;
  let fieldSprite = null;
  let fieldMask = null;
  let aimGuide = null;

  // Embedded preview texture cache.
  const embeddedTextures = new Map();

  function isEmbeddedAsset(src) {
    return typeof src === 'string' &&
      (src.startsWith('data:') || src.startsWith('blob:'));
  }

  async function preloadEmbeddedTexture(src) {
    if (!isEmbeddedAsset(src) || embeddedTextures.has(src)) return;

    const texture = await new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';

      image.onload = () => {
        try {
          resolve(PIXI.Texture.from(image));
        } catch (err) {
          reject(err);
        }
      };

      image.onerror = () => reject(new Error('Embedded image load failed'));
      image.src = src;
    });

    embeddedTextures.set(src, texture);
  }

  function textureFor(src) {
    if (embeddedTextures.has(src)) return embeddedTextures.get(src);
    return PIXI.Texture.from(src);
  }

  async function setFieldTexture(src) {
    if (isEmbeddedAsset(src)) {
      await preloadEmbeddedTexture(src);
      fieldSprite.texture = textureFor(src);
      return;
    }

    await PIXI.Assets.load(src);
    fieldSprite.texture = PIXI.Texture.from(src);
  }
  let saka = null;
  let khan = null;
  let chuko = [];
  let physicsAccumulator = 0;
  let drag = null;
  let round = null;
  let bursts = [];

  function tr(key) {
    const lang = DICT[language] || DICT.RU;
    return lang[key] || DICT.RU[key] || key;
  }

  function money(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return Number(n).toLocaleString(language === 'KG' ? 'ru-RU' : 'ru-RU');
  }

  function applyTranslations() {
    document.documentElement.lang = language === 'KG' ? 'ky' : 'ru';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = tr(el.dataset.i18n);
    });
    renderModeSwitch();
    renderAudioControls();
    renderTicketNumber();
    renderState();
  }

  function currentDenominations() {
    return [...new Set((denominations || []).map(Number).filter(n => Number.isFinite(n) && n > 0))];
  }

  function applySettings(settings = {}) {
    language = String(settings.language || language || 'RU').toUpperCase() === 'KG' ? 'KG' : 'RU';
    currency = String(settings.currency || currency || 'KGS').toUpperCase();
    currencyDisplay = String(settings.currencyDisplay || settings.currencyLabel || settings.currencySymbol || currencyDisplay || currency);

    if (Array.isArray(settings.denominations) && settings.denominations.length) {
      denominations = settings.denominations.map(Number).filter(n => Number.isFinite(n) && n > 0);
    }

    const allowed = currentDenominations();
    const preferred = Number(settings.denomination ?? stake);
    stake = allowed.includes(preferred) ? preferred : (allowed[0] || preferred || 100);

    gameMode = String(settings.mode || gameMode || 'real').toLowerCase() === 'demo' ? 'demo' : 'real';
    demoAllowed = Boolean(settings.demoAllowed);
    if (Number.isFinite(Number(settings.demoBalance))) demoBalance = Number(settings.demoBalance);
    if (!demoAllowed && gameMode === 'demo') gameMode = 'real';

    renderDenominationButtons({ centerActive:true });
    applyTranslations();
    renderAutoPlayMenu();
    renderBalance();
  }

  function renderBalance() {
    ui.balance.textContent = `${money(balance)} ${currencyDisplay}`;
  }

  function updateDenominationArrows() {
    if (!ui.denomViewport || !ui.denomPrev || !ui.denomNext) return;

    const maxScroll = Math.max(0, ui.denomViewport.scrollWidth - ui.denomViewport.clientWidth);
    const overflowing = maxScroll > 2;
    const left = ui.denomViewport.scrollLeft;

    ui.denomPrev.classList.toggle('visible', overflowing && left > 2);
    ui.denomNext.classList.toggle('visible', overflowing && left < maxScroll - 2);

    ui.denomPrev.disabled = !overflowing || left <= 2;
    ui.denomNext.disabled = !overflowing || left >= maxScroll - 2;
  }

  function centerActiveDenomination() {
    if (!ui.denomViewport || !ui.denomTrack) return;
    const active = ui.denomTrack.querySelector('.denom-option.active');
    if (!active) return;

    const target = active.offsetLeft - (ui.denomViewport.clientWidth - active.offsetWidth) / 2;
    const maxScroll = Math.max(0, ui.denomViewport.scrollWidth - ui.denomViewport.clientWidth);
    ui.denomViewport.scrollLeft = Math.max(0, Math.min(maxScroll, target));
    updateDenominationArrows();
  }

  function renderDenominationButtons({ centerActive = false } = {}) {
    if (!ui.denomTrack) return;

    ui.denomTrack.innerHTML = '';
    const enabled = ['idle', 'settled'].includes(state) && !autoPlay.active;

    currentDenominations().forEach(value => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'denom-option' + (Number(value) === Number(stake) ? ' active' : '');
      b.textContent = money(value);
      b.disabled = !enabled;
      b.dataset.denomination = String(value);

      b.addEventListener('click', () => {
        if (!['idle', 'settled'].includes(state)) return;

        stake = Number(value);
        autoPlay.selected = null;
        renderDenominationButtons({ centerActive:true });
        renderBalance();

        LMS.emit('X2_GAME_DENOMINATION_CHANGED', {
          gameId: GAME_ID,
          denomination: stake,
          currency,
          language,
          mode: gameMode
        });
      });

      ui.denomTrack.appendChild(b);
    });

    requestAnimationFrame(() => {
      if (centerActive) centerActiveDenomination();
      else updateDenominationArrows();
    });
  }

  function renderModeSwitch() {
    ui.modeSwitch.classList.toggle('hidden', !demoAllowed);
    ui.modeSwitch.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === gameMode);
      b.textContent = b.dataset.mode === 'demo' ? tr('demo') : tr('real');
      b.disabled = !['idle', 'settled'].includes(state) || autoPlay.active;
    });
  }

  function visualMultiplier() {
    // Do not reveal the LMS result when the ticket is merely ready.
    // The multiplier becomes visible only after the throw is fully visualized.
    if (!ticket || state !== 'settled') return 0;
    if (Number.isFinite(Number(ticket.multiplier))) return Number(ticket.multiplier);
    if (stake > 0 && Number.isFinite(Number(ticket.win))) return Number(ticket.win) / Number(stake);
    return 0;
  }

  function renderScore() {
    const knocked = round ? round.knocked : 0;
    ui.knocked.textContent = String(knocked);

    // Monetary win is shown only after the visual round has settled.
    // This preserves the existing rule: the LMS result is not revealed
    // before the throw animation is complete.
    const scoreWin = (ticket && state === 'settled')
      ? Number(ticket.win || 0)
      : 0;
    ui.scoreWin.textContent = money(scoreWin);

    if (round?.khanOut) ui.khan.textContent = '×5';
    else if (state === 'settled') ui.khan.textContent = tr('stood');
    else ui.khan.textContent = '—';
  }

  function saveAudioSettings() {
    try {
      localStorage.setItem('x2-chuko-sound', audioSettings.soundEnabled ? '1' : '0');
      localStorage.setItem('x2-chuko-music', audioSettings.musicEnabled ? '1' : '0');
    } catch (_) {}
  }

  function ensureAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return Promise.resolve(null);

    if (!audioRuntime.ctx) {
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      const sfxGain = ctx.createGain();
      const musicGain = ctx.createGain();

      master.gain.value = 1;
      sfxGain.gain.value = audioSettings.soundEnabled ? audioSettings.soundVolume : 0;
      musicGain.gain.value = audioSettings.musicEnabled ? audioSettings.musicVolume : 0;

      sfxGain.connect(master);
      musicGain.connect(master);
      master.connect(ctx.destination);

      audioRuntime.ctx = ctx;
      audioRuntime.master = master;
      audioRuntime.sfxGain = sfxGain;
      audioRuntime.musicGain = musicGain;
    }

    const ctx = audioRuntime.ctx;
    const resume = ctx.state === 'suspended' ? ctx.resume().catch(() => {}) : Promise.resolve();
    return resume.then(() => {
      audioRuntime.unlocked = ctx.state === 'running';
      if (audioSettings.musicEnabled) startMusicLoop();
      return ctx;
    });
  }

  function unlockAudio() {
    ensureAudioContext();
  }

  function updateAudioGains() {
    if (!audioRuntime.ctx) return;
    const now = audioRuntime.ctx.currentTime;
    audioRuntime.sfxGain?.gain.setTargetAtTime(
      audioSettings.soundEnabled ? audioSettings.soundVolume : 0,
      now, .025
    );
    audioRuntime.musicGain?.gain.setTargetAtTime(
      audioSettings.musicEnabled ? audioSettings.musicVolume : 0,
      now, .05
    );
  }

  function renderAudioControls() {
    if (ui.sound) {
      ui.sound.classList.toggle('on', audioSettings.soundEnabled);
      ui.sound.textContent = audioSettings.soundEnabled ? '🔊' : '🔇';
      ui.sound.title = tr('sound');
      ui.sound.setAttribute('aria-label', tr('sound'));
      ui.sound.setAttribute('aria-pressed', audioSettings.soundEnabled ? 'true' : 'false');
    }

    if (ui.music) {
      ui.music.classList.toggle('on', audioSettings.musicEnabled);
      ui.music.textContent = audioSettings.musicEnabled ? '♫' : '♫×';
      ui.music.title = tr('music');
      ui.music.setAttribute('aria-label', tr('music'));
      ui.music.setAttribute('aria-pressed', audioSettings.musicEnabled ? 'true' : 'false');
    }
  }

  function toggleSound() {
    audioSettings.soundEnabled = !audioSettings.soundEnabled;
    saveAudioSettings();
    ensureAudioContext().then(() => {
      updateAudioGains();
      if (audioSettings.soundEnabled) playUiTone();
    });
    renderAudioControls();
  }

  function toggleMusic() {
    audioSettings.musicEnabled = !audioSettings.musicEnabled;
    saveAudioSettings();

    ensureAudioContext().then(() => {
      updateAudioGains();
      if (audioSettings.musicEnabled) startMusicLoop();
      else stopMusicLoop();
    });

    renderAudioControls();
  }

  function tone({
    frequency = 440,
    endFrequency = null,
    duration = .08,
    gain = .10,
    type = 'sine',
    destination = null,
    delay = 0
  } = {}) {
    const ctx = audioRuntime.ctx;
    if (!ctx || ctx.state !== 'running') return;

    const target = destination || audioRuntime.sfxGain;
    if (!target) return;

    const start = ctx.currentTime + Math.max(0, delay);
    const end = start + Math.max(.02, duration);

    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (Number.isFinite(endFrequency)) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), end);
    }

    amp.gain.setValueAtTime(.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), start + Math.min(.018, duration*.25));
    amp.gain.exponentialRampToValueAtTime(.0001, end);

    osc.connect(amp);
    amp.connect(target);
    osc.start(start);
    osc.stop(end + .02);
  }

  function playUiTone() {
    if (!audioSettings.soundEnabled) return;
    ensureAudioContext().then(() => {
      tone({frequency:640,endFrequency:760,duration:.055,gain:.055,type:'sine'});
    });
  }

  function playThrowTone() {
    if (!audioSettings.soundEnabled) return;
    ensureAudioContext().then(() => {
      tone({frequency:185,endFrequency:420,duration:.24,gain:.11,type:'triangle'});
    });
  }

  function playImpactTone() {
    if (!audioSettings.soundEnabled) return;
    ensureAudioContext().then(() => {
      tone({frequency:120,endFrequency:70,duration:.13,gain:.16,type:'square'});
      tone({frequency:280,endFrequency:160,duration:.10,gain:.07,type:'triangle',delay:.025});
    });
  }

  function playResultTone(win) {
    if (!audioSettings.soundEnabled) return;
    ensureAudioContext().then(() => {
      if (Number(win) > 0) {
        tone({frequency:523,duration:.12,gain:.07,type:'sine'});
        tone({frequency:659,duration:.14,gain:.07,type:'sine',delay:.11});
        tone({frequency:784,duration:.18,gain:.08,type:'sine',delay:.22});
      } else {
        tone({frequency:230,endFrequency:175,duration:.22,gain:.055,type:'triangle'});
      }
    });
  }

  function playMusicPhrase() {
    const ctx = audioRuntime.ctx;
    if (!ctx || ctx.state !== 'running' || !audioSettings.musicEnabled) return;

    const notes = [196.00, 246.94, 293.66, 246.94];
    notes.forEach((frequency, i) => {
      tone({
        frequency,
        duration:.52,
        gain:.22,
        type:'sine',
        destination:audioRuntime.musicGain,
        delay:i*.55
      });
      tone({
        frequency:frequency/2,
        duration:.58,
        gain:.10,
        type:'triangle',
        destination:audioRuntime.musicGain,
        delay:i*.55
      });
    });
  }

  function startMusicLoop() {
    if (!audioSettings.musicEnabled || !audioRuntime.ctx || audioRuntime.ctx.state !== 'running') return;
    if (audioRuntime.musicTimer) return;

    playMusicPhrase();
    audioRuntime.musicTimer = setInterval(playMusicPhrase, 2400);
  }

  function stopMusicLoop() {
    if (audioRuntime.musicTimer) {
      clearInterval(audioRuntime.musicTimer);
      audioRuntime.musicTimer = null;
    }
  }

  function syncAudioWithState() {
    if (audioRuntime.lastState === state) return;
    const previous = audioRuntime.lastState;
    audioRuntime.lastState = state;

    if (state === 'throwing') {
      playThrowTone();

      if (audioRuntime.impactTimer) clearTimeout(audioRuntime.impactTimer);
      audioRuntime.impactTimer = setTimeout(() => {
        audioRuntime.impactTimer = null;
        if (state === 'throwing') playImpactTone();
      }, 640);
    }

    if (state === 'settled' && previous === 'throwing') {
      playResultTone(ticket?.win || 0);
    }
  }

  function renderTicketNumber() {
    if (!ui.ticketNumber) return;

    let value = '—';
    if (state === 'requesting') value = '…';
    else if (ticket?.ticketId != null && ticket.ticketId !== '') value = String(ticket.ticketId);

    ui.ticketNumber.textContent = `№ ${value}`;
    ui.ticketNumber.title = value === '—' || value === '…'
      ? tr('ticket')
      : `${tr('ticket')} № ${value}`;
  }

  function localTicketHistoryLimit() {
    const raw = Number(CFG.localTicketHistoryLimit ?? 5);
    return Math.max(1, Math.min(50, Number.isFinite(raw) ? Math.floor(raw) : 5));
  }

  function localTicketHistoryKey(mode = gameMode) {
    const normalizedMode = String(mode).toLowerCase() === 'demo' ? 'demo' : 'real';
    return `x2-chuko-ticket-history:${GAME_ID}:${normalizedMode}`;
  }

  function readLocalTicketHistory(mode = gameMode) {
    try {
      const raw = localStorage.getItem(localTicketHistoryKey(mode));
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(item =>
          item &&
          item.ticketId != null &&
          item.ticketId !== '' &&
          Number.isFinite(Number(item.win))
        )
        .slice(0, localTicketHistoryLimit());
    } catch (_) {
      return [];
    }
  }

  function saveCompletedTicketLocally(completedTicket, mode = gameMode) {
    if (!completedTicket || completedTicket.ticketId == null || completedTicket.ticketId === '') return;

    const item = {
      ticketId: String(completedTicket.ticketId),
      win: Number(completedTicket.win || 0)
    };

    const current = readLocalTicketHistory(mode)
      .filter(row => String(row.ticketId) !== item.ticketId);

    current.unshift(item);

    try {
      localStorage.setItem(
        localTicketHistoryKey(mode),
        JSON.stringify(current.slice(0, localTicketHistoryLimit()))
      );
    } catch (_) {}
  }

  function renderLocalTicketHistory() {
    if (!ui.ticketsList) return;

    const rows = readLocalTicketHistory(gameMode);
    ui.ticketsList.innerHTML = '';

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'tickets-empty';
      empty.textContent = tr('noRecentTickets');
      ui.ticketsList.appendChild(empty);
      return;
    }

    rows.forEach(item => {
      const row = document.createElement('div');
      row.className = 'ticket-history-row';

      const id = document.createElement('div');
      id.className = 'ticket-history-id';
      id.textContent = `№ ${item.ticketId}`;
      id.title = `${tr('ticket')} № ${item.ticketId}`;

      const win = document.createElement('div');
      win.className = 'ticket-history-win';
      win.textContent = money(item.win);

      row.append(id, win);
      ui.ticketsList.appendChild(row);
    });
  }

  function configuredAutoPlayCounts() {
    return [...new Set(
      (Array.isArray(CFG.autoPlayCounts) ? CFG.autoPlayCounts : [5,10,20,50])
        .map(Number)
        .filter(n => Number.isInteger(n) && n > 0)
    )];
  }

  function clearAutoTimers() {
    if (autoPlay.nextTimer) {
      clearTimeout(autoPlay.nextTimer);
      autoPlay.nextTimer = null;
    }
    if (autoPlay.throwTimer) {
      clearTimeout(autoPlay.throwTimer);
      autoPlay.throwTimer = null;
    }
  }

  function closeAutoMenu() {
    ui.autoMenu?.classList.remove('open');
    ui.autoMenu?.setAttribute('aria-hidden','true');
  }

  function renderAutoPlayMenu() {
    if (!ui.autoCounts) return;
    ui.autoCounts.innerHTML = '';
    configuredAutoPlayCounts().forEach(count => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'autoplay-count';
      b.textContent = String(count);
      b.addEventListener('click', e => {
        e.stopPropagation();

        // Step 1: only select the amount.
        // Actual autoplay starts only after clicking "Старт N".
        autoPlay.selected = count;
        closeAutoMenu();
        renderAutoPlayButton();
      });
      ui.autoCounts.appendChild(b);
    });
    if (ui.autoMenuTitle) ui.autoMenuTitle.textContent = tr('autoGames');
  }

  function renderAutoPlayButton() {
    if (!ui.autoPlay) return;

    const available = ['idle','settled'].includes(state);
    ui.autoPlay.classList.toggle('active', autoPlay.active);

    if (autoPlay.active) {
      const current = Math.min(autoPlay.total, autoPlay.completed + 1);
      ui.autoPlay.textContent = autoPlay.stopRequested
        ? tr('autoStopping')
        : `${tr('autoStop')} ${current}/${autoPlay.total}`;
      ui.autoPlay.disabled = autoPlay.stopRequested;
      return;
    }

    if (Number.isInteger(autoPlay.selected) && autoPlay.selected > 0) {
      ui.autoPlay.textContent = `${tr('autoStart')} ${autoPlay.selected}`;
      ui.autoPlay.disabled = !available;
      return;
    }

    ui.autoPlay.textContent = tr('autoPlay');
    ui.autoPlay.disabled = !available;
  }

  function finishAutoPlay() {
    clearAutoTimers();
    autoPlay.active = false;
    autoPlay.stopRequested = false;
    autoPlay.selected = null;
    autoPlay.total = 0;
    autoPlay.completed = 0;
    autoPlay.remaining = 0;
    autoPlay.fixedStake = null;
    closeAutoMenu();
    renderState();
  }

  function requestAutoStop() {
    if (!autoPlay.active) return;

    autoPlay.stopRequested = true;
    closeAutoMenu();

    // Between rounds no ticket is in motion, so stop immediately.
    if (['idle','settled'].includes(state)) {
      finishAutoPlay();
      return;
    }

    // If a ticket is already requesting / ready / throwing,
    // let that purchased/current round finish and then stop.
    renderAutoPlayButton();
  }

  function scheduleAutoThrow() {
    if (!autoPlay.active || state !== 'ready') return;

    if (autoPlay.throwTimer) clearTimeout(autoPlay.throwTimer);
    const delay = Math.max(0, Number(CFG.autoPlayThrowDelayMs ?? 450));

    autoPlay.throwTimer = setTimeout(() => {
      autoPlay.throwTimer = null;
      if (autoPlay.active && state === 'ready') {
        startThrow();
      }
    }, delay);
  }

  function scheduleNextAutoRound() {
    if (!autoPlay.active || autoPlay.stopRequested || autoPlay.remaining <= 0) {
      finishAutoPlay();
      return;
    }

    if (autoPlay.nextTimer) clearTimeout(autoPlay.nextTimer);
    const delay = Math.max(0, Number(CFG.autoPlayNextRoundDelayMs ?? 900));

    autoPlay.nextTimer = setTimeout(() => {
      autoPlay.nextTimer = null;
      if (!autoPlay.active || autoPlay.stopRequested) {
        finishAutoPlay();
        return;
      }
      if (['idle','settled'].includes(state)) requestNewGame();
    }, delay);
  }

  function handleAutoRoundComplete() {
    if (!autoPlay.active) return;

    autoPlay.completed += 1;
    autoPlay.remaining = Math.max(0, autoPlay.total - autoPlay.completed);

    if (autoPlay.stopRequested || autoPlay.remaining <= 0) {
      finishAutoPlay();
      return;
    }

    renderAutoPlayButton();
    scheduleNextAutoRound();
  }

  function startAutoPlay(count) {
    const total = Number(count);
    if (
      autoPlay.active ||
      !['idle','settled'].includes(state) ||
      !configuredAutoPlayCounts().includes(total)
    ) return;

    clearAutoTimers();
    closeAutoMenu();

    autoPlay.active = true;
    autoPlay.stopRequested = false;
    autoPlay.selected = null;
    autoPlay.total = total;
    autoPlay.completed = 0;
    autoPlay.remaining = total;
    autoPlay.fixedStake = Number(stake);

    renderState();

    autoPlay.nextTimer = setTimeout(() => {
      autoPlay.nextTimer = null;
      if (autoPlay.active && ['idle','settled'].includes(state)) {
        requestNewGame();
      }
    }, 120);
  }

  function renderState() {
    if (!ui.action) return;
    let label = tr('loading');
    let disabled = false;

    switch (state) {
      case 'idle':
      case 'settled': label = tr('newGame'); break;
      case 'requesting': label = tr('loading'); disabled = true; break;
      case 'ready': label = tr('makeThrow'); break;
      case 'throwing': label = tr('throwing'); disabled = true; break;
      case 'loading': label = tr('loading'); disabled = true; break;
      case 'error': label = tr('retry'); break;
      default: disabled = true;
    }

    ui.action.textContent = label;
    ui.action.disabled = disabled || autoPlay.active;
    renderDenominationButtons();
    renderModeSwitch();
    renderAutoPlayButton();
    renderAudioControls();
    renderTicketNumber();
    renderScore();
    syncAudioWithState();
  }

  function showStatus(text = '') {
    ui.status.textContent = text;
  }

  function showResult() {
    if (!ticket) return;
    resultVisible = true;
    const win = Number(ticket.win || 0);
    ui.toast.textContent = win > 0
      ? `${round?.khanOut ? tr('khanOut') + ' · ' : ''}${tr('win')}: ${money(win)} ${currencyDisplay}`
      : tr('noWin');
    ui.toast.classList.add('show');
  }

  function hideResult() {
    resultVisible = false;
    ui.toast.classList.remove('show');
  }

  function hashString(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seeded(seed) {
    let a = hashString(seed) || 1;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function scenarioPlan(scenario) {
    const item = window.X2ChukoScenarioConfig?.getOrDefault(scenario);
    if (!item) {
      throw new Error('Scenario config is not loaded');
    }
    return {
      regular: Number(item.regular || 0),
      khan: Boolean(item.khan)
    };
  }

  function applyVisualTuning() {
    const t = V.tuning || {};
    const toast = ui.toast;
    if (!toast) return;

    const top = Math.max(0, Math.min(100, Number(t.resultPopupTop ?? 65)));
    const width = Math.max(20, Math.min(96, Number(t.resultPopupWidth ?? 60)));
    const height = Math.max(36, Number(t.resultPopupHeight ?? 58));
    const fontSize = Math.max(10, Number(t.resultPopupFontSize ?? 23));
    const radius = Math.max(0, Number(t.resultPopupRadius ?? 18));

    // Center horizontally; all geometry now comes from visual-config.js.
    toast.style.left = '50%';
    toast.style.right = 'auto';
    toast.style.top = `${top}%`;
    toast.style.width = `${width}%`;
    toast.style.minHeight = `${height}px`;
    toast.style.fontSize = `${fontSize}px`;
    toast.style.borderRadius = `${radius}px`;
    toast.style.transform = 'translateX(-50%)';
  }

  async function initPixi() {
    app = new PIXI.Application();
    await app.init({
      width: V.designWidth,
      height: V.designHeight,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      preference: 'webgl'
    });
    app.canvas.style.width = '100%';
    app.canvas.style.height = '100%';
    ui.host.appendChild(app.canvas);

    fieldLayer = new PIXI.Container();
    pieceLayer = new PIXI.Container();
    outLayer = new PIXI.Container();
    fxLayer = new PIXI.Container();

    // outLayer sits above live pieces but below temporary effects.
    app.stage.addChild(fieldLayer, pieceLayer, outLayer, fxLayer);

    // Selected trajectory guide, restored from old v11 UX.
    aimGuide = new PIXI.Graphics();
    fxLayer.addChild(aimGuide);

    const allAssets = [V.fieldAsset, ...V.assets.chuko, ...V.assets.khan, ...V.assets.saka];

    // Embedded data:image assets must not go through fetch().
    const embedded = allAssets.filter(isEmbeddedAsset);
    const external = allAssets.filter(src => !isEmbeddedAsset(src));

    if (embedded.length) {
      await Promise.all(embedded.map(preloadEmbeddedTexture));
    }

    if (external.length) {
      await PIXI.Assets.load(external);
    }

    fieldSprite = new PIXI.Sprite(textureFor(V.fieldAsset));
    fieldSprite.anchor.set(0.5);
    fieldSprite.position.set(V.field.x, V.field.y);
    fieldSprite.width = V.field.width;
    fieldSprite.height = V.field.height;
    fieldLayer.addChild(fieldSprite);

    // No rectangular field plate: clip the replaceable field to its own oval silhouette.
    // This belongs to the field layer and remains independent from page background/UI.
    fieldMask = new PIXI.Graphics();
    fieldMask
      .ellipse(
        V.field.x,
        V.field.y + (V.field.maskOffsetY || 0),
        V.field.maskRadiusX || V.field.width * 0.49,
        V.field.maskRadiusY || V.field.height * 0.46
      )
      .fill({ color: 0xffffff, alpha: 1 });
    fieldLayer.addChild(fieldMask);
    fieldSprite.mask = fieldMask;

    // Subtle halo belongs to the field layer, not UI/background.
    const halo = new PIXI.Graphics();
    halo.ellipse(V.field.x, V.field.y - 4, V.field.width * 0.47, V.field.height * 0.43)
      .stroke({ color: 0x5c9fe4, alpha: 0.09, width: 3 });
    fieldLayer.addChildAt(halo, 0);

    engine = Engine.create({ enableSleeping: false });
    engine.gravity.x = 0;
    engine.gravity.y = 0;
    engine.gravity.scale = 0;

    Events.on(engine, 'collisionStart', onCollisionStart);

    resetBoard('BOOT');

    app.ticker.add((ticker) => {
      const ms = Math.min(50, ticker.deltaMS || 16.6667);
      const now = performance.now();

      physicsAccumulator += ms;
      while (physicsAccumulator >= V.physics.fixedStepMs) {
        Engine.update(engine, V.physics.fixedStepMs);
        afterPhysicsStep();
        physicsAccumulator -= V.physics.fixedStepMs;
      }

      enforceTargetEscape(now);
      drawAimGuide();
      syncSprites();
      updateRound(now);
      updateBursts(ms);
    });

    bindPointer();
  }

  function clearBodiesAndSprites() {
    if (engine) Composite.clear(engine.world, false, true);

    if (pieceLayer) {
      pieceLayer.removeChildren().forEach(x => x.destroy?.());
    }

    // Knocked pieces live here for the whole settled round.
    // This layer is cleared only because clearBodiesAndSprites() is called
    // by resetBoard(), i.e. when a NEW game/ticket is being prepared.
    if (outLayer) {
      outLayer.removeChildren().forEach(x => x.destroy?.());
    }

    if (fxLayer) {
      fxLayer.children
        .filter(x => x !== aimGuide)
        .forEach(x => {
          fxLayer.removeChild(x);
          x.destroy?.();
        });
    }

    if (aimGuide && !aimGuide.destroyed) {
      aimGuide.clear();
    }

    bursts = [];
    chuko = [];
    khan = null;
    saka = null;
  }

  function makePieceBody(x, y, r, label) {
    return Bodies.circle(x, y, r, {
      label,
      friction: 0.045,
      frictionStatic: 0.03,
      frictionAir: V.physics.frictionAir,
      restitution: V.physics.restitution,
      density: label === 'khan' ? 0.0043 : 0.0036
    });
  }

  function makeSprite(path, size) {
    const s = new PIXI.Sprite(textureFor(path));
    s.anchor.set(0.5);
    s.width = size;
    s.height = size;
    return s;
  }

  function resetBoard(seedValue) {
    if (!engine || !pieceLayer) return;
    clearBodiesAndSprites();

    const rng = seeded(seedValue || 'CHUKO');
    const cx = V.field.x;
    const cy = V.field.y;
    // Compact v19-style pile, but centers are separated enough for Matter.js
    // so the pieces do not self-explode before SAKA reaches them.
    const basePositions = [
      [-84,-60],[-28,-72],[28,-72],[84,-60],
      [-102,-5],[-48,-4],[48,-4],[102,-5],
      [-84,54],[-28,64],[28,64],[84,54]
    ];

    const requestedCount = Math.max(
      1,
      Math.min(24, Math.round(V.tuning?.chukoCount ?? 12))
    );
    const pileSpread = Math.max(
      0.55,
      Math.min(1.55, Number(V.tuning?.pileSpread ?? 1))
    );

    let positions;

    if (requestedCount === 12) {
      // Текущая одобренная раскладка остаётся пиксель-в-пиксель той же.
      positions = basePositions.map(([x,y]) => [x*pileSpread, y*pileSpread]);
    } else {
      // Для другого количества строим компактную детерминированную "кучу".
      // При возврате chukoCount=12 снова используется исходная раскладка выше.
      positions = [];
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      for (let i=0; i<requestedCount; i++) {
        const t = requestedCount === 1 ? 0 : i / (requestedCount - 1);
        const radius = (24 + 92 * Math.sqrt(t)) * pileSpread;
        const angle = i * goldenAngle - Math.PI/2;
        positions.push([
          Math.cos(angle) * radius,
          Math.sin(angle) * radius * 0.78
        ]);
      }
    }

    const khanBody = makePieceBody(cx + (rng()-.5)*4, cy + 2 + (rng()-.5)*4, V.pieces.khanRadius, 'khan');
    Body.setAngle(khanBody, (rng()-.5)*0.45);
    const khanSprite = makeSprite(V.assets.khan[Math.floor(rng()*V.assets.khan.length)], V.pieces.khanSpriteSize);
    khan = { body:khanBody, sprite:khanSprite, target:false, out:false, launched:false, detached:false, finalOutX:null, finalOutY:null, finalOutAngle:null, outDistance:null, id:'khan' };
    Composite.add(engine.world, khanBody);
    pieceLayer.addChild(khanSprite);

    positions.forEach((pos, i) => {
      const x = cx + pos[0] + (rng()-.5)*6;
      const y = cy + pos[1] + (rng()-.5)*6;
      const body = makePieceBody(x, y, V.pieces.regularRadius, `chuko-${i}`);
      Body.setAngle(body, (rng()-.5)*0.75);
      const sprite = makeSprite(V.assets.chuko[Math.floor(rng()*V.assets.chuko.length)], V.pieces.regularSpriteSize);
      const p = { body, sprite, target:false, out:false, launched:false, escapeBoosted:false, detached:false, finalOutX:null, finalOutY:null, finalOutAngle:null, outDistance:null, id:i };
      chuko.push(p);
      Composite.add(engine.world, body);
      pieceLayer.addChild(sprite);
    });

    const sakaBody = Bodies.circle(V.sakaStart.x, V.sakaStart.y, V.pieces.sakaRadius, {
      label: 'saka', friction:0.04, frictionAir:V.physics.sakaFrictionAir, restitution:V.physics.sakaRestitution, density:0.006
    });
    const sakaSprite = makeSprite(V.assets.saka[Math.floor(rng()*V.assets.saka.length)], V.pieces.sakaSpriteSize);
    saka = { body:sakaBody, sprite:sakaSprite };
    Composite.add(engine.world, sakaBody);
    pieceLayer.addChild(sakaSprite);

    round = {
      active:false,
      impact:false,
      impactAt:0,
      khanImpulseAt:0,
      startedAt:0,
      settleAt:0,
      knocked:0,
      khanOut:false,
      plan:{regular:0,khan:false},
      targetIds:[],
      seed:seedValue
    };
    renderScore();
    syncSprites();
  }

  function prepareTicketBoard(data) {
    const seedValue = `${data.ticketId}|${data.scenario}`;
    resetBoard(seedValue);
    const rng = seeded(seedValue);
    const plan = scenarioPlan(data.scenario);
    round.plan = plan;
    const ids = shuffle(chuko.map(p => p.id), rng).slice(0, plan.regular);
    round.targetIds = ids;
    chuko.forEach(p => p.target = ids.includes(p.id));
    khan.target = plan.khan;
  }

  function clampSpeed(body) {
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    if (speed > V.physics.maxSpeed) {
      const k = V.physics.maxSpeed / speed;
      Body.setVelocity(body, { x:body.velocity.x*k, y:body.velocity.y*k });
    }
  }

  function afterPhysicsStep() {
    if (!round || !saka) return;
    clampSpeed(saka.body);
    chuko.forEach(p => clampSpeed(p.body));
    if (khan) clampSpeed(khan.body);

    const inner = V.field.innerRadius;
    const cx = V.field.x;
    const cy = V.field.y;

    for (const p of [...chuko, khan].filter(Boolean)) {
      const dx = p.body.position.x - cx;
      const dy = p.body.position.y - cy;
      const d = Math.hypot(dx, dy) || 1;

      if (!round.active || !p.target) {
        const limit = inner - (p.id === 'khan' ? 26 : 20);
        if (d > limit) {
          const nx = dx/d, ny = dy/d;
          Body.setPosition(p.body, {x:cx+nx*limit, y:cy+ny*limit});
          const radial = p.body.velocity.x*nx + p.body.velocity.y*ny;
          if (radial > 0) {
            Body.setVelocity(p.body, {x:p.body.velocity.x - nx*radial*1.45, y:p.body.velocity.y - ny*radial*1.45});
          }
        }
      }
    }
  }

  function markOut(p, nx, ny) {
    if (p.out) return;

    const finalX = p.body.position.x;
    const finalY = p.body.position.y;
    const finalAngle = p.body.angle;

    p.out = true;
    p.finalOutX = finalX;
    p.finalOutY = finalY;
    p.finalOutAngle = finalAngle;

    Body.setVelocity(p.body, { x:0, y:0 });
    Body.setAngularVelocity(p.body, 0);

    if (!p.detached) {
      Composite.remove(engine.world, p.body);
      p.detached = true;
    }

    if (p.sprite) {
      // Critical: move knocked sprite out of the live-piece layer.
      // From now until resetBoard(), no live-piece logic can touch/destroy it.
      if (p.sprite.parent !== outLayer) {
        p.sprite.parent?.removeChild(p.sprite);
        outLayer.addChild(p.sprite);
      }

      p.sprite.position.set(finalX, finalY);
      p.sprite.rotation = finalAngle;
      p.sprite.visible = true;
      p.sprite.alpha = 1;
      p.sprite.eventMode = 'none';
    }

    if (p.id === 'khan') round.khanOut = true;
    else round.knocked += 1;

    spawnBurst(finalX, finalY, p.id === 'khan');
    renderScore();
  }

  function enforceTargetEscape(now) {
    if (!round?.impact) return;

    chuko.forEach((p, i) => {
      if (!p.target || p.out || !p.launched) return;

      const dx = p.body.position.x - V.field.x;
      const dy = p.body.position.y - V.field.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      const minD = Number(V.tuning.chukoEjectDistanceMin ?? 84);
      const maxD = Math.max(minD, Number(V.tuning.chukoEjectDistanceMax ?? 132));
      const outDistance = Number.isFinite(p.outDistance)
        ? p.outDistance
        : minD;
      const freezeR = V.field.innerRadius + Math.min(maxD, Math.max(minD, outDistance));

      // Если выбитый чүкө потерял энергию до своей выбранной дистанции,
      // один раз мягко поддерживаем движение наружу.
      if (
        now - round.impactAt > 300 &&
        dist < freezeR &&
        !p.escapeBoosted
      ) {
        const rng = seeded(`${round.seed}|escape-${i}`);
        const tangentX = -ny;
        const tangentY = nx;
        const outward = 15.2 + rng() * 2.8;
        const tangent = (rng() - .5) * 3.4;

        Body.setVelocity(p.body, {
          x: nx * outward + tangentX * tangent,
          y: ny * outward + tangentY * tangent
        });
        Body.setAngularVelocity(p.body, (rng() - .5) * .48);
        p.escapeBoosted = true;
      }

      if (dist >= freezeR) {
        markOut(p, nx, ny);
      }
    });

    if (khan?.target && !khan.out && khan.launched) {
      const dx = khan.body.position.x - V.field.x;
      const dy = khan.body.position.y - V.field.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      const minD = Number(V.tuning.khanEjectDistanceMin ?? 92);
      const maxD = Math.max(minD, Number(V.tuning.khanEjectDistanceMax ?? 144));
      const outDistance = Number.isFinite(khan.outDistance)
        ? khan.outDistance
        : minD;
      const freezeR = V.field.innerRadius + Math.min(maxD, Math.max(minD, outDistance));

      // ХАН идёт наружу непрерывно, без паузы на ободе.
      if (dist < freezeR) {
        const vx = khan.body.velocity.x;
        const vy = khan.body.velocity.y;
        const radial = vx * nx + vy * ny;
        const minRadial = Number(V.tuning.khanMinOutwardSpeed ?? 12.8);

        if (radial < minRadial) {
          const add = minRadial - radial;
          Body.setVelocity(khan.body, {
            x: vx + nx * add,
            y: vy + ny * add
          });
        }
      }

      if (dist >= freezeR) {
        markOut(khan, nx, ny);
      }
    }
  }

  function drawAimGuide() {
    if (!fxLayer) return;

    if (!aimGuide || aimGuide.destroyed) {
      aimGuide = new PIXI.Graphics();
      fxLayer.addChild(aimGuide);
    }

    aimGuide.clear();

    if (state !== 'ready' || !drag?.active || !drag.p || !saka) return;

    const dx = V.sakaStart.x - drag.p.x;
    const dy = V.sakaStart.y - drag.p.y;
    const len = Math.hypot(dx, dy);
    if (len < 6) return;

    const ux = dx / len;
    const uy = dy / len;
    const power = Math.min(1, len / 115);

    // Same visual principle as v11: dashed line in the chosen launch direction.
    const startX = V.sakaStart.x;
    const startY = V.sakaStart.y - 46;
    const guideLen = 68 + power * 92;

    const dash = 15;
    const gap = 10;

    for (let d = 0; d < guideLen; d += dash + gap) {
      const d2 = Math.min(guideLen, d + dash);

      aimGuide
        .moveTo(startX + ux * d, startY + uy * d)
        .lineTo(startX + ux * d2, startY + uy * d2);
    }

    aimGuide.stroke({
      color: 0xffffff,
      alpha: 0.78,
      width: 5,
      cap: 'round'
    });

    // Small luminous endpoint makes the selected direction easier to read.
    aimGuide
      .circle(startX + ux * guideLen, startY + uy * guideLen, 5.5)
      .fill({ color: 0xdbe63c, alpha: 0.92 });
  }

  function syncSprites() {
    for (const p of chuko) {
      if (!p?.sprite) continue;

      if (p.out || p.detached || p.sprite.parent === outLayer) {
        // outLayer sprite is immutable until next resetBoard().
        continue;
      }

      p.sprite.position.set(
        p.body.position.x,
        p.body.position.y
      );
      p.sprite.rotation = p.body.angle;
    }

    if (khan?.sprite) {
      if (!(khan.out || khan.detached || khan.sprite.parent === outLayer)) {
        khan.sprite.position.set(
          khan.body.position.x,
          khan.body.position.y
        );
        khan.sprite.rotation = khan.body.angle;
      }
    }

    if (saka?.sprite) {
      saka.sprite.position.set(
        saka.body.position.x,
        saka.body.position.y
      );
      saka.sprite.rotation = saka.body.angle;
    }
  }

  function onCollisionStart(event) {
    if (!round?.active || round.impact) return;
    for (const pair of event.pairs) {
      const a = pair.bodyA.label;
      const b = pair.bodyB.label;
      if ((a === 'saka' && (b === 'khan' || b.startsWith('chuko-'))) || (b === 'saka' && (a === 'khan' || a.startsWith('chuko-')))) {
        triggerScenarioImpact(performance.now());
        break;
      }
    }
  }

  function triggerScenarioImpact(now) {
    if (!round || round.impact) return;

    round.impact = true;
    round.impactAt = now;

    const rng = seeded(`${round.seed}|impact-v209`);
    const sx = saka?.body?.position?.x ?? V.field.x;
    const sy = saka?.body?.position?.y ?? (V.field.y + 140);

    const svx = saka?.body?.velocity?.x || 0;
    const svy = saka?.body?.velocity?.y || -1;
    const sLen = Math.hypot(svx, svy) || 1;
    const dirX = svx / sLen;
    const dirY = svy / sLen;

    const boost = V.tuning.impactBoost || 1.22;
    const scatter = V.tuning.scatterSpeed || 7.2;
    const tangentBase = V.tuning.scatterTangential || 2.7;
    const eject = V.tuning.chukoEjectSpeed || 16.6;
    const ejectTangential = V.tuning.chukoEjectTangential || 3.4;

    chuko.forEach((p, i) => {
      if (p.out) return;

      const px = p.body.position.x;
      const py = p.body.position.y;

      let rx = px - V.field.x;
      let ry = py - V.field.y;
      let rLen = Math.hypot(rx, ry) || 1;
      rx /= rLen; ry /= rLen;

      const tx = -ry;
      const ty = rx;
      const tangentSign = rng() > .5 ? 1 : -1;

      const dx = px - sx;
      const dy = py - sy;
      const distToSaka = Math.hypot(dx, dy);
      const proximity = Math.max(.78, Math.min(1.25, 1.22 - distToSaka / 700));

      const forward = scatter * (.32 + rng() * .26) * proximity * boost;
      const radial = scatter * (.66 + rng() * .52) * proximity;
      const tangent = tangentBase * (.35 + rng() * .95) * tangentSign;

      if (p.target) {
        const outSpeed = eject * (.96 + rng() * .24);
        const tangential = ejectTangential * (rng() - .5) * 2;

        // From this moment this piece is allowed to cross the rim.
        p.launched = true;

        // Своя дальность вылета для каждого выбитого чүкө.
        // Детерминировано seed'ом билета, поэтому replay остаётся стабильным.
        if (!Number.isFinite(p.outDistance)) {
          const minD = Number(V.tuning.chukoEjectDistanceMin ?? 84);
          const maxD = Math.max(minD, Number(V.tuning.chukoEjectDistanceMax ?? 132));
          p.outDistance = minD + rng() * (maxD - minD);
        }

        Body.setVelocity(p.body, {
          x: rx * outSpeed + tx * tangential + dirX * 1.7,
          y: ry * outSpeed + ty * tangential + dirY * 1.7
        });
        Body.setAngularVelocity(p.body, (rng() - .5) * .52 + tangentSign * .08);
      } else {
        const current = p.body.velocity;
        Body.setVelocity(p.body, {
          x: current.x * .18 + dirX * forward + rx * radial + tx * tangent,
          y: current.y * .18 + dirY * forward + ry * radial + ty * tangent
        });
        Body.setAngularVelocity(p.body, (rng() - .5) * .38 + tangentSign * .05);
      }
    });

    if (khan && !khan.out) {
      let rx = khan.body.position.x - V.field.x;
      let ry = khan.body.position.y - V.field.y;
      let rLen = Math.hypot(rx, ry);

      // KHAN normally starts near the center. For a winning KHAN scenario,
      // choose a stable outward direction immediately so it moves together
      // with the rest of the pile from the very same impact frame.
      if (khan.target && rLen < 25) {
        const angle = -Math.PI * (.22 + rng() * .16);
        rx = Math.cos(angle);
        ry = Math.sin(angle);
        rLen = 1;
      } else {
        rLen = rLen || 1;
        rx /= rLen;
        ry /= rLen;
      }

      const tx = -ry;
      const ty = rx;

      if (khan.target) {
        const speed = V.tuning.khanEjectSpeed || 16.8;
        const tangent = (rng() - .5) * 3.0;

        khan.launched = true;

        if (!Number.isFinite(khan.outDistance)) {
          const minD = Number(V.tuning.khanEjectDistanceMin ?? 92);
          const maxD = Math.max(minD, Number(V.tuning.khanEjectDistanceMax ?? 144));
          khan.outDistance = minD + rng() * (maxD - minD);
        }

        Body.setVelocity(khan.body, {
          x: rx * speed + tx * tangent + dirX * 1.2,
          y: ry * speed + ty * tangent + dirY * 1.2
        });
        Body.setAngularVelocity(
          khan.body,
          (rng() - .5) * .22
        );
      } else {
        const tangent = (rng() - .5) * 2.1;
        const speed = (V.tuning.khanScatterSpeed || 5.1) * (.78 + rng() * .28);

        Body.setVelocity(khan.body, {
          x: rx * speed + tx * tangent + dirX,
          y: ry * speed + ty * tangent + dirY
        });
        Body.setAngularVelocity(
          khan.body,
          (rng() - .5) * .28
        );
      }
    }

    if (saka?.body) {
      const rebound = V.tuning.sakaRebound || .34;
      const side = V.tuning.sakaReboundSide || 2.4;

      Body.setVelocity(saka.body, {
        x: -svx * rebound + (rng() - .5) * side,
        y: -svy * rebound * .72 + 1.1
      });
      Body.setAngularVelocity(
        saka.body,
        saka.body.angularVelocity + (rng() - .5) * .38
      );
    }

    if (round.plan.khan) {
      // KHAN already received its winning ejection impulse above,
      // in the same impact pass as the regular chuko.
      round.khanImpulseAt = 0;
    }
  }

  function launchKhan() {
    if (!khan || khan.out || khan.launched || !round?.plan?.khan) return;

    const rng = seeded(`${round.seed}|khan-v209`);

    let rx = khan.body.position.x - V.field.x;
    let ry = khan.body.position.y - V.field.y;
    let len = Math.hypot(rx, ry);

    if (len < 25) {
      const angle = -Math.PI * (.22 + rng() * .16);
      rx = Math.cos(angle);
      ry = Math.sin(angle);
      len = 1;
    }

    rx /= len; ry /= len;
    const tx = -ry, ty = rx;

    const speed = V.tuning.khanEjectSpeed || 16.8;
    const tangent = (rng() - .5) * 3.0;

    Body.setVelocity(khan.body, {
      x: rx * speed + tx * tangent,
      y: ry * speed + ty * tangent
    });
    Body.setAngularVelocity(khan.body, (rng() - .5) * .22);

    khan.launched = true;
    round.khanImpulseAt = 0;
  }

  function forceTargetsOut() {
    const targets = chuko.filter(p => p.target && !p.out);

    targets.forEach((p, i) => {
      const dx = p.body.position.x - V.field.x;
      const dy = p.body.position.y - V.field.y;
      const d = Math.hypot(dx, dy);

      let nx, ny;
      if (d > 10) {
        nx = dx / d;
        ny = dy / d;
      } else {
        const angle = -Math.PI*0.9 + (i+1)/(targets.length+1)*Math.PI*1.8;
        nx = Math.cos(angle);
        ny = Math.sin(angle);
      }

      const fallbackR = V.field.innerRadius + (
        Number.isFinite(p.outDistance)
          ? p.outDistance
          : Number(V.tuning.chukoEjectDistanceMin ?? 84)
      );
      Body.setPosition(p.body, {
        x: V.field.x + nx * fallbackR,
        y: V.field.y + ny * fallbackR
      });

      markOut(p, nx, ny);
    });

    if (round.plan.khan && khan && !khan.out) {
      let dx = khan.body.position.x - V.field.x;
      let dy = khan.body.position.y - V.field.y;
      let d = Math.hypot(dx, dy);

      let nx = .72, ny = -.69;
      if (d > 10) {
        nx = dx/d;
        ny = dy/d;
      }

      const fallbackR = V.field.innerRadius + (
        Number.isFinite(khan.outDistance)
          ? khan.outDistance
          : Number(V.tuning.khanEjectDistanceMin ?? 92)
      );
      Body.setPosition(khan.body, {
        x: V.field.x + nx * fallbackR,
        y: V.field.y + ny * fallbackR
      });

      markOut(khan, nx, ny);
    }
  }

  function updateRound(now) {
    if (!round?.active) return;

    if (!round.impact && now - round.startedAt > 640) triggerScenarioImpact(now);
    if (round.khanImpulseAt && now >= round.khanImpulseAt) launchKhan();

    const expectedRegular = round.plan.regular;
    const expectedKhan = round.plan.khan;
    const allDone = round.knocked >= expectedRegular && (!expectedKhan || round.khanOut);
    const minDuration = expectedKhan ? 1500 : 1050;

    if (!round.settleAt && allDone && now - round.startedAt >= minDuration) {
      round.settleAt = now + 320;
    }

    if (!round.settleAt && now - round.startedAt > (expectedKhan ? 2450 : 1900)) {
      forceTargetsOut();
      round.settleAt = now + 280;
    }

    if (round.settleAt && now >= round.settleAt) finalizeRound();
  }

  function spawnBurst(x, y, gold=false) {
    const g = new PIXI.Graphics();
    fxLayer.addChild(g);
    const bits = [];
    const rng = seeded(`${round?.seed}|burst|${x}|${y}`);
    for (let i=0;i<12;i++) {
      const angle = rng()*Math.PI*2;
      const speed = 1.2+rng()*3.5;
      bits.push({x:0,y:0,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:2+rng()*3,life:1});
    }
    bursts.push({g,x,y,bits,gold,age:0});
  }

  function updateBursts(ms) {
    for (let i=bursts.length-1;i>=0;i--) {
      const b=bursts[i]; b.age += ms;
      const t=Math.min(1,b.age/650);
      b.g.clear();
      b.bits.forEach(bit=>{
        bit.x += bit.vx*(ms/16.67); bit.y += bit.vy*(ms/16.67); bit.vy += .04*(ms/16.67);
        b.g.circle(b.x+bit.x,b.y+bit.y,bit.r*(1-t*.4)).fill({color:b.gold?0xffd45d:0xffffff,alpha:1-t});
      });
      if(t>=1){b.g.destroy();bursts.splice(i,1)}
    }
  }

  function pointerToDesign(e) {
    const r = app.canvas.getBoundingClientRect();
    return {x:(e.clientX-r.left)/r.width*V.designWidth, y:(e.clientY-r.top)/r.height*V.designHeight};
  }

  function bindPointer() {
    app.canvas.addEventListener('pointerdown', e => {
      if (state !== 'ready' || !saka) return;
      const p = pointerToDesign(e);
      const d = Math.hypot(p.x-saka.body.position.x,p.y-saka.body.position.y);
      if (d > 125) return;
      app.canvas.setPointerCapture?.(e.pointerId);
      drag={active:true,id:e.pointerId,p};
      Body.setVelocity(saka.body,{x:0,y:0});
    });

    app.canvas.addEventListener('pointermove', e => {
      if (!drag?.active || drag.id !== e.pointerId || state !== 'ready') return;
      const p=pointerToDesign(e); drag.p=p;
      const dx=p.x-V.sakaStart.x, dy=p.y-V.sakaStart.y;
      const len=Math.hypot(dx,dy)||1, max=115, k=Math.min(1,max/len);
      const x=V.sakaStart.x+dx*k, y=V.sakaStart.y+Math.max(-20,dy*k);
      Body.setPosition(saka.body,{x,y});
      Body.setAngle(saka.body, dx*0.003);
    });

    const release = e => {
      if (!drag?.active || drag.id !== e.pointerId) return;
      const p=drag.p; drag=null;
      const dx=p.x-V.sakaStart.x, dy=Math.max(0,p.y-V.sakaStart.y);
      const power=Math.max(.72,Math.min(1.25,.78+Math.hypot(dx,dy)/165));
      startThrow({vx:-dx*.055,vy:-17.4*power});
    };
    app.canvas.addEventListener('pointerup',release);
    app.canvas.addEventListener('pointercancel',release);
  }

  function startThrow(velocity={vx:0,vy:-17.2}) {
    if (state !== 'ready' || !ticket || !saka) return;
    if (aimGuide && !aimGuide.destroyed) aimGuide.clear();
    hideResult();
    state='throwing';
    round.active=true;
    round.startedAt=performance.now();
    round.impact=false;
    round.settleAt=0;
    Body.setVelocity(saka.body,{x:velocity.vx,y:velocity.vy});
    Body.setAngularVelocity(saka.body, velocity.vx*.018 + .16);
    renderState();
  }

  async function refreshBalance() {
    state='loading'; renderState();
    try {
      if (gameMode === 'demo') {
        balance=demoBalance;
      } else {
        const data=await LMS.getBalance({currency});
        realBalance=Number(data.balance); balance=realBalance;
        if(data.currency) currency=String(data.currency).toUpperCase();
        if(data.currencyDisplay||data.currencyLabel||data.currencySymbol) currencyDisplay=String(data.currencyDisplay||data.currencyLabel||data.currencySymbol);
      }
      state='idle';
      renderBalance(); renderDenominationButtons({ centerActive:true }); renderState();
      LMS.emit('X2_GAME_BALANCE_LOADED',{gameId:GAME_ID,balance,currency,currencyDisplay,language,denominations:currentDenominations(),mode:gameMode});
    } catch(err) {
      console.error(err); state='error'; showStatus(tr('balanceError')); renderState();
      LMS.emit('X2_GAME_ERROR',{stage:'balance',code:err.code||'BALANCE_ERROR',message:err.message||String(err)});
    }
  }

  async function requestNewGame() {
    if (!['idle','settled'].includes(state)) return;
    if (autoPlay.active && Number.isFinite(autoPlay.fixedStake)) {
      stake = Number(autoPlay.fixedStake);
    }
    hideResult(); showStatus('');
    state='requesting'; renderState();
    try {
      const data = gameMode === 'demo'
        ? await LMS.createDemoTicket({gameId:GAME_ID,denomination:stake,currency,currencyDisplay,language,demoBalance})
        : await LMS.createTicket({gameId:GAME_ID,denomination:stake,currency,language});

      ticket=data;
      stake=Number(data.denomination ?? stake);
      if(data.currency) currency=String(data.currency).toUpperCase();
      if(data.currencyDisplay) currencyDisplay=String(data.currencyDisplay);
      pendingBalance=Number(data.balance);
      prepareTicketBoard(data);
      state='ready';
      renderBalance(); renderDenominationButtons(); renderState();
      LMS.emit('X2_GAME_TICKET_READY',{gameId:GAME_ID,ticketId:data.ticketId,scenario:data.scenario,denomination:stake,currency,currencyDisplay,language,mode:gameMode});
      if (autoPlay.active) scheduleAutoThrow();
    } catch(err) {
      console.error(err);
      state='idle';
      const code=err.code||'GAME_START_ERROR';
      showStatus(code==='INSUFFICIENT_FUNDS'?tr('insufficient'):code==='SESSION_EXPIRED'?tr('sessionEnded'):tr('startError'));
      if (autoPlay.active) {
        clearAutoTimers();
        autoPlay.active = false;
        autoPlay.stopRequested = false;
        autoPlay.total = 0;
        autoPlay.completed = 0;
        autoPlay.remaining = 0;
        autoPlay.fixedStake = null;
      }
      renderState();
      LMS.emit('X2_GAME_ERROR',{stage:'newGame',code,message:err.message||String(err)});
    }
  }

  function finalizeRound() {
    if (!round?.active || state !== 'throwing') return;
    round.active=false;
    forceTargetsOut();

    if (pendingBalance != null && Number.isFinite(pendingBalance)) {
      balance=pendingBalance;
      if(gameMode==='demo') demoBalance=pendingBalance; else realBalance=pendingBalance;
    }

    // Make persistence explicit at round end.
    if (outLayer) {
      for (const sprite of outLayer.children) {
        sprite.visible = true;
        sprite.alpha = 1;
      }
    }

    showResult();
    state='settled';
    renderBalance(); renderState(); renderScore();
    LMS.emit('X2_GAME_ROUND_COMPLETE',{
      gameId:GAME_ID,ticketId:ticket.ticketId,scenario:ticket.scenario,win:Number(ticket.win||0),balance,
      denomination:stake,currency,currencyDisplay,language,mode:gameMode
    });

    // Local convenience cache only. Full history remains in LMS personal account.
    saveCompletedTicketLocally(ticket, gameMode);

    handleAutoRoundComplete();
  }

  async function setMode(mode) {
    if(!demoAllowed || autoPlay.active || !['idle','settled'].includes(state)) return;
    const next=mode==='demo'?'demo':'real';
    if(next===gameMode) return;
    gameMode=next; autoPlay.selected=null; hideResult(); ticket=null; pendingBalance=null; resetBoard(`MODE-${next}`);
    LMS.emit('X2_GAME_MODE_CHANGED',{gameId:GAME_ID,mode:gameMode,currency,language,denomination:stake});
    await refreshBalance();
  }

  function bindUi() {
    // Browser audio starts only after a user gesture.
    document.addEventListener('pointerdown', unlockAudio, { once:true, capture:true });

    ui.sound?.addEventListener('click', e => {
      e.stopPropagation();
      toggleSound();
    });

    ui.music?.addEventListener('click', e => {
      e.stopPropagation();
      toggleMusic();
    });

    ui.action.addEventListener('click', () => {
      if (autoPlay.active) return;
      if(state==='ready') startThrow();
      else if(state==='idle'||state==='settled') requestNewGame();
      else if(state==='error') refreshBalance();
    });

    ui.autoPlay?.addEventListener('click', e => {
      e.stopPropagation();

      if (autoPlay.active) {
        requestAutoStop();
        return;
      }

      if (!['idle','settled'].includes(state)) return;

      // Step 2: selected amount is started only by this explicit click.
      if (Number.isInteger(autoPlay.selected) && autoPlay.selected > 0) {
        startAutoPlay(autoPlay.selected);
        return;
      }

      renderAutoPlayMenu();
      const open = !ui.autoMenu?.classList.contains('open');
      ui.autoMenu?.classList.toggle('open', open);
      ui.autoMenu?.setAttribute('aria-hidden', open ? 'false' : 'true');
    });

    ui.autoMenu?.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => closeAutoMenu());

    ui.deposit.addEventListener('click', () => LMS.emit('X2_GAME_DEPOSIT_REQUEST',{gameId:GAME_ID,mode:gameMode,currency,denomination:stake,language,balance}));

    const scrollDenominations = direction => {
      if (!ui.denomViewport) return;
      const option = ui.denomTrack?.querySelector('.denom-option');
      const step = (option?.offsetWidth || 54) + 6;
      ui.denomViewport.scrollBy({
        left: direction * step * 2,
        behavior: 'smooth'
      });
      setTimeout(updateDenominationArrows, 220);
    };

    ui.denomPrev?.addEventListener('click', () => scrollDenominations(-1));
    ui.denomNext?.addEventListener('click', () => scrollDenominations(1));
    ui.denomViewport?.addEventListener('scroll', updateDenominationArrows, { passive:true });
    window.addEventListener('resize', () => requestAnimationFrame(updateDenominationArrows));

    ui.modeSwitch.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));

    const closeInfoMenu = () => {
      ui.infoMenu?.classList.remove('open');
      ui.infoMenu?.setAttribute('aria-hidden','true');
      ui.info?.classList.remove('active');
    };

    const openHelp = () => {
      closeInfoMenu();
      ui.helpModal?.classList.add('open');
      ui.helpModal?.setAttribute('aria-hidden','false');
      LMS.emit('X2_GAME_HELP_REQUEST',{gameId:GAME_ID,language,mode:gameMode});
    };

    const closeHelp = () => {
      ui.helpModal?.classList.remove('open');
      ui.helpModal?.setAttribute('aria-hidden','true');
    };

    const openPayout = () => {
      closeInfoMenu();
      ui.payoutModal?.classList.add('open');
      ui.payoutModal?.setAttribute('aria-hidden','false');
    };

    const closePayout = () => {
      ui.payoutModal?.classList.remove('open');
      ui.payoutModal?.setAttribute('aria-hidden','true');
    };

    ui.info?.addEventListener('click', e => {
      e.stopPropagation();
      playUiTone();
      closeAutoMenu();

      const open = !ui.infoMenu?.classList.contains('open');
      ui.infoMenu?.classList.toggle('open', open);
      ui.infoMenu?.setAttribute('aria-hidden', open ? 'false' : 'true');
      ui.info?.classList.toggle('active', open);
    });

    ui.infoMenu?.addEventListener('click', e => e.stopPropagation());
    ui.infoPayout?.addEventListener('click', openPayout);
    ui.infoHow?.addEventListener('click', openHelp);
    ui.infoTickets?.addEventListener('click', () => {
      closeInfoMenu();
      renderLocalTicketHistory();
      ui.ticketsModal?.classList.add('open');
      ui.ticketsModal?.setAttribute('aria-hidden','false');
    });

    ui.helpClose?.addEventListener('click',closeHelp);
    ui.helpOk?.addEventListener('click',closeHelp);
    ui.helpModal?.addEventListener('click',e=>{ if(e.target===ui.helpModal) closeHelp(); });

    ui.payoutClose?.addEventListener('click',closePayout);
    ui.payoutOk?.addEventListener('click',closePayout);
    ui.payoutModal?.addEventListener('click',e=>{ if(e.target===ui.payoutModal) closePayout(); });

    const closeTickets = () => {
      ui.ticketsModal?.classList.remove('open');
      ui.ticketsModal?.setAttribute('aria-hidden','true');
    };

    ui.ticketsClose?.addEventListener('click',closeTickets);
    ui.ticketsOk?.addEventListener('click',closeTickets);
    ui.ticketsModal?.addEventListener('click',e=>{ if(e.target===ui.ticketsModal) closeTickets(); });

    document.addEventListener('click', closeInfoMenu);
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape') {
        closeInfoMenu();
        closeHelp();
        closePayout();
        closeTickets();
      }
    });
  }

  async function boot() {
    bindUi();
    state='loading'; renderState();
    try {
      applyVisualTuning();
      await initPixi();
      const settings=await LMS.getGameSettings();
      applySettings(settings);
      await refreshBalance();
      resetBoard('IDLE');
      window.X2ChukoV20 = {
        version:'20.33',
        renderer:'PixiJS',
        physics:'Matter.js',
        getState:()=>({state,gameMode,language,currency,currencyDisplay,stake,balance,ticket,scenario:ticket?.scenario,knocked:round?.knocked,khanOut:round?.khanOut}),
        replaceField:setFieldTexture,
        reloadBalance:refreshBalance
      };
    } catch(err) {
      console.error('[CHUKO v20.33 boot]',err);
      state='error'; showStatus('v20.33 boot error: '+(err.message||err)); renderState();
    }
  }

  boot();
})();
