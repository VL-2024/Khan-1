window.CHUKO_VISUAL = {
  designWidth: 941,
  designHeight: 1672,

  // ================================================================
  // ОСНОВНЫЕ НАСТРОЙКИ ИГРЫ — МЕНЯЕМ В ПЕРВУЮ ОЧЕРЕДЬ ЗДЕСЬ
  // ================================================================
  tuning: {
    // Сколько обычных чүкө лежит в круге.
    chukoCount: 12,

    // Плотность раскладки: 1.0 = текущая.
    // Меньше — куча плотнее, больше — свободнее.
    pileSpread: 1.0,

    // Насколько сильно реагирует вся куча на удар САКА.
    impactBoost: 1.22,
    scatterSpeed: 7.2,
    scatterTangential: 2.7,

    // Выбитые обычные чүкө.
    chukoEjectSpeed: 17.8,
    chukoEjectTangential: 3.4,

    // Дальность остановки ЗА кругом.
    // Каждый выбитый чүкө получает своё значение внутри диапазона.
    chukoEjectDistanceMin: 84,
    chukoEjectDistanceMax: 132,

    // ХАН — отдельные настройки.
    khanScatterSpeed: 5.1,
    khanEjectSpeed: 16.8,
    khanEjectDistanceMin: 92,
    khanEjectDistanceMax: 144,
    khanMinOutwardSpeed: 12.8,

    // Отскок САКА после контакта.
    sakaRebound: 0.34,
    sakaReboundSide: 2.4,

    // ------------------------------------------------------------
    // ВСПЛЫВАЮЩАЯ ПЛАШКА «ВЫИГРЫШ»
    // ------------------------------------------------------------

    // Положение сверху, % от игрового экрана.
    // Меньше число = выше, больше = ниже.
    resultPopupTop: 65,

    // Ширина плашки, % от игрового экрана.
    resultPopupWidth: 60,

    // Минимальная высота, px.
    resultPopupHeight: 58,

    // Размер текста, px.
    resultPopupFontSize: 23,

    // Скругление углов, px.
    resultPopupRadius: 18
  },

  // ================================================================
  // ГЕОМЕТРИЯ ПОЛЯ
  // ================================================================
  fieldAsset: 'assets/field-clean.webp',
  field: {
    x: 470.5,
    y: 690,
    width: 640,
    height: 544,
    innerRadius: 220,
    maskRadiusX: 314,
    maskRadiusY: 245,
    maskOffsetY: -10
  },

  sakaStart: { x: 470.5, y: 1132 },

  // ================================================================
  // РАЗМЕРЫ ОБЪЕКТОВ
  // ================================================================
  pieces: {
    regularRadius: 24,
    khanRadius: 29,
    sakaRadius: 42,
    regularSpriteSize: 130,
    khanSpriteSize: 146,
    sakaSpriteSize: 172
  },

  // ================================================================
  // ТЕХНИЧЕСКАЯ ФИЗИКА — обычно не трогаем
  // ================================================================
  physics: {
    fixedStepMs: 1000 / 60,
    frictionAir: 0.060,
    restitution: 0.70,
    sakaFrictionAir: 0.022,
    sakaRestitution: 0.62,
    maxSpeed: 32
  },

  assets: {
    chuko: [1,2,3,4,5,6].map(n => `assets/chuko_0${n}.webp`),
    khan: [1,2,3,4,5,6].map(n => `assets/khan_0${n}.webp`),
    saka: [1,2,3,4,5,6].map(n => `assets/saka_0${n}.webp`)
  }
};
