import { useState } from 'react';

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

function summarizeWarningChip(text) {
  const value = String(text || '').trim();
  if (!value) {
    return '';
  }

  return value.length > 38 ? `${value.slice(0, 35).trim()}...` : value;
}

function getLegWarnings(leg) {
  const warnings = [
    ...(Array.isArray(leg?.ruleWarnings) ? leg.ruleWarnings : []),
    ...(Array.isArray(leg?.warnings) ? leg.warnings : []),
  ]
    .map(summarizeWarningChip)
    .filter(Boolean);

  return Array.from(new Set(warnings));
}

function getAnalysisText(leg) {
  return String(leg?.why || leg?.reason || leg?.analysis || leg?.note || '').trim();
}

function getPreviewText(leg) {
  const text = getAnalysisText(leg);
  if (!text) {
    return 'Analisis compacto disponible para esta jugada.';
  }

  return text.length > 112 ? `${text.slice(0, 109).trim()}...` : text;
}

export default function LegRow({ leg, index }) {
  const [expanded, setExpanded] = useState(false);
  const pick = normalizeLabel(leg?.pick || leg?.selection, 'Pick sin nombre');
  const game = normalizeLabel(leg?.game || leg?.matchup || leg?.team, 'Juego sin nombre');
  const odds = normalizeLabel(leg?.odds || leg?.price || leg?.americanOdds, '-');
  const team = normalizeLabel(leg?.team || leg?.player || leg?.candidateTeam, 'Equipo/Jugador n/d');
  const analysisText = getAnalysisText(leg);
  const warnings = getLegWarnings(leg);
  const protectedValue = leg?.protected === true || leg?.isProtected === true;
  const voidRisk = leg?.voidRisk || leg?.void_risk;

  return (
    <article className={`bet-leg-row react-leg-row${expanded ? ' is-expanded' : ''}`}>
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
            {protectedValue ? <span className="market-pill protected">Protegido</span> : null}
            {voidRisk ? <span className="market-pill void-risk">Void {voidRisk}</span> : null}
          </div>
        </div>
        <div className="bet-leg-meta">
          <strong className="bet-leg-odds">{odds}</strong>
          <button
            type="button"
            className="bet-leg-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Ocultar analisis' : 'Ver analisis'}
          </button>
        </div>
      </div>
      <div className="bet-leg-preview">
        <p>{getPreviewText(leg)}</p>
      </div>

      {expanded ? (
        <div className="bet-leg-details react-leg-details">
          <div className="bet-leg-detail-block">
            <span>Analisis</span>
            <p>{analysisText || 'Sin analisis adicional en la respuesta cacheada.'}</p>
          </div>

          <div className="react-leg-detail-grid">
            <div className="bet-leg-detail-block compact">
              <span>Mercado</span>
              <p>{getMarketLabel(leg?.market)}</p>
            </div>
            <div className="bet-leg-detail-block compact">
              <span>Confidence</span>
              <p>{formatConfidence(leg?.confidence)}</p>
            </div>
            <div className="bet-leg-detail-block compact">
              <span>Proteccion</span>
              <p>{protectedValue ? 'Protegido' : 'Sin proteccion declarada'}</p>
            </div>
            <div className="bet-leg-detail-block compact">
              <span>Void risk</span>
              <p>{voidRisk || 'Sin alerta'}</p>
            </div>
          </div>

          {warnings.length ? (
            <div className="bet-leg-detail-block">
              <span>Reglas</span>
              <div className="warning-chip-row react-leg-warning-row">
                {warnings.map((warning) => (
                  <span className="warning-chip" key={warning}>{warning}</span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
