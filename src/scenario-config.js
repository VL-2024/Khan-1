/* ЧҮКӨ v20.26 — single source of truth for visual scenarios.
 *
 * IMPORTANT:
 * - This file tells the game HOW to visualize an LMS result.
 * - Real money win is NEVER calculated here; `win` remains LMS-authoritative.
 * - `demoMultiplier` is used only by standalone MOCK / DEMO for QA.
 *
 * To add a scenario:
 * 1. Add one object below with a new numeric id.
 * 2. LMS may then return that id in `scenario`.
 * No changes to game.js or lms-adapter.js should be required.
 */
(function (global) {
  'use strict';

  const scenarios = Object.freeze({
    1: Object.freeze({
      id: 1,
      key: 'ZERO',
      regular: 0,
      khan: false,
      demoMultiplier: 0
    }),

    2: Object.freeze({
      id: 2,
      key: 'ONE',
      regular: 1,
      khan: false,
      demoMultiplier: 1
    }),

    3: Object.freeze({
      id: 3,
      key: 'TWO',
      regular: 2,
      khan: false,
      demoMultiplier: 2
    }),

    4: Object.freeze({
      id: 4,
      key: 'FIVE',
      regular: 5,
      khan: false,
      demoMultiplier: 10
    }),

    5: Object.freeze({
      id: 5,
      key: 'FIVE_KHAN',
      regular: 5,
      khan: true,
      demoMultiplier: 50
    })
  });

  const ids = Object.freeze(
    Object.keys(scenarios)
      .map(Number)
      .filter(Number.isFinite)
      .sort((a,b) => a-b)
  );

  // DEMO / MOCK order is independent from numeric scenario IDs.
  // Add new scenario keys here only when you want them in the QA cycle.
  const demoOrder = Object.freeze([
    'ZERO',
    'ONE',
    'TWO',
    'FIVE',
    'FIVE_KHAN'
  ]);

  const byKey = Object.freeze(
    Object.fromEntries(
      ids.map(id => [scenarios[id].key, scenarios[id]])
    )
  );

  const demoIds = Object.freeze(
    demoOrder
      .map(key => byKey[key]?.id)
      .filter(id => Number.isFinite(id))
  );

  function normalizeId(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function has(value) {
    const id = normalizeId(value);
    return id !== null && Object.prototype.hasOwnProperty.call(scenarios, id);
  }

  function get(value) {
    const id = normalizeId(value);
    return has(id) ? scenarios[id] : null;
  }

  function getOrDefault(value) {
    return get(value) || scenarios[ids[0]];
  }

  function demoMultiplier(value) {
    const item = getOrDefault(value);
    return Number(item.demoMultiplier || 0);
  }

  global.X2_CHUKO_SCENARIOS = scenarios;

  global.X2ChukoScenarioConfig = Object.freeze({
    scenarios,
    ids,
    byKey,
    demoOrder,
    demoIds,
    has,
    get,
    getOrDefault,
    demoMultiplier
  });
})(window);
