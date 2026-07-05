/**
 * ScoreboardView.jsx
 * Phase: React Migration v4 - Scoreboard Read-Only
 */
import { useEffect, useMemo, useState } from 'react';
import ViewState from '../components/ViewState';
import { getMlbScoreboard } from '../services/api';
import { asArray } from '../services/dataUtils';

const SCOREBOARD_TABS = [
  { key: 'live', label: 'En vivo' },
  { key: 'today', label: 'Hoy' },
  { key: 'upcoming', label: 'Próximos' },
  { key: 'recent', label: 'Recientes' },
];

const SCOREBOARD_TIME_ZONE = 'America/Mazatlan';
const SLATE_ONLY_EMPTY_COPY =
  'Este endpoint actualmente entrega el slate de hoy. Próximos/recientes quedan pendientes para soporte de fechas.';

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function getDateKey(value) {
  if (!value) return '';

  const text = String(value).trim();
  if (isDateKey(text)) return text;

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCOREBOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);

  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

function getGameId(game, index) {
  return String(game?.id || game?.gameId || `${game?.awayTeam || 'away'}-${game?.homeTeam || 'home'}-${index}`);
}

function uniqueGames(games) {
  const seen = new Set();
  return asArray(games).filter((game, index) => {
    if (!game || typeof game !== 'object') return false;

    const id = getGameId(game, index);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getStatusText(game) {
  return [
    game?.statusType,
    game?.statusDescription,
    game?.status,
    game?.state,
  ].filter(Boolean).join(' ').toUpperCase();
}

function isLiveGame(game) {
  const status = getStatusText(game);
  return game?.isLive === true || status.includes('IN_PROGRESS') || status.includes('LIVE');
}

function isFinalGame(game) {
  const status = getStatusText(game);
  return game?.isFinal === true || status.includes('FINAL') || status.includes('COMPLETED');
}

function isScheduledGame(game) {
  const status = getStatusText(game);
  return game?.isScheduled === true || status.includes('SCHEDULED') || status.includes('PRE');
}

function getSlateDate(scoreboard, games) {
  const directDate = getDateKey(scoreboard?.date || scoreboard?.today?.date);
  if (directDate) return directDate;

  const datedGame = asArray(games).find((game) => getDateKey(game?.sourceDate || game?.date || game?.startTime));
  return getDateKey(datedGame?.sourceDate || datedGame?.date || datedGame?.startTime);
}

function getGameSlateDate(game) {
  return getDateKey(game?.sourceDate || game?.date || game?.startTime);
}

function isSameSlateDate(game, slateDate) {
  const gameDate = getGameSlateDate(game);
  return Boolean(slateDate && gameDate && gameDate === slateDate);
}

function isAfterSlateDate(game, slateDate) {
  const gameDate = getGameSlateDate(game);
  return Boolean(slateDate && gameDate && gameDate > slateDate);
}

function isBeforeSlateDate(game, slateDate) {
  const gameDate = getGameSlateDate(game);
  return Boolean(slateDate && gameDate && gameDate < slateDate);
}

function getScoreboardGroups(scoreboard) {
  const explicitTodayGames = uniqueGames(asArray(scoreboard?.today?.games));
  const topLevelGames = uniqueGames(asArray(scoreboard?.games));
  const explicitUpcomingGames = uniqueGames([
    ...asArray(scoreboard?.tomorrow?.games),
    ...asArray(scoreboard?.upcoming?.games),
    ...asArray(scoreboard?.future?.games),
    ...asArray(scoreboard?.next?.games),
  ]);
  const explicitRecentGames = uniqueGames([
    ...asArray(scoreboard?.recent?.games),
    ...asArray(scoreboard?.previous?.games),
    ...asArray(scoreboard?.past?.games),
    ...asArray(scoreboard?.yesterday?.games),
  ]);
  const allGames = uniqueGames([
    ...explicitTodayGames,
    ...topLevelGames,
    ...explicitUpcomingGames,
    ...explicitRecentGames,
  ]);
  const slateDate = getSlateDate(scoreboard, allGames);
  const todayGames = uniqueGames(
    explicitTodayGames.length
      ? explicitTodayGames
      : topLevelGames.filter((game) => isSameSlateDate(game, slateDate))
  );
  const upcomingGames = uniqueGames([
    ...explicitUpcomingGames,
    ...allGames.filter((game) => isAfterSlateDate(game, slateDate) && isScheduledGame(game)),
  ]).filter((game) => !isFinalGame(game) && !isSameSlateDate(game, slateDate));
  const recentGames = uniqueGames([
    ...explicitRecentGames,
    ...allGames.filter((game) => isBeforeSlateDate(game, slateDate) || isFinalGame(game)),
  ]);
  const isTodayOnlyEndpoint = Boolean(
    todayGames.length &&
      !explicitUpcomingGames.length &&
      !explicitRecentGames.length &&
      allGames.length &&
      allGames.every((game) => isSameSlateDate(game, slateDate))
  );

  return {
    live: allGames.filter(isLiveGame),
    today: todayGames,
    upcoming: upcomingGames,
    recent: recentGames,
    all: allGames,
    isTodayOnlyEndpoint,
    slateDate,
  };
}

function getDefaultActiveTab(groups) {
  if (groups.live.length) return 'live';
  if (groups.today.length) return 'today';
  if (groups.upcoming.length) return 'upcoming';
  if (groups.recent.length) return 'recent';
  return 'live';
}

function getScoreboardDensity(groups) {
  const total = groups.all.length || 0;
  if (!total) {
    return [
      { key: 'live', label: 'Live', value: 0, pct: 0 },
      { key: 'today', label: 'Today', value: 0, pct: 0 },
      { key: 'upcoming', label: 'Upcoming', value: 0, pct: 0 },
      { key: 'recent', label: 'Recent', value: 0, pct: 0 },
    ];
  }

  return [
    { key: 'live', label: 'Live', value: groups.live.length },
    { key: 'today', label: 'Today', value: groups.today.length },
    { key: 'upcoming', label: 'Upcoming', value: groups.upcoming.length },
    { key: 'recent', label: 'Recent', value: groups.recent.length },
  ].map((item) => ({
    ...item,
    pct: Math.max(3, Math.round((item.value / total) * 100)),
  }));
}

function getEmptyTabCopy(tabKey, tabLabel, groups) {
  if ((tabKey === 'upcoming' || tabKey === 'recent') && groups?.isTodayOnlyEndpoint) {
    return SLATE_ONLY_EMPTY_COPY;
  }

  if (tabKey === 'live') return 'Sin juegos en vivo.';
  if (tabKey === 'today') return 'Sin juegos de hoy.';
  if (tabKey === 'upcoming') return 'Sin próximos juegos.';
  if (tabKey === 'recent') return 'Sin juegos recientes.';
  return `Sin juegos en ${tabLabel.toLowerCase()}.`;
}

function formatGameTime(value) {
  if (!value) return 'Hora n/d';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return new Intl.DateTimeFormat('es-MX', {
    timeZone: SCOREBOARD_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatStatus(game) {
  return game?.statusDescription || game?.status || game?.statusType || 'Programado';
}

function getGameBadgeClass(game) {
  if (isLiveGame(game)) return 'live';
  if (isFinalGame(game)) return 'final';
  if (game?.isPostponed) return 'postponed';
  return 'scheduled';
}

function getGameBadgeLabel(game) {
  if (isLiveGame(game)) return 'Live';
  if (isFinalGame(game)) return 'Final';
  if (game?.isPostponed) return 'Pospuesto';
  return 'Programado';
}

function formatScoreValue(value, game) {
  if (isScheduledGame(game) && !isLiveGame(game)) return '--';
  return Number.isFinite(Number(value)) ? String(value) : '--';
}

function formatInningLabel(game) {
  if (!isLiveGame(game)) return '';

  const half = String(game?.inningHalf || '').trim();
  const inning = String(game?.inning || '').trim();

  if (half && inning) return `${half} ${inning}`;
  return inning;
}

function getFirstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function readNestedValue(source, paths) {
  for (const path of paths) {
    const value = String(path)
      .split('.')
      .reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source);
    if (value !== undefined && value !== null && value !== '') return value;
  }

  return undefined;
}

function normalizeCountNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, numeric);
}

function parseCountText(value) {
  if (typeof value !== 'string') return {};

  const compact = value.trim().match(/^(\d+)\s*[-/]\s*(\d+)$/);
  if (compact) {
    return {
      balls: normalizeCountNumber(compact[1]),
      strikes: normalizeCountNumber(compact[2]),
    };
  }

  const balls = value.match(/(\d+)\s*(?:b|ball|balls)/i);
  const strikes = value.match(/(\d+)\s*(?:s|strike|strikes)/i);
  const outs = value.match(/(\d+)\s*(?:o|out|outs)/i);
  return {
    balls: balls ? normalizeCountNumber(balls[1]) : null,
    strikes: strikes ? normalizeCountNumber(strikes[1]) : null,
    outs: outs ? normalizeCountNumber(outs[1]) : null,
  };
}

function normalizeBaseOccupied(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;

  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (['true', 'yes', 'occupied', 'runner', '1'].includes(text)) return true;
  if (['false', 'no', 'empty', '0'].includes(text)) return false;
  return true;
}

function getBaseValue(game, baseKey, baseNumber) {
  const situation = game?.situation || game?.liveSituation || game?.gameSituation || {};
  const runners = game?.runners || situation?.runners || game?.bases || situation?.bases;

  const direct = getFirstDefined(
    game?.[`on${baseKey}`],
    game?.[`runnerOn${baseKey}`],
    game?.[`runner_on_${baseKey.toLowerCase()}`],
    situation?.[`on${baseKey}`],
    situation?.[`runnerOn${baseKey}`],
    situation?.[baseKey.toLowerCase()]
  );
  if (direct !== undefined) return normalizeBaseOccupied(direct);

  if (Array.isArray(runners)) {
    return runners.some((runner) => {
      if (typeof runner === 'number' || typeof runner === 'string') {
        return String(runner) === String(baseNumber) || String(runner).toLowerCase() === baseKey.toLowerCase();
      }

      return Number(runner?.base || runner?.baseNumber || runner?.currentBase) === baseNumber;
    });
  }

  if (runners && typeof runners === 'object') {
    return normalizeBaseOccupied(getFirstDefined(
      runners[baseKey.toLowerCase()],
      runners[baseKey],
      runners[baseNumber],
      runners[`on${baseKey}`]
    ));
  }

  return null;
}

function getLiveSituation(game) {
  if (!isLiveGame(game)) return null;

  const situation = game?.situation || game?.liveSituation || game?.gameSituation || {};
  const parsedCount = parseCountText(getFirstDefined(game?.count, situation?.count));
  const balls = normalizeCountNumber(getFirstDefined(
    game?.balls,
    situation?.balls,
    game?.count?.balls,
    readNestedValue(game, ['count.balls', 'situation.count.balls']),
    parsedCount.balls
  ));
  const strikes = normalizeCountNumber(getFirstDefined(
    game?.strikes,
    situation?.strikes,
    game?.count?.strikes,
    readNestedValue(game, ['count.strikes', 'situation.count.strikes']),
    parsedCount.strikes
  ));
  const outs = normalizeCountNumber(getFirstDefined(
    game?.outs,
    situation?.outs,
    game?.count?.outs,
    readNestedValue(game, ['count.outs', 'situation.count.outs']),
    parsedCount.outs
  ));
  const bases = {
    first: getBaseValue(game, 'First', 1),
    second: getBaseValue(game, 'Second', 2),
    third: getBaseValue(game, 'Third', 3),
  };
  const hasCount = [balls, strikes, outs].some((value) => value !== null);
  const hasBases = Object.values(bases).some((value) => value !== null);

  return {
    inningLabel: formatInningLabel(game),
    balls,
    strikes,
    outs,
    bases,
    hasCount,
    hasBases,
  };
}

function getRenderableInnings(linescore) {
  const sourceInnings = asArray(linescore?.innings).map((value) => String(value));
  const awayCount = asArray(linescore?.away?.inningRuns).length;
  const homeCount = asArray(linescore?.home?.inningRuns).length;
  const maxCount = Math.max(sourceInnings.length, awayCount, homeCount);

  if (!maxCount) return [];
  return Array.from({ length: maxCount }, (_, index) => sourceInnings[index] || String(index + 1));
}

function formatLinescoreValue(value) {
  if (value === undefined || value === null || value === '') return '--';
  return String(value);
}

function getLogoTeamAbbreviation(logoUrl) {
  const match = String(logoUrl || '').match(/\/scoreboard\/([a-z0-9]+)\.(png|svg|jpg|jpeg|webp)/i);
  return match ? match[1].toUpperCase() : '';
}

function getShortTeamNameFallback(teamName) {
  const parts = String(teamName || '').replace(/\./g, '').split(/\s+/).filter(Boolean);
  if (!parts.length) return '---';
  return (parts.length === 1 ? parts[0] : parts[parts.length - 1]).slice(0, 3).toUpperCase();
}

function getLinescoreTeamLabel(game, team, side) {
  const direct = String(
    team?.abbreviation ||
      team?.abbr ||
      team?.shortName ||
      game?.[`${side}Abbreviation`] ||
      ''
  ).replace(/[^A-Za-z0-9]/g, '');

  if (direct && direct.length <= 4) return direct.toUpperCase();

  const logoLabel = getLogoTeamAbbreviation(side === 'away' ? game?.awayLogo : game?.homeLogo);
  if (logoLabel) return logoLabel;

  return getShortTeamNameFallback(side === 'away' ? game?.awayTeam : game?.homeTeam);
}

function getInningCellValue({ game, side, inningIndex, totalInnings, inningRuns }) {
  const rawValue = inningRuns[inningIndex];
  if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '') {
    return String(rawValue);
  }

  if (
    side === 'home' &&
    isFinalGame(game) &&
    inningIndex === totalInnings - 1 &&
    inningRuns.length === totalInnings - 1
  ) {
    return 'X';
  }

  return '-';
}

function hasRhe(linescore, game) {
  const values = [
    linescore?.away?.runs ?? game?.awayScore,
    linescore?.away?.hits,
    linescore?.away?.errors,
    linescore?.home?.runs ?? game?.homeScore,
  linescore?.home?.hits,
    linescore?.home?.errors,
  ];

  return values.some((value) => value !== undefined && value !== null && value !== '');
}

function LinescoreLogo({ name, logo }) {
  const fallback = getShortTeamNameFallback(name);
  if (!logo) {
    return <span className="linescore-logo-fallback">{fallback}</span>;
  }
  return (
    <img
      src={logo}
      alt={name || fallback}
      className="linescore-logo-img"
      loading="lazy"
      onError={(event) => {
        const host = event.currentTarget.parentElement;
        if (host) {
          host.textContent = fallback;
          host.classList.add('linescore-logo-fallback');
        }
      }}
    />
  );
}

function LinescoreGridRow({ game, team, side, innings }) {
  const inningRuns = asArray(team?.inningRuns);
  const name = side === 'away' ? game?.awayTeam : game?.homeTeam;
  const logo = side === 'away' ? game?.awayLogo : game?.homeLogo;

  return (
    <>
      <div className="linescore-cell linescore-team-cell" role="cell">
        <LinescoreLogo name={name} logo={logo} />
      </div>
      {innings.map((_, index) => (
        <div className="linescore-cell linescore-inning-cell" role="cell" key={`${side}-${index}`}>
          {getInningCellValue({
            game,
            side,
            inningIndex: index,
            totalInnings: innings.length,
            inningRuns,
          })}
        </div>
      ))}
      <div className="linescore-cell linescore-rhe" role="cell">
        {formatLinescoreValue(team?.runs ?? game?.[`${side}Score`])}
      </div>
      <div className="linescore-cell linescore-rhe" role="cell">
        {formatLinescoreValue(team?.hits)}
      </div>
      <div className="linescore-cell linescore-rhe" role="cell">
        {formatLinescoreValue(team?.errors)}
      </div>
    </>
  );
}

function Linescore({ game }) {
  const linescore = game?.linescore || {};
  const innings = getRenderableInnings(linescore);

  if (!innings.length) {
    if (isScheduledGame(game) && !isLiveGame(game)) {
      return <div className="game-detail-item">Sin linescore disponible antes del primer lanzamiento.</div>;
    }

    if (hasRhe(linescore, game)) {
      return (
        <div className="linescore-fallback">
          <div className="linescore-fallback-head">
            <span>Equipo</span>
            <span>R</span>
            <span>H</span>
            <span>E</span>
          </div>
          <div className="linescore-fallback-grid">
            <div className="linescore-fallback-row">
              <span>{getShortTeamNameFallback(game?.awayTeam)}</span>
              <strong>{formatLinescoreValue(linescore?.away?.runs ?? game?.awayScore)}</strong>
              <strong>{formatLinescoreValue(linescore?.away?.hits)}</strong>
              <strong>{formatLinescoreValue(linescore?.away?.errors)}</strong>
            </div>
            <div className="linescore-fallback-row">
              <span>{getShortTeamNameFallback(game?.homeTeam)}</span>
              <strong>{formatLinescoreValue(linescore?.home?.runs ?? game?.homeScore)}</strong>
              <strong>{formatLinescoreValue(linescore?.home?.hits)}</strong>
              <strong>{formatLinescoreValue(linescore?.home?.errors)}</strong>
            </div>
          </div>
          <div className="linescore-fallback-note">Linescore no disponible. Se muestra R/H/E compacto.</div>
        </div>
      );
    }

    return <div className="game-detail-item">Linescore no disponible en cache.</div>;
  }

  return (
    <div
      className={`linescore-wrap${innings.length > 9 ? ' is-extra-innings' : ''}`}
      aria-label="Linescore con R H E visible"
      role="table"
      style={{ '--linescore-innings': innings.length }}
    >
      <div className="linescore-grid" role="rowgroup">
        <div className="linescore-cell linescore-head linescore-team-cell" role="columnheader">Equipo</div>
        {innings.map((inning) => (
          <div className="linescore-cell linescore-head linescore-inning-cell" role="columnheader" key={inning}>
            {inning}
          </div>
        ))}
        <div className="linescore-cell linescore-head linescore-rhe" role="columnheader">R</div>
        <div className="linescore-cell linescore-head linescore-rhe" role="columnheader">H</div>
        <div className="linescore-cell linescore-head linescore-rhe" role="columnheader">E</div>

        <LinescoreGridRow game={game} team={linescore.away || {}} side="away" innings={innings} />
        <LinescoreGridRow game={game} team={linescore.home || {}} side="home" innings={innings} />
      </div>
    </div>
  );
}

function TeamAvatar({ name, logo }) {
  const fallback = getShortTeamNameFallback(name);

  return (
    <span className={`game-avatar team-avatar-frame${logo ? '' : ' is-fallback'}`}>
      {logo ? (
        <img
          src={logo}
          alt={name || fallback}
          loading="lazy"
          onError={(event) => {
            const host = event.currentTarget.parentElement;
            if (host) {
              host.classList.add('is-fallback');
              host.textContent = fallback;
            }
          }}
        />
      ) : (
        fallback
      )}
    </span>
  );
}

function ProbablePitchers({ game }) {
  const probables = asArray(game?.probablePitchers || game?.probables);
  if (!probables.length) return null;

  return (
    <div className="game-detail-item">
      <strong>Probables:</strong>{' '}
      {probables
        .map((item) => `${item.team || 'Equipo'}: ${item.athlete || item.name || 'Pendiente'}`)
        .join(' | ')}
    </div>
  );
}

function CountPill({ label, value }) {
  return (
    <span className="live-count-pill">
      <small>{label}</small>
      <strong>{value ?? '--'}</strong>
    </span>
  );
}

function BaseDiamond({ situation }) {
  const bases = situation?.bases || {};
  const hasBases = situation?.hasBases;

  return (
    <div className={`live-diamond${hasBases ? '' : ' is-unavailable'}`} aria-label={hasBases ? 'Bases ocupadas' : 'Bases no disponibles'}>
      <span className={`base-marker second${bases.second ? ' occupied' : ''}`} />
      <span className={`base-marker third${bases.third ? ' occupied' : ''}`} />
      <span className={`base-marker first${bases.first ? ' occupied' : ''}`} />
    </div>
  );
}

function LiveSituation({ game }) {
  const situation = getLiveSituation(game);
  if (!situation) return null;

  const hasLiveDetail = situation.hasCount || situation.hasBases;

  return (
    <div className={`live-situation-card${hasLiveDetail ? '' : ' is-limited'}`}>
      <div className="live-situation-head">
        <span>Situación en juego</span>
        <strong>{situation.inningLabel || 'En vivo'}</strong>
      </div>
      {hasLiveDetail ? (
        <div className={`live-situation-body${situation.hasBases ? '' : ' count-only'}`}>
          {situation.hasBases ? <BaseDiamond situation={situation} /> : null}
          {situation.hasCount ? (
            <div className="live-count-grid" aria-label="Cuenta del juego">
              <CountPill label="B" value={situation.balls} />
              <CountPill label="S" value={situation.strikes} />
              <CountPill label="O" value={situation.outs} />
            </div>
          ) : (
            <small className="live-situation-note">Sin conteo disponible.</small>
          )}
        </div>
      ) : (
        <div className="live-situation-unavailable">
          <strong>Situación no disponible</strong>
          <small>No hay datos en tiempo real para este momento.</small>
        </div>
      )}
    </div>
  );
}

/**
 * IconVenue — ballpark from above (diamond, foul lines, outfield arc).
 * Matches the provided ballpark-icon.png reference.
 */
const IconVenue = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Outfield arc */}
    <path d="M2 10 A 10 10 0 0 1 22 10" />
    {/* Foul lines */}
    <line x1="10.6" y1="18.6" x2="2" y2="10" />
    <line x1="13.4" y1="18.6" x2="22" y2="10" />
    {/* Home plate circle */}
    <circle cx="12" cy="20" r="2" />
    {/* Infield diamond */}
    <polygon points="12,15 7,10 12,5 17,10" />
    {/* Pitcher's mound */}
    <circle cx="12" cy="10" r="1.5" />
  </svg>
);

/**
 * IconWeather — cloud with partial sun rays. Clearly weather, not venue.
 */
const IconWeather = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {/* Sun behind cloud */}
    <circle cx="14" cy="9" r="3" />
    <path d="M14 3v1.5" />
    <path d="M18.66 5.34l-1.06 1.06" />
    <path d="M20.5 9H19" />
    {/* Cloud body */}
    <path d="M6 19a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 13.5a3 3 0 0 1 .5 5.5H6z" />
  </svg>
);

const IconCalendar = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconUsers = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

/**
 * Custom SVG Flags for Windows compatibility (avoids emoji rendering bugs 'US'/'CA')
 */
const FlagUS = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
    <rect width="64" height="64" fill="#bd3d44"/>
    <path stroke="#fff" strokeWidth="4.9" d="M0 6.5h64M0 16.3h64M0 26.2h64M0 36h64M0 45.8h64M0 55.7h64"/>
    <rect width="28" height="34" fill="#192f5d"/>
    <path fill="#fff" d="M5,4h2v2h-2z M11,4h2v2h-2z M17,4h2v2h-2z M23,4h2v2h-2z M8,9h2v2h-2z M14,9h2v2h-2z M20,9h2v2h-2z M5,14h2v2h-2z M11,14h2v2h-2z M17,14h2v2h-2z M23,14h2v2h-2z M8,19h2v2h-2z M14,19h2v2h-2z M20,19h2v2h-2z M5,24h2v2h-2z M11,24h2v2h-2z M17,24h2v2h-2z M23,24h2v2h-2z M8,29h2v2h-2z M14,29h2v2h-2z M20,29h2v2h-2z"/>
  </svg>
);

const FlagCanada = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
    <rect width="64" height="64" fill="#d3273e"/>
    <rect x="18" width="28" height="64" fill="#fff"/>
    <path fill="#d3273e" d="M32 12 L35 22 L42 19 L39 26 L48 29 L41 33 L44 42 L34 37 L33 48 L31 48 L30 37 L20 42 L23 33 L16 29 L25 26 L22 19 L29 22 Z"/>
  </svg>
);

/**
 * MLB stadium → city/country lookup.
 * Used to display the flag pill below the venue name.
 * All 30 MLB teams covered. Toronto = FlagCanada, rest = FlagUS.
 */
const MLB_VENUE_CITY_MAP = {
  // NL East
  'nationals park':              { city: 'Washington, DC', country: 'USA', flag: <FlagUS /> },
  'citi field':                  { city: 'New York, NY',   country: 'USA', flag: <FlagUS /> },
  'citizens bank park':          { city: 'Philadelphia, PA', country: 'USA', flag: <FlagUS /> },
  'truist park':                 { city: 'Atlanta, GA',    country: 'USA', flag: <FlagUS /> },
  'loandepot park':              { city: 'Miami, FL',      country: 'USA', flag: <FlagUS /> },
  'marlins park':                { city: 'Miami, FL',      country: 'USA', flag: <FlagUS /> },
  // NL Central
  'wrigley field':               { city: 'Chicago, IL',    country: 'USA', flag: <FlagUS /> },
  'great american ball park':    { city: 'Cincinnati, OH', country: 'USA', flag: <FlagUS /> },
  'american family field':       { city: 'Milwaukee, WI',  country: 'USA', flag: <FlagUS /> },
  'pnc park':                    { city: 'Pittsburgh, PA', country: 'USA', flag: <FlagUS /> },
  'busch stadium':               { city: 'St. Louis, MO',  country: 'USA', flag: <FlagUS /> },
  // NL West
  'chase field':                 { city: 'Phoenix, AZ',    country: 'USA', flag: <FlagUS /> },
  'coors field':                 { city: 'Denver, CO',     country: 'USA', flag: <FlagUS /> },
  'dodger stadium':              { city: 'Los Angeles, CA', country: 'USA', flag: <FlagUS /> },
  'petco park':                  { city: 'San Diego, CA',  country: 'USA', flag: <FlagUS /> },
  'oracle park':                 { city: 'San Francisco, CA', country: 'USA', flag: <FlagUS /> },
  // AL East
  'yankee stadium':              { city: 'New York, NY',   country: 'USA', flag: <FlagUS /> },
  'fenway park':                 { city: 'Boston, MA',     country: 'USA', flag: <FlagUS /> },
  'rogers centre':               { city: 'Toronto, ON',    country: 'Canada', flag: <FlagCanada /> },
  'oriole park at camden yards':  { city: 'Baltimore, MD',  country: 'USA', flag: <FlagUS /> },
  'camden yards':                { city: 'Baltimore, MD',  country: 'USA', flag: <FlagUS /> },
  'tropicana field':             { city: 'St. Petersburg, FL', country: 'USA', flag: <FlagUS /> },
  // AL Central
  'guaranteed rate field':       { city: 'Chicago, IL',    country: 'USA', flag: <FlagUS /> },
  'progressive field':           { city: 'Cleveland, OH',  country: 'USA', flag: <FlagUS /> },
  'comerica park':               { city: 'Detroit, MI',    country: 'USA', flag: <FlagUS /> },
  'kauffman stadium':            { city: 'Kansas City, MO', country: 'USA', flag: <FlagUS /> },
  'target field':                { city: 'Minneapolis, MN', country: 'USA', flag: <FlagUS /> },
  // AL West
  'minute maid park':            { city: 'Houston, TX',    country: 'USA', flag: <FlagUS /> },
  'daikin park':                 { city: 'Houston, TX',    country: 'USA', flag: <FlagUS /> },
  'sutter health park':          { city: 'West Sacramento, CA', country: 'USA', flag: <FlagUS /> },
  'angel stadium':               { city: 'Anaheim, CA',    country: 'USA', flag: <FlagUS /> },
  'angel stadium of anaheim':    { city: 'Anaheim, CA',    country: 'USA', flag: <FlagUS /> },
  'oakland coliseum':            { city: 'Oakland, CA',    country: 'USA', flag: <FlagUS /> },
  'oakland athletics ballpark':  { city: 'Las Vegas, NV',  country: 'USA', flag: <FlagUS /> },
  't-mobile park':               { city: 'Seattle, WA',    country: 'USA', flag: <FlagUS /> },
  'globe life field':            { city: 'Arlington, TX',  country: 'USA', flag: <FlagUS /> },
};

const venueCityCache = {};

/**
 * Returns { city, country, flag } for a given venue name, or null if unknown.
 * Cleans up text in parentheses (e.g. "Chase Field (NH)" -> "chase field") and
 * falls back to substring matching.
 */
function getVenueCity(venueName) {
  if (!venueName) return null;
  const rawKey = String(venueName);
  
  if (venueCityCache[rawKey] !== undefined) {
    return venueCityCache[rawKey];
  }
  
  // Clean up any parenthetical annotations like "(NH)" or "(Neutral)"
  let cleanName = rawKey.toLowerCase().trim();
  cleanName = cleanName.replace(/\s*\([^)]*\)/g, '').trim();
  
  let result = null;
  
  // 1. Try exact match on cleaned name
  if (MLB_VENUE_CITY_MAP[cleanName]) {
    result = MLB_VENUE_CITY_MAP[cleanName];
  } else {
    // 2. Try fuzzy substring matching
    for (const [key, value] of Object.entries(MLB_VENUE_CITY_MAP)) {
      if (cleanName.includes(key) || key.includes(cleanName)) {
        result = value;
        break;
      }
    }
  }
  
  venueCityCache[rawKey] = result;
  return result;
}

/**
 * Extracts weather display text from a game object.
 * Returns null if no weather data exists in the payload.
 * ESPN cache currently does NOT include weather — confirmed by cache audit.
 */
function extractWeatherText(game) {
  const weather = game?.weather;
  if (!weather) return null;

  if (typeof weather === 'string' && weather.trim()) return weather.trim();

  if (typeof weather === 'object') {
    const parts = [];
    const condition = weather.condition || weather.description || weather.summary;
    if (condition) parts.push(condition);

    const temp = weather.temp ?? weather.temperature;
    if (temp !== undefined && temp !== null) {
      const tempStr = String(temp);
      parts.push(tempStr.includes('°') ? tempStr : `${tempStr}°`);
    }

    if (weather.wind) parts.push(`Viento ${weather.wind}`);
    if (weather.humidity) parts.push(`Hum ${weather.humidity}`);
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  return null;
}

function GameCard({ game }) {
  const inningLabel = formatInningLabel(game);
  const records = asArray(game?.records);

  // Weather audit: game.weather is NOT present in ESPN cache.
  const weatherText = extractWeatherText(game);
  const weatherExists = weatherText !== null;

  const venueText = game?.venue?.name || game?.venueName || (typeof game?.venue === 'string' ? game.venue : null);
  const attendance = game?.attendance || game?.venue?.attendance;
  const attendanceText = attendance ? `${Number(attendance).toLocaleString()}` : null;

  // City + flag lookup — uses venue name to resolve MLB stadium → city/country
  const venueCity = getVenueCity(venueText);

  return (
    <article className="game-card scorebug-card react-scoreboard-card">
      <div className="game-card-top">
        <div className="game-status-block">
          <IconCalendar />
          <strong>{formatGameTime(game?.startTime || game?.date)}</strong>
          <small>{formatStatus(game)}</small>
        </div>
        <span className={`game-badge ${getGameBadgeClass(game)}`}>{getGameBadgeLabel(game)}</span>
      </div>

      <div className="game-card-layout">
        <div className="game-core">
          <div className="game-team-row">
            <div className="game-team-meta">
              <TeamAvatar name={game?.awayTeam || 'Visitante'} logo={game?.awayLogo} />
              <div className="game-team-copy">
                <strong>{game?.awayTeam || 'Visitante'}</strong>
                <small>Visitante {records.length ? `(${records[0] || ''})` : ''}</small>
              </div>
            </div>
            <span className="game-score">{formatScoreValue(game?.awayScore, game)}</span>
          </div>

          <div className="game-team-row">
            <div className="game-team-meta">
              <TeamAvatar name={game?.homeTeam || 'Local'} logo={game?.homeLogo} />
              <div className="game-team-copy">
                <strong>{game?.homeTeam || 'Local'}</strong>
                <small>Local {records.length > 1 ? `(${records[1] || ''})` : ''}</small>
              </div>
            </div>
            <span className="game-score">{formatScoreValue(game?.homeScore, game)}</span>
          </div>
        </div>

        <div className="game-detail-list">
          {/* Inning chip — only for live games */}
          {inningLabel ? (
            <div className="game-detail-item meta-pill">
              <strong>Inning:</strong> {inningLabel}
            </div>
          ) : null}

          {/* Venue pill: stadium icon + name + attendance as subtext (matches reference screenshot) */}
          {venueText ? (
            <div className="game-detail-item meta-pill meta-pill--venue">
              <IconVenue />
              <span className="meta-pill-venue-body">
                <span className="meta-pill-venue-name">{venueText}</span>
                {attendanceText ? (
                  <small className="meta-pill-venue-sub">Attendance: {attendanceText}</small>
                ) : null}
              </span>
            </div>
          ) : null}

          {/* City + flag pill — resolved from venue name via MLB_VENUE_CITY_MAP */}
          {venueCity ? (
            <div className="game-detail-item meta-pill meta-pill--city">
              <span className="venue-flag" role="img" aria-label={venueCity.country}>
                {venueCity.flag}
              </span>
              <span>{venueCity.city}, {venueCity.country}</span>
            </div>
          ) : null}

          {/* Weather — separate pill with cloud-sun icon.
              If data exists: show condition + temp.
              If no data (current ESPN cache): show intentional muted fallback. */}
          {weatherExists ? (
            <div className="game-detail-item meta-pill">
              <IconWeather />
              <span>{weatherText}</span>
            </div>
          ) : (
            <div className="game-detail-item meta-pill meta-pill--muted" aria-label="Clima no disponible en cache">
              <IconWeather />
              <span className="meta-pill-unavailable">Sin clima</span>
            </div>
          )}

          <ProbablePitchers game={game} />
        </div>

        <div className="game-card-companion">
          <div className="game-insight-mini react-ai-lean">
            <span className="game-insight-label">AI Lean</span>
            <strong>Sin tendencia fuerte</strong>
            <small>Sin llamadas adicionales en esta fase.</small>
          </div>
          <LiveSituation game={game} />
        </div>

        <Linescore game={game} />
      </div>
    </article>
  );
}

function GamesPanel({ games, tabKey, tabLabel, groups }) {
  if (!games.length) {
    return (
      <div className="empty-inline rich scoreboard-empty">
        <strong>{getEmptyTabCopy(tabKey, tabLabel, groups)}</strong>
        <p>Scoreboard cacheado sin entradas para esta pestaña.</p>
      </div>
    );
  }

  return (
    <div className="games-stack react-scoreboard-games">
      {games.map((game, index) => (
        <GameCard game={game} key={getGameId(game, index)} />
      ))}
    </div>
  );
}

export default function ScoreboardView() {
  const [activeTab, setActiveTab] = useState('live');
  const [status, setStatus] = useState('loading');
  const [scoreboard, setScoreboard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadScoreboard() {
      setStatus('loading');
      setError('');

      try {
        const data = await getMlbScoreboard();
        if (cancelled) return;

        const groups = getScoreboardGroups(data);
        if (!groups.all.length) {
          setScoreboard(data || {});
          setActiveTab('live');
          setStatus('empty');
          return;
        }

        setScoreboard(data);
        setActiveTab(getDefaultActiveTab(groups));
        setStatus('success');
      } catch (loadError) {
        if (cancelled) return;

        setScoreboard(null);
        setError(loadError?.message || 'No se pudo consultar el scoreboard.');
        setStatus('error');
      }
    }

    loadScoreboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => getScoreboardGroups(scoreboard), [scoreboard]);
  const activeGames = groups[activeTab] || [];
  const activeLabel = SCOREBOARD_TABS.find((tab) => tab.key === activeTab)?.label || 'Hoy';

  return (
    <section
      className="app-view scoreboard-view foundation-view is-active"
      id="scoreboard"
      data-app-view="scoreboard"
    >
      <section className="ticket-panel glass-card scoreboard-panel scoreboard-panel-full react-scoreboard-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Scoreboard</p>
            <h3>MLB Scoreboard</h3>
          </div>
          <div className="scoreboard-panel-badges">
            <span className="ui-badge subtle">ESPN cacheado</span>
            <span className="ui-badge subtle">Read-only</span>
            <span className="ui-badge subtle">America/Mazatlan</span>
          </div>
        </div>

        <div className="react-scoreboard-meta">
          <strong>{groups.all.length} juegos visibles</strong>
          <span>
            Fuente: {scoreboard?.scoreboardSource || scoreboard?.source || 'cache'} | Actualizado:{' '}
            {formatGameTime(scoreboard?.lastUpdated)}
          </span>
        </div>

        {status === 'success' ? (
          <div className="visual-performance-strip scoreboard-performance-strip" aria-label="Distribucion visual del scoreboard">
            <div className="performance-strip-lede">
              <span>Slate density</span>
              <strong>{groups.all.length}</strong>
            </div>
            <div className="scoreboard-density-rail" aria-hidden="true">
              {getScoreboardDensity(groups).map((item) => (
                <span
                  className={`scoreboard-density-segment ${item.key}`}
                  style={{ '--scoreboard-density': `${item.pct}%` }}
                  key={item.key}
                />
              ))}
            </div>
            <div className="performance-strip-metrics">
              {getScoreboardDensity(groups).map((item) => (
                <span key={item.key}><b>{item.value}</b> {item.label}</span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="scoreboard-tabs" role="tablist" aria-label="Secciones del scoreboard">
          {SCOREBOARD_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                type="button"
                className={`scoreboard-tab${isActive ? ' is-active' : ''}`}
                data-scoreboard-tab={tab.key}
                role="tab"
                aria-selected={isActive}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="scoreboard-tab-label">{tab.label}</span>
                <span className="scoreboard-tab-count">{groups[tab.key]?.length || 0}</span>
              </button>
            );
          })}
        </div>

        {status === 'loading' ? (
          <ViewState
            className="ticket-panel glass-card react-scoreboard-state"
            badge="GET /scoreboard"
            title="Cargando scoreboard"
            copy="Lectura cache-first desde ESPN backend. Sin ticket, generate, odds refresh ni Bedrock."
          />
        ) : null}
        {status === 'error' ? (
          <ViewState
            className="ticket-panel glass-card react-scoreboard-state error"
            badge="Error"
            badgeTone="warning"
            title="Error de lectura"
            copy={error || 'No se pudo cargar el scoreboard cacheado.'}
            detail="Solo se intento GET /api/mlb/scoreboard."
          />
        ) : null}
        {status === 'empty' ? (
          <ViewState
            className="ticket-panel glass-card react-scoreboard-state"
            badge="Cache vacio"
            title="Sin juegos disponibles"
            copy="El endpoint respondio sin juegos renderizables. La mesa queda en modo read-only."
          />
        ) : null}

        {status === 'success' ? (
          <section className="scoreboard-group scoreboard-section-shell react-scoreboard-tab-panel">
            <div className="scoreboard-group-header">
              <div>
                <p className="panel-kicker">{activeLabel}</p>
                <h4>Game cards cacheadas</h4>
              </div>
              <span className="ui-badge cache">Sin live calls</span>
            </div>
            <GamesPanel games={activeGames} tabKey={activeTab} tabLabel={activeLabel} groups={groups} />
          </section>
        ) : null}
      </section>
    </section>
  );
}
