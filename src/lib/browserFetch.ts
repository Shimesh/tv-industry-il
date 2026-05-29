// Browser-side fetching for Herzliya schedule system
// Uses CORS proxies since the server is only accessible from user's network

import {
  isHerzliyaHTML,
  parseHerzliyaHTML,
  parseHerzliyaPopupHtml,
  extractHerzliyaBaseUrl,
  buildHerzliyaPopupUrl,
} from '@/lib/productionScheduleParser';

export type FetchStep =
  | 'detecting'
  | 'connecting'
  | 'fetching_personal'
  | 'fetching_dept'
  | 'fetching_crew'
  | 'parsing'
  | 'done'
  | 'error';

export interface FetchProgress {
  step: FetchStep;
  message: string;
}

const STEP_MESSAGES: Record<FetchStep, string> = {
  detecting: '🔍 מזהה לינק...',
  connecting: '📡 מתחבר לשרת הרצליה...',
  fetching_crew: '👥 מושך פרטי צוות מלאים...',
  fetching_personal: '📋 קורא לוח עבודה אישי...',
  fetching_dept: '👥 קורא נתוני מחלקה...',
  parsing: '⚙️ מעבד נתונים...',
  done: '✅ הלוח מוכן!',
  error: '❌ שגיאה',
};

export function getStepMessage(step: FetchStep): string {
  return STEP_MESSAGES[step];
}

// CORS proxy options - try multiple in case one is down
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

interface ProxyResponse {
  html: string;
  proxy: string;
  error?: string;
}

// Fetch URL through CORS proxy from the browser
async function fetchViaProxy(url: string): Promise<ProxyResponse> {
  // Try each proxy in order
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxyUrl = CORS_PROXIES[i](url);
    const proxyName = i === 0 ? 'allorigins' : 'codetabs';

    try {
      const response = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(15000), // 15s timeout
      });

      if (!response.ok) {
        continue;
      }

      // allorigins returns JSON with { contents: "..." }
      // codetabs returns the HTML directly
      if (i === 0) {
        const data = await response.json();
        if (data.contents) {
          return { html: data.contents, proxy: proxyName };
        }
      } else {
        const html = await response.text();
        if (html) {
          return { html, proxy: proxyName };
        }
      }
    } catch (err) {
      console.warn(`Proxy ${proxyName} failed:`, err);
      continue;
    }
  }

  return { html: '', proxy: 'none', error: 'כל ה-proxies נכשלו' };
}

// Build department view URL from personal URL
function buildDeptUrl(personalUrl: string): string[] {
  const urls: string[] = [];

  try {
    // Try adding ShowFmp parameter
    const url1 = new URL(personalUrl);
    url1.searchParams.set('HSELWEBprgnameShowFmp', '1');
    urls.push(url1.toString());

    // Try changing ShowFmp=0 to ShowFmp=1
    if (personalUrl.includes('ShowFmp=0')) {
      urls.push(personalUrl.replace('ShowFmp=0', 'ShowFmp=1'));
    }

    // Try showdept parameter
    const url2 = new URL(personalUrl);
    url2.searchParams.set('showdept', '1');
    urls.push(url2.toString());

    // Try allDep parameter
    const url3 = new URL(personalUrl);
    url3.searchParams.set('allDep', '1');
    urls.push(url3.toString());
  } catch {
    // Invalid URL - return empty
  }

  return urls;
}

// Main browser fetch function
export async function fetchScheduleFromBrowser(
  url: string,
  onProgress: (progress: FetchProgress) => void
): Promise<{
  personalHtml: string;
  deptHtml: string;
  error?: string;
}> {
  // Step 1: Connect
  onProgress({ step: 'connecting', message: getStepMessage('connecting') });

  // Step 2: Fetch personal schedule
  onProgress({ step: 'fetching_personal', message: getStepMessage('fetching_personal') });
  const personalResult = await fetchViaProxy(url);

  if (!personalResult.html) {
    onProgress({ step: 'error', message: personalResult.error || 'לא הצלחתי לגשת ללינק' });
    return {
      personalHtml: '',
      deptHtml: '',
      error: personalResult.error || 'לא הצלחתי לגשת ללינק. ייתכן שהלינק נגיש רק מרשת הרצליה.',
    };
  }

  // Step 3: Try to fetch department view
  onProgress({ step: 'fetching_dept', message: getStepMessage('fetching_dept') });
  let deptHtml = '';

  const deptUrls = buildDeptUrl(url);
  for (const deptUrl of deptUrls) {
    const deptResult = await fetchViaProxy(deptUrl);
    if (deptResult.html && deptResult.html !== personalResult.html) {
      deptHtml = deptResult.html;
      break;
    }
  }

  // Step 4: Fetch full crew details from openmd2 popup for each event
  // The calendar HTML only shows a preview of crew; the popup has the full list + phone numbers
  let enrichedPersonalHtml = personalResult.html;
  if (isHerzliyaHTML(personalResult.html)) {
    const baseUrl = extractHerzliyaBaseUrl(personalResult.html) || url.replace(/\?.*$/, '');
    const parsed = parseHerzliyaHTML(personalResult.html);
    const eventIds = parsed.productions
      .map(p => p.herzliyaId)
      .filter((id): id is number => Boolean(id));

    if (eventIds.length > 0 && baseUrl) {
      onProgress({ step: 'fetching_crew', message: `${getStepMessage('fetching_crew')} (${eventIds.length} הפקות)` });

      // Fetch popup for each event (up to 20 to avoid overwhelming the proxy)
      const popupResults: Record<number, string> = {};
      const idsToFetch = eventIds.slice(0, 20);
      await Promise.allSettled(
        idsToFetch.map(async (herzliyaId) => {
          const popupUrl = buildHerzliyaPopupUrl(baseUrl, herzliyaId);
          if (!popupUrl) return;
          const result = await fetchViaProxy(popupUrl);
          if (result.html) popupResults[herzliyaId] = result.html;
        })
      );

      // Inject popup crew data as hidden data attributes in the HTML for the parser
      if (Object.keys(popupResults).length > 0) {
        const injected = JSON.stringify(popupResults);
        enrichedPersonalHtml = personalResult.html + `\n<!-- POPUP_CREW_DATA:${injected} -->`;
      }
    }
  }

  // Step 5: Done fetching
  onProgress({ step: 'parsing', message: getStepMessage('parsing') });

  return {
    personalHtml: enrichedPersonalHtml,
    deptHtml,
  };
}

// Parse HTML using browser's DOMParser (client-side only)
export function parseWithDOMParser(html: string): {
  tables: Array<{
    id: string;
    rows: string[][];
    headerRow: string[];
  }>;
  textContent: string;
  title: string;
  forms: Array<{ action: string; inputs: Record<string, string> }>;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Extract title
  const title = doc.title || '';

  // Extract all tables
  const tables: Array<{
    id: string;
    rows: string[][];
    headerRow: string[];
  }> = [];

  doc.querySelectorAll('table').forEach((table, idx) => {
    const rows: string[][] = [];
    let headerRow: string[] = [];

    table.querySelectorAll('tr').forEach((tr, rowIdx) => {
      const cells: string[] = [];
      tr.querySelectorAll('td, th').forEach(cell => {
        cells.push((cell as HTMLElement).innerText?.trim() || cell.textContent?.trim() || '');
      });

      if (rowIdx === 0 || tr.querySelector('th')) {
        headerRow = cells;
      }
      if (cells.length > 0) {
        rows.push(cells);
      }
    });

    tables.push({
      id: table.id || `table-${idx}`,
      rows,
      headerRow,
    });
  });

  // Extract forms (to find department view params)
  const forms: Array<{ action: string; inputs: Record<string, string> }> = [];
  doc.querySelectorAll('form').forEach(form => {
    const inputs: Record<string, string> = {};
    form.querySelectorAll('input, select').forEach(input => {
      const el = input as HTMLInputElement;
      if (el.name) {
        inputs[el.name] = el.value || el.type || '';
      }
    });
    forms.push({
      action: (form as HTMLFormElement).action || '',
      inputs,
    });
  });

  // Full text content
  const textContent = doc.body?.textContent?.trim() || '';

  return { tables, textContent, title, forms };
}
