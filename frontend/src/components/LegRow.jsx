import { useState } from 'react';

const ESPN_MLB_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard';

const TEAM_META = {
  'Arizona Diamondbacks': { abbr: 'ARI', slug: 'ari', primary: '#A71930', accent: '#E3D4AD' },
  Athletics: { abbr: 'ATH', slug: 'ath', primary: '#003831', accent: '#EFB21E' },
  'Atlanta Braves': { abbr: 'ATL', slug: 'atl', primary: '#13274F', accent: '#CE1141' },
  'Baltimore Orioles': { abbr: 'BAL', slug: 'bal', primary: '#DF4601', accent: '#111111' },
  'Boston Red Sox': { abbr: 'BOS', slug: 'bos', primary: '#BD3039', accent: '#0C2340' },
  'Chicago Cubs': { abbr: 'CHC', slug: 'chc', primary: '#0E3386', accent: '#CC3433' },
  'Chicago White Sox': { abbr: 'CHW', slug: 'chw', primary: '#27251F', accent: '#C4CED4' },
  'Cincinnati Reds': { abbr: 'CIN', slug: 'cin', primary: '#C6011F', accent: '#FFFFFF' },
  'Cleveland Guardians': { abbr: 'CLE', slug: 'cle', primary: '#00385D', accent: '#E50022' },
  'Colorado Rockies': { abbr: 'COL', slug: 'col', primary: '#33006F', accent: '#C4CED4' },
  'Detroit Tigers': { abbr: 'DET', slug: 'det', primary: '#0C2340', accent: '#FA4616' },
  'Houston Astros': { abbr: 'HOU', slug: 'hou', primary: '#002D62', accent: '#EB6E1F' },
  'Kansas City Royals': { abbr: 'KC', slug: 'kc', primary: '#004687', accent: '#BD9B60' },
  'Los Angeles Angels': { abbr: 'LAA', slug: 'laa', primary: '#BA0021', accent: '#003263' },
  'Los Angeles Dodgers': { abbr: 'LAD', slug: 'lad', primary: '#005A9C', accent: '#EF3E42' },
  'Miami Marlins': { abbr: 'MIA', slug: 'mia', primary: '#00A3E0', accent: '#EF3340' },
  'Milwaukee Brewers': { abbr: 'MIL', slug: 'mil', primary: '#12284B', accent: '#FFC52F' },
  'Minnesota Twins': { abbr: 'MIN', slug: 'min', primary: '#002B5C', accent: '#D31145' },
  'New York Mets': { abbr: 'NYM', slug: 'nym', primary: '#002D72', accent: '#FF5910' },
  'New York Yankees': { abbr: 'NYY', slug: 'nyy', primary: '#0C2340', accent: '#C4CED4' },
  'Philadelphia Phillies': { abbr: 'PHI', slug: 'phi', primary: '#E81828', accent: '#002D72' },
  'Pittsburgh Pirates': { abbr: 'PIT', slug: 'pit', primary: '#27251F', accent: '#FDB827' },
  'San Diego Padres': { abbr: 'SD', slug: 'sd', primary: '#2F241D', accent: '#FFC425' },
  'San Francisco Giants': { abbr: 'SF', slug: 'sf', primary: '#FD5A1E', accent: '#27251F' },
  'Seattle Mariners': { abbr: 'SEA', slug: 'sea', primary: '#0C2C56', accent: '#005C5C' },
  'St. Louis Cardinals': { abbr: 'STL', slug: 'stl', primary: '#C41E3A', accent: '#0C2340' },
  'Tampa Bay Rays': { abbr: 'TB', slug: 'tb', primary: '#092C5C', accent: '#8FBCE6' },
  'Texas Rangers': { abbr: 'TEX', slug: 'tex', primary: '#003278', accent: '#C0111F' },
  'Toronto Blue Jays': { abbr: 'TOR', slug: 'tor', primary: '#134A8E', accent: '#E8291C' },
  'Washington Nationals': { abbr: 'WSH', slug: 'wsh', primary: '#AB0003', accent: '#14225A' },
};

const TEAM_ALIASES = {
  ARI: 'Arizona Diamondbacks',
  ATH: 'Athletics',
  ATL: 'Atlanta Braves',
  BAL: 'Baltimore Orioles',
  BOS: 'Boston Red Sox',
  CHC: 'Chicago Cubs',
  CHW: 'Chicago White Sox',
  CIN: 'Cincinnati Reds',
  CLE: 'Cleveland Guardians',
  COL: 'Colorado Rockies',
  DET: 'Detroit Tigers',
  HOU: 'Houston Astros',
  KC: 'Kansas City Royals',
  LAA: 'Los Angeles Angels',
  LAD: 'Los Angeles Dodgers',
  MIA: 'Miami Marlins',
  MIL: 'Milwaukee Brewers',
  MIN: 'Minnesota Twins',
  NYM: 'New York Mets',
  NYY: 'New York Yankees',
  PHI: 'Philadelphia Phillies',
  PIT: 'Pittsburgh Pirates',
  SD: 'San Diego Padres',
  SF: 'San Francisco Giants',
  SEA: 'Seattle Mariners',
  STL: 'St. Louis Cardinals',
  TB: 'Tampa Bay Rays',
  TEX: 'Texas Rangers',
  TOR: 'Toronto Blue Jays',
  WSH: 'Washington Nationals',
  'Oakland Athletics': 'Athletics',
  "A's": 'Athletics',
  'LA Dodgers': 'Los Angeles Dodgers',
  Dodgers: 'Los Angeles Dodgers',
  'White Sox': 'Chicago White Sox',
  Tigers: 'Detroit Tigers',
  Padres: 'San Diego Padres',
};

function normalizeLabel(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return String(value);
}

function sanitizeDisplayText(value) {
  return String(value || '').replace(/\bDraftea\b/gi, 'Daily Ticket');
}

function compactText(value, maxLength = 86) {
  const text = sanitizeDisplayText(value).replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

function getMarketLabel(market) {
  const value = String(market || '').toLowerCase();
  if (value === 'h2h') return 'Money Line';
  if (value === 'spreads') return 'Spread';
  if (value === 'totals') return 'Total';
  if (value.includes('pitcher_strikeouts')) return 'Ponches';
  if (value.includes('batter_hits')) return 'Hits';
  if (value.includes('total_bases')) return 'Bases totales';
  if (value.includes('home_runs') || value.includes('hrr')) return 'Home run';
  if (value.includes('rbis')) return 'RBI';
  if (value.includes('runs')) return 'Carreras';
  return value ? value.replace(/_/g, ' ') : 'Mercado';
}

function getCompactMarketLabel(market) {
  const label = getMarketLabel(market);
  if (label === 'Money Line') return 'ML';
  if (label === 'Bases totales') return 'TB';
  if (label === 'Home run') return 'HR';
  return label;
}

function getPropBadgeLabel(market) {
  const value = String(market || '').toLowerCase();
  if (value.includes('pitcher_strikeouts')) return 'K';
  if (value.includes('batter_hits')) return 'HITS';
  if (value.includes('total_bases')) return 'TB';
  if (value.includes('home_runs') || value.includes('hrr')) return 'HR';
  if (value.includes('rbis')) return 'RBI';
  if (value.includes('runs')) return 'RUNS';
  return String(getCompactMarketLabel(market)).toUpperCase();
}

function formatConfidence(confidence) {
  const numeric = Number(confidence);
  return Number.isFinite(numeric) ? `Conf. ${Math.round(numeric)}` : 'Conf. n/d';
}

function getConfidenceNumber(confidence) {
  const numeric = Number(confidence);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function getConfidenceTier(confidence) {
  const numeric = getConfidenceNumber(confidence);
  if (numeric === null) {
    return 'unknown';
  }

  if (numeric >= 72) return 'high';
  if (numeric >= 58) return 'medium';
  return 'low';
}

function getMarketTone(market) {
  const value = String(market || '').toLowerCase();
  if (value === 'h2h') return 'moneyline';
  if (value === 'spreads') return 'spread';
  if (value === 'totals') return 'total';
  if (value.includes('prop') || value.includes('hits') || value.includes('strikeouts') || value.includes('bases')) {
    return 'prop';
  }

  return 'generic';
}

function getCandidateType(leg) {
  const value = String(leg?.candidateType || leg?.candidate_type || '').toLowerCase();
  return value === 'player_prop' ? 'player' : 'team';
}

function getPlayerNameFromPick(pick) {
  const text = String(pick || '').trim();
  const match = text.match(/^(.+?)\s+(over|under|mas|menos)\s+/i);
  return match?.[1]?.trim() || '';
}

function normalizeNameText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s.]/g, ' ');
}

function getPrimaryName(leg, pick) {
  if (getCandidateType(leg) === 'player') {
    return normalizeLabel(
      leg?.playerName || leg?.player?.name || leg?.player || leg?.athleteName || getPlayerNameFromPick(pick),
      pick
    );
  }

  return normalizeLabel(
    leg?.candidateTeam || leg?.teamResolved || leg?.team?.name || leg?.team || leg?.playerTeam,
    pick
  );
}

function getComparableName(value) {
  return normalizeNameText(value).replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getTeamMetaByName(name, pick = '') {
  const directName = TEAM_ALIASES[name] || name;
  if (TEAM_META[directName]) {
    return { name: directName, ...TEAM_META[directName] };
  }

  const comparableName = getComparableName(directName);
  const directEntry = Object.entries(TEAM_META).find(([teamName]) => getComparableName(teamName) === comparableName);
  if (directEntry) {
    return { name: directEntry[0], ...directEntry[1] };
  }

  const haystack = getComparableName(`${name} ${pick}`);
  const fuzzyEntry = Object.entries(TEAM_META)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([teamName]) => haystack.includes(getComparableName(teamName)));

  if (fuzzyEntry) {
    return { name: fuzzyEntry[0], ...fuzzyEntry[1] };
  }

  return null;
}

function getTeamAbbreviation(name) {
  const text = String(name || '').trim();
  if (!text) {
    return 'MLB';
  }

  const meta = getTeamMetaByName(text);
  if (meta?.abbr) {
    return meta.abbr;
  }

  const words = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !['the', 'de', 'of'].includes(word.toLowerCase()));

  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 3) || 'MLB';
}

function getPlayerInitials(name) {
  const words = normalizeNameText(name)
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return 'P';
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function getNestedImage(value) {
  if (!value || typeof value !== 'object') {
    return '';
  }

  return value.logo || value.logoUrl || value.image || value.imageUrl || value.headshot || value.headshotUrl || '';
}

function getVisualData(leg, pick) {
  const candidateType = getCandidateType(leg);
  const primaryName = getPrimaryName(leg, pick);
  const teamMeta = candidateType === 'team' ? getTeamMetaByName(primaryName, pick) : getTeamMetaByName(leg?.candidateTeam || leg?.playerTeam || '', pick);
  const explicitImage = candidateType === 'player'
    ? leg?.playerHeadshot || leg?.headshot || leg?.playerImage || leg?.playerImageUrl || getNestedImage(leg?.player)
    : leg?.teamLogo || leg?.logo || leg?.candidateLogo || leg?.candidateTeamLogo || getNestedImage(leg?.team);
  const logoImage = candidateType === 'team' && teamMeta?.slug
    ? `${ESPN_MLB_LOGO_BASE}/${teamMeta.slug}.png`
    : '';
  const displayImage = explicitImage || logoImage;

  return {
    image: displayImage,
    initials: candidateType === 'player' ? getPlayerInitials(primaryName) : teamMeta?.abbr || getTeamAbbreviation(primaryName),
    label: primaryName,
    teamAbbr: teamMeta?.abbr || getTeamAbbreviation(primaryName),
    teamName: teamMeta?.name || primaryName,
    type: candidateType,
    hasRealTeamLogo: candidateType === 'team' && Boolean(displayImage),
    style: teamMeta
      ? {
          '--leg-team-primary': teamMeta.primary,
          '--leg-team-accent': teamMeta.accent,
        }
      : undefined,
  };
}

function summarizeWarningChip(text) {
  const value = String(text || '').trim();
  if (!value) {
    return '';
  }

  return value.length > 68 ? `${value.slice(0, 65).trim()}...` : value;
}

function getLegWarnings(leg) {
  const warnings = [
    ...(Array.isArray(leg?.ruleWarnings) ? leg.ruleWarnings : []),
    ...(Array.isArray(leg?.warnings) ? leg.warnings : []),
    ...(Array.isArray(leg?.historicalInfluenceWarnings) ? leg.historicalInfluenceWarnings : []),
  ]
    .map(summarizeWarningChip)
    .filter(Boolean);

  return Array.from(new Set(warnings));
}

function getAnalysisText(leg) {
  return sanitizeDisplayText(leg?.why || leg?.reason || leg?.analysis || leg?.note).trim();
}

function getPreviewText(leg) {
  const text = getAnalysisText(leg);
  if (!text) {
    return 'Lectura breve disponible al abrir el analisis.';
  }

  return compactText(text, 82);
}

function getRiskChip(leg) {
  if (leg?.protected === true || leg?.isProtected === true) {
    return { label: 'Protegido', tone: 'protected' };
  }

  const voidRisk = leg?.voidRisk || leg?.void_risk;
  if (voidRisk) {
    return { label: `Void ${voidRisk}`, tone: 'void-risk' };
  }

  if (leg?.lineupRequired) {
    return { label: 'Lineup', tone: 'void-risk' };
  }

  return { label: 'Reglas ok', tone: 'neutral' };
}

function getLegStatusTone(leg, warnings) {
  const status = String(leg?.status || leg?.result || leg?.outcome || '').toLowerCase();
  if (status.includes('lost') || status.includes('fail') || status.includes('loss')) {
    return 'bad';
  }

  if (status.includes('void') || status.includes('push')) {
    return 'void';
  }

  if (warnings.length || leg?.available === false) {
    return 'watch';
  }

  return 'ok';
}

function getLegStatusLabel(tone) {
  if (tone === 'bad') return 'Resultado desfavorable';
  if (tone === 'void') return 'Void o push';
  if (tone === 'watch') return 'Revisar proteccion';
  return 'Pick listo';
}

function getSourceDetails(leg) {
  const values = [
    leg?.protectionReason ? `Proteccion: ${leg.protectionReason}` : '',
    leg?.historicalInfluenceReason ? `Historial: ${leg.historicalInfluenceReason}` : '',
    leg?.confidenceSource ? `Fuente confianza: ${leg.confidenceSource}` : '',
    leg?.whySource ? `Fuente analisis: ${leg.whySource}` : '',
    leg?.oddsVerified !== undefined ? `Odds verificado: ${leg.oddsVerified ? 'si' : 'no'}` : '',
    leg?.valueScore !== undefined ? `Value score: ${leg.valueScore}` : '',
  ];

  return values.map((value) => compactText(value, 110)).filter(Boolean);
}

export default function LegRow({ leg, index }) {
  const [expanded, setExpanded] = useState(false);
  const pick = normalizeLabel(leg?.pick || leg?.selection, 'Pick sin nombre');
  const game = normalizeLabel(leg?.game || leg?.matchup || leg?.team, 'Juego sin nombre');
  const odds = normalizeLabel(leg?.odds || leg?.price || leg?.americanOdds, '-');
  const analysisText = getAnalysisText(leg);
  const warnings = getLegWarnings(leg);
  const sourceDetails = getSourceDetails(leg);
  const confidenceNumber = getConfidenceNumber(leg?.confidence);
  const confidenceTier = getConfidenceTier(leg?.confidence);
  const marketTone = getMarketTone(leg?.market);
  const visual = getVisualData(leg, pick);
  const candidateType = getCandidateType(leg);
  const riskChip = getRiskChip(leg);
  const marketLabel = getMarketLabel(leg?.market);
  const compactMarketLabel = candidateType === 'player' ? getPropBadgeLabel(leg?.market) : getCompactMarketLabel(leg?.market);
  const compactMarketTone = candidateType === 'player' ? 'prop-type' : marketTone;
  const statusTone = getLegStatusTone(leg, warnings);

  return (
    <article
      className={`bet-leg-row react-leg-row ${marketTone} ${candidateType}-identity confidence-${confidenceTier}${expanded ? ' is-expanded' : ''}`}
      style={{ '--leg-stagger': `${index * 45}ms` }}
    >
      <div className="bet-leg-top">
        <div className="bet-leg-visual-stack">
          <div
            className={`react-leg-avatar ${visual.image ? 'has-image' : 'is-fallback'} ${visual.type}${visual.hasRealTeamLogo ? ' has-real-logo' : ''}`}
            aria-label={visual.label}
            style={visual.style}
          >
            {visual.type === 'player' ? (
              <span className="leg-player-card" aria-hidden="true">
                <svg className="leg-player-icon" viewBox="0 0 48 48" focusable="false" aria-hidden="true">
                  <path d="M24 8c5.4 0 9.5 4.2 9.5 9.7 0 5.2-3.9 9.2-9.5 9.2s-9.5-4-9.5-9.2C14.5 12.2 18.6 8 24 8Z" />
                  <path d="M10.5 41.2c2.1-8 7-12.1 13.5-12.1s11.4 4.1 13.5 12.1" />
                </svg>
                <span className="leg-player-nameplate">{visual.initials}</span>
              </span>
            ) : (
              <span className="leg-team-crest" aria-hidden="true">
                <span className="leg-team-monogram">{visual.teamAbbr}</span>
              </span>
            )}
            <span className="leg-avatar-initials">{visual.initials}</span>
            {visual.image ? (
              <img
                src={visual.image}
                alt={visual.label}
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.parentElement?.classList.add('image-failed');
                }}
              />
            ) : null}
            <span className="leg-avatar-silhouette" aria-hidden="true" />
          </div>
          <div className="bet-leg-index">{index + 1}</div>
        </div>

        <div className="bet-leg-main">
          <span className="bet-leg-market-label">
            {marketLabel} / {candidateType === 'player' ? 'Player prop' : 'Game market'}
          </span>
          <div className="bet-leg-title-row">
            <strong>{pick}</strong>
          </div>
          <span className="bet-leg-matchup">{game}</span>
          <div className="bet-leg-chip-row" aria-label="Datos clave del pick">
            <span className={`confidence-pill ${confidenceTier}`}>{formatConfidence(leg?.confidence)}</span>
            <span className={`market-pill ${compactMarketTone}`}>{compactMarketLabel}</span>
            <span className={`market-pill ${riskChip.tone}`}>{riskChip.label}</span>
          </div>
          {confidenceNumber !== null ? (
            <div
              className="bet-leg-confidence-meter"
              style={{ '--confidence-value': `${confidenceNumber}%` }}
              aria-hidden="true"
            >
              <span />
            </div>
          ) : null}
          <p className="bet-leg-short-why">{getPreviewText(leg)}</p>
        </div>

        <div className="bet-leg-meta">
          <span className={`leg-status-dot ${statusTone}`} aria-label={getLegStatusLabel(statusTone)} />
          <div className="bet-leg-odds-block">
            <span>Momio</span>
            <strong className="bet-leg-odds">{odds}</strong>
          </div>
          <button
            type="button"
            className="bet-leg-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Ocultar' : 'Ver analisis'}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="bet-leg-details react-leg-details">
          <div className="bet-leg-detail-block">
            <span>Analisis</span>
            <p>{analysisText || 'Sin analisis adicional en la respuesta cacheada.'}</p>
          </div>

          <div className="react-leg-detail-grid">
            <div className="bet-leg-detail-block compact">
              <span>Identidad</span>
              <p>{visual.label}</p>
            </div>
            <div className="bet-leg-detail-block compact">
              <span>Mercado</span>
              <p>{marketLabel}</p>
            </div>
            <div className="bet-leg-detail-block compact">
              <span>Confidence</span>
              <p>{formatConfidence(leg?.confidence)}</p>
            </div>
            <div className="bet-leg-detail-block compact">
              <span>Proteccion</span>
              <p>{riskChip.label}</p>
            </div>
          </div>

          {warnings.length ? (
            <div className="bet-leg-detail-block">
              <span>Reglas y warnings</span>
              <div className="warning-chip-row react-leg-warning-row">
                {warnings.map((warning) => (
                  <span className="warning-chip" key={warning}>{warning}</span>
                ))}
              </div>
            </div>
          ) : null}

          {sourceDetails.length ? (
            <div className="bet-leg-detail-block">
              <span>Fuente y metadata</span>
              <ul className="bet-leg-source-list">
                {sourceDetails.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
