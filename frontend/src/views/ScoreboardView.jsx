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

function LinescoreRow({ game, team, side, innings }) {
  const inningRuns = asArray(team?.inningRuns);

  return (
    <tr>
      <td className="linescore-team-cell">{getLinescoreTeamLabel(game, team, side)}</td>
      {innings.map((_, index) => (
        <td key={`${side}-${index}`}>
          {getInningCellValue({
            game,
            side,
            inningIndex: index,
            totalInnings: innings.length,
            inningRuns,
          })}
        </td>
      ))}
      <td className="linescore-rhe">{formatLinescoreValue(team?.runs ?? game?.[`${side}Score`])}</td>
      <td className="linescore-rhe">{formatLinescoreValue(team?.hits)}</td>
      <td className="linescore-rhe">{formatLinescoreValue(team?.errors)}</td>
    </tr>
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
    <div className="linescore-wrap">
      <table className="linescore-table">
        <thead>
          <tr>
            <th>Equipo</th>
            {innings.map((inning) => (
              <th key={inning}>{inning}</th>
            ))}
            <th>R</th>
            <th>H</th>
            <th>E</th>
          </tr>
        </thead>
        <tbody>
          <LinescoreRow game={game} team={linescore.away || {}} side="away" innings={innings} />
          <LinescoreRow game={game} team={linescore.home || {}} side="home" innings={innings} />
        </tbody>
      </table>
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

function GameCard({ game }) {
  const inningLabel = formatInningLabel(game);
  const records = asArray(game?.records).join(' | ');

  return (
    <article className="game-card scorebug-card react-scoreboard-card">
      <div className="game-card-top">
        <div className="game-status-block">
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
                <small>Visitante</small>
              </div>
            </div>
            <span className="game-score">{formatScoreValue(game?.awayScore, game)}</span>
          </div>

          <div className="game-team-row">
            <div className="game-team-meta">
              <TeamAvatar name={game?.homeTeam || 'Local'} logo={game?.homeLogo} />
              <div className="game-team-copy">
                <strong>{game?.homeTeam || 'Local'}</strong>
                <small>Local</small>
              </div>
            </div>
            <span className="game-score">{formatScoreValue(game?.homeScore, game)}</span>
          </div>
        </div>

        <div className="game-detail-list">
          {inningLabel ? <div className="game-detail-item"><strong>Inning:</strong> {inningLabel}</div> : null}
          <div className="game-detail-item"><strong>Venue:</strong> {game?.venue || 'Sin venue'}</div>
          <div className="game-detail-item"><strong>Records:</strong> {records || 'Sin records'}</div>
          <div className="game-detail-item"><strong>Detalle:</strong> {formatStatus(game)}</div>
          <ProbablePitchers game={game} />
        </div>

        <div className="game-insight-mini react-ai-lean">
          <span className="game-insight-label">AI Lean</span>
          <strong>Sin tendencia fuerte</strong>
          <small>Sin llamadas adicionales en esta fase.</small>
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
