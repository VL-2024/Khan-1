/* ЧҮКӨ v20 — runtime / LMS settings. */
window.X2_GAME_CONFIG = {
  gameId: 'CHUKO',

  denomination: 100,
  denominations: [25, 50, 100],

  language: 'RU',
  currency: 'KGS',
  currencyDisplay: 'сом',

  mode: 'real',
  demoAllowed: true,
  demoBalance: 10000,

  // Автоигра.
  // Количество игр, которое пользователь может выбрать.
  autoPlayCounts: [5, 10, 20, 50],

  // Пауза после получения билета перед автоматическим броском, мс.
  autoPlayThrowDelayMs: 450,

  // Сколько показывать результат перед следующей автоигрой, мс.
  autoPlayNextRoundDelayMs: 900,

  // Аудио. Пользователь может переключать звук/музыку в нижней панели.
  audio: {
    soundEnabled: true,
    musicEnabled: false,
    soundVolume: 0.22,
    musicVolume: 0.055
  },

  // Сколько последних завершённых билетов хранить локально в игре.
  // Полная история остаётся в личном кабинете LMS.
  localTicketHistoryLimit: 5,

  // GitHub / standalone demo. Production LMS => false.
  mock: true,

  apiBase: '',
  endpoints: {
    balance: '/api/lms/player/balance',
    newGame: '/api/lms/game/new'
  },

  initMode: 'postMessage',
  sessionMode: 'postMessage',
  sessionQueryParam: 'session',
  sessionHeader: 'X-Session-ID',

  parentOrigin: '*',
  allowedParentOrigins: ['*'],
  requestTimeoutMs: 10000
};
