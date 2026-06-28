function normalizeLabel(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return String(value);
}

function getMarketLabel(market) {
  const value = String(market || '').toLowerCase();
  if (value === 'h2h') return 'ML';
  if (value === 'spreads') return 'Spread';
  if (value === 'totals') return 'Total';
  if (value.includes('pitcher_strikeouts')) return 'K Prop';
  if (value.includes('batter_hits')) return 'Hit Prop';
  if (value.includes('total_bases')) return 'TB Prop';
  if (value.includes('home_runs') || value.includes('hrr')) return 'HR Prop';
  if (value.includes('rbis')) return 'RBI Prop';
  if (value.includes('runs')) return 'Runs Prop';
  return value ? value.replace(/_/g, ' ') : 'Mercado';
}

function formatConfidence(confidence) {
  const numeric = Number(confidence);
  return Number.isFinite(numeric) ? `Conf. ${Math.round(numeric)}` : 'Conf. n/d';
}

export default function LegRow({ leg, index }) {
  const pick = normalizeLabel(leg?.pick || leg?.selection, 'Pick sin nombre');
  const game = normalizeLabel(leg?.game || leg?.matchup || leg?.team, 'Juego sin nombre');
  const odds = normalizeLabel(leg?.odds || leg?.price || leg?.americanOdds, '-');
  const team = normalizeLabel(leg?.team || leg?.player || leg?.candidateTeam, 'Equipo/Jugador n/d');

  return (
    <article className="bet-leg-row react-leg-row">
      <div className="bet-leg-top">
        <div className="bet-leg-visual-stack">
          <div className="react-leg-avatar">{String(pick).slice(0, 2).toUpperCase()}</div>
          <div className="bet-leg-index">{index + 1}</div>
        </div>
        <div className="bet-leg-main">
          <strong>{pick}</strong>
          <span>{game}</span>
          <div className="bet-leg-chip-row">
            <span className="confidence-pill medium">{formatConfidence(leg?.confidence)}</span>
            <span className="market-pill generic">{getMarketLabel(leg?.market)}</span>
            {team !== 'Equipo/Jugador n/d' ? <span className="market-pill protected">{team}</span> : null}
          </div>
        </div>
        <div className="bet-leg-meta">
          <strong className="bet-leg-odds">{odds}</strong>
          <span className="ui-badge subtle">Read-only</span>
        </div>
      </div>
      {(leg?.reason || leg?.analysis || leg?.note) ? (
        <div className="bet-leg-preview">
          <p>{leg.reason || leg.analysis || leg.note}</p>
        </div>
      ) : null}
    </article>
  );
}
