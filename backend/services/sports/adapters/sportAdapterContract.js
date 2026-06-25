'use strict';

/**
 * Sport adapter contract for the future Sports Prediction Engine.
 *
 * This is a documentation-first contract in plain JavaScript. It does not
 * enforce inheritance today, but it establishes the interface that sport
 * adapters should follow.
 *
 * Each adapter should wrap provider-specific services and expose a stable
 * sport-oriented API to the generator layer.
 */
class SportAdapterContract {
  /**
   * Return a stable sport key such as `mlb`, `soccer`, `nba`, or `nfl`.
   *
   * @returns {string}
   */
  getSportKey() {
    throw new Error('getSportKey() must be implemented by the sport adapter.');
  }

  /**
   * Fetch games for a given date.
   *
   * @param {string} dateKey - Date in YYYY-MM-DD format.
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async getGamesByDate(dateKey, options = {}) {
    throw new Error('getGamesByDate() must be implemented by the sport adapter.');
  }

  /**
   * Fetch game markets / odds for a given date.
   *
   * @param {string} dateKey - Date in YYYY-MM-DD format.
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async getOddsByDate(dateKey, options = {}) {
    throw new Error('getOddsByDate() must be implemented by the sport adapter.');
  }

  /**
   * Fetch player props for a given date, if the sport supports them.
   *
   * @param {string} dateKey - Date in YYYY-MM-DD format.
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async getPlayerPropsByDate(dateKey, options = {}) {
    throw new Error('getPlayerPropsByDate() must be implemented by the sport adapter.');
  }

  /**
   * Normalize a provider-specific raw game into the engine's shared game shape.
   *
   * @param {object} rawGame
   * @returns {object}
   */
  normalizeGame(rawGame) {
    throw new Error('normalizeGame() must be implemented by the sport adapter.');
  }

  /**
   * Normalize a provider-specific raw market into the engine's shared candidate
   * shape.
   *
   * @param {object} rawMarket
   * @returns {object}
   */
  normalizeMarket(rawMarket) {
    throw new Error('normalizeMarket() must be implemented by the sport adapter.');
  }

  /**
   * Normalize a provider-specific raw player prop into the engine's shared
   * candidate shape.
   *
   * @param {object} rawProp
   * @returns {object}
   */
  normalizePlayerProp(rawProp) {
    throw new Error('normalizePlayerProp() must be implemented by the sport adapter.');
  }

  /**
   * Return the rules object(s) used by the sport.
   *
   * Expected shape example:
   * {
   *   applyCandidateRules,
   *   validateTicket,
   *   metadata
   * }
   *
   * @returns {object}
   */
  getRules() {
    throw new Error('getRules() must be implemented by the sport adapter.');
  }

  /**
   * Return the market keys supported by the adapter.
   *
   * @returns {string[]}
   */
  getSupportedMarkets() {
    throw new Error('getSupportedMarkets() must be implemented by the sport adapter.');
  }
}

module.exports = {
  SportAdapterContract,
};
