import { useEffect, useState } from 'react';

export const MAZATLAN_TZ = 'America/Mazatlan';

export function formatMazatlanDate(value = new Date()) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: MAZATLAN_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(value);
}

export function formatMazatlanTime(value = new Date()) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: MAZATLAN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value);
}

export function useMazatlanTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    date: formatMazatlanDate(now),
    time: formatMazatlanTime(now),
  };
}
