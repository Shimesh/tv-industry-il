/**
 * Full pipeline simulation for studio extraction.
 * Run: node scripts/test-pipeline.mjs
 */

// ─── Mock popup HTML (exact format from the Herzliya ShowCrew popup) ───────────
const POPUP_HTML = `<!DOCTYPE html>
<html>
<head><title>ShowCrew</title></head>
<body>
<div class="modal-body">
<table>
<tr>
<td>אסתטיקה 360</td>
<td>אולפן 4</td>
<td>01/06/2026</td>
<td>17:45 - 10:30</td>
</tr>
</table>
<table>
<tr><th>שעות</th><th>תפקיד</th><th>שם</th><th>פרטים</th><th>נייד</th></tr>
<tr><td>10:30-17:45</td><td>צלם</td><td>ירון אורבך</td><td></td><td>0501234567</td></tr>
<tr><td>10:30-17:45</td><td>במאי</td><td>דוד כהן</td><td></td><td>0509876543</td></tr>
</table>
</div>
</body>
</html>`;

// ─── Mock main calendar HTML ─────────────────────────────────────────────────
const MAIN_HTML = `<!DOCTYPE html>
<html dir="rtl">
<body>
<div class="calendar-header">
<table>
<tr><td>01/06/2026</td><td>02/06/2026</td><td>03/06/2026</td><td>04/06/2026</td><td>05/06/2026</td><td>06/06/2026</td><td>07/06/2026</td></tr>
</table>
</div>
<div class="calendar-body">
<div class="day-cell">
<a href="#" onclick="openmd2(99999)"><font color="red">אסתטיקה 360 אולפן 4</font></a>
<br>10:30-17:45<br>
</div>
</div>
</body>
</html>`;

// ─── Inline the parser functions (no TypeScript imports needed) ───────────────

function parsePopupHeader(html) {
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      const cellText = tdMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cellText) cells.push(cellText);
    }
    const dateIdx = cells.findIndex(c => /\d{1,2}\/\d{1,2}\/\d{4}/.test(c));
    if (dateIdx >= 2) {
      const dm = cells[dateIdx].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dm) return {
        studio: cells[dateIdx - 1],
        isoDate: `${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`,
        allCells: cells,
      };
    }
  }
  return null;
}

function stripPopupHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<\/th>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractStudioFromPopup(html) {
  if (!html) return '';
  const header = parsePopupHeader(html);
  if (header?.studio) return header.studio;

  const text = stripPopupHtml(html);

  const numberedStudio = text.match(/(?:אולפן|סטודיו|studio)\s*\d+\w?/i);
  if (numberedStudio) return numberedStudio[0].trim();

  for (const line of text.split('\n')) {
    const parts = line.split('\t').map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const labelIdx = parts.findIndex(p => /^(?:אולפן|סטודיו|מיקום|location|studio)$/i.test(p));
    if (labelIdx !== -1 && parts[labelIdx + 1]) return parts[labelIdx + 1];
  }

  for (const line of text.split('\n')) {
    const parts = line.split('\t').map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const dateIdx = parts.findIndex(p => /\d{1,2}\/\d{1,2}\/\d{4}/.test(p));
    if (dateIdx >= 2) {
      const candidate = parts[dateIdx - 1];
      if (!/^[א-ת]{2,5}$/.test(candidate)) return candidate;
    }
  }

  return '';
}

function extractDateFromPopup(html) {
  return parsePopupHeader(html)?.isoDate || '';
}

function extractHerzliyaEventIds(html) {
  const results = [];
  const chunks = html.split(/onclick=["']openmd2\(/);
  for (let i = 1; i < chunks.length; i++) {
    const idMatch = chunks[i].match(/^(\d+)\)/);
    if (!idMatch) continue;
    const herzliyaId = parseInt(idMatch[1]);
    const nameMatch = chunks[i].match(/<font[^>]*color=["']?red["']?[^>]*>(.*?)<\/font>/i);
    const name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    if (herzliyaId && name) results.push({ herzliyaId, name });
  }
  return results;
}

function generateProductionId(name, date, studio) {
  const key = `${name}::${date}::${studio}`.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ─── SIMULATION ───────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════');
console.log('  PIPELINE SIMULATION — Studio Extraction & ID Matching');
console.log('═══════════════════════════════════════════════════════\n');

// Step 1: parsePopupHeader
console.log('STEP 1: parsePopupHeader');
const header = parsePopupHeader(POPUP_HTML);
console.log('  result:', JSON.stringify(header));
console.log();

// Step 2: extractStudioFromPopup
console.log('STEP 2: extractStudioFromPopup');
const studio = extractStudioFromPopup(POPUP_HTML);
const date = extractDateFromPopup(POPUP_HTML);
console.log('  studio:', JSON.stringify(studio));
console.log('  date:', JSON.stringify(date));
console.log();

// Step 3: extractHerzliyaEventIds from main HTML
console.log('STEP 3: extractHerzliyaEventIds from main HTML');
const events = extractHerzliyaEventIds(MAIN_HTML);
console.log('  events:', JSON.stringify(events));
console.log();

// Step 4: Simulate herzliyaSync "build from popup" path
console.log('STEP 4: Simulate herzliyaSync "build from popup" path');
const productions = [];
const seenIds = new Set();
for (const event of events) {
  if (seenIds.has(event.herzliyaId)) continue;
  seenIds.add(event.herzliyaId);
  // Simulate popupCache hit
  const popupHtml = POPUP_HTML; // in real code this comes from fetch
  const popupDate = extractDateFromPopup(popupHtml);
  if (!popupDate) { console.log('  SKIP: no date from popup'); continue; }
  const popupStudio = extractStudioFromPopup(popupHtml);
  const studioM = event.name.match(/(?:אולפן|סטודיו|studio|st\.?)\s*\d+\w?/i);
  const studioVal = popupStudio || (studioM ? studioM[0].trim() : '');
  const name = studioM ? event.name.replace(studioM[0], '').replace(/\s{2,}/g, ' ').trim() : event.name;
  productions.push({
    id: String(event.herzliyaId),
    name,
    studio: studioVal,
    date: popupDate,
    herzliyaId: event.herzliyaId,
  });
}
console.log('  productions built from popup:', JSON.stringify(productions, null, 2));
console.log();

// Step 5: Simulate ID after enrich path
console.log('STEP 5: Final production IDs');
const finalProds = productions.map(prod => ({
  ...prod,
  id: prod.herzliyaId ? String(prod.herzliyaId) : generateProductionId(prod.name, prod.date, prod.studio),
}));
console.log('  final IDs:', finalProds.map(p => `${p.name} → id="${p.id}" studio="${p.studio}"`).join('\n  '));
console.log();

// Step 6: Simulate what GitHub Action saves (personal path)
console.log('STEP 6: GitHub Action personal production (simulated)');
const personalProd = {
  id: '99999',  // herzliyaId used as Firestore doc ID
  name: 'אסתטיקה 360',
  studio: '',  // GitHub Action might not extract if not in name
  herzliyaId: 99999,
};
console.log('  personal prod:', JSON.stringify(personalProd));
console.log();

// Step 7: mergeGlobalProductions simulation
console.log('STEP 7: mergeGlobalProductions');
const globalById = new Map(finalProds.map(p => [p.id, p]));
const userProds = [personalProd];
const enriched = userProds.map(p => {
  const g = p.id ? globalById.get(p.id) : undefined;
  if (!g) {
    console.log(`  NO MATCH for id="${p.id}" — studio stays empty`);
    return p;
  }
  console.log(`  MATCH found for id="${p.id}" — enriching studio: "" → "${g.studio}"`);
  return { ...p, studio: p.studio || g.studio || '' };
});
console.log('  enriched:', JSON.stringify(enriched, null, 2));
console.log();

// Step 8: Verify popup HTML structure edge cases
console.log('STEP 8: Edge case — popup with <tbody>');
const popupWithTbody = POPUP_HTML.replace('<table>', '<table><tbody>').replace('</table>', '</tbody></table>');
console.log('  studio with tbody:', extractStudioFromPopup(popupWithTbody));

console.log('\nStep 9: Edge case — popup with extra whitespace in td');
const popupWhitespace = POPUP_HTML.replace('<td>אולפן 4</td>', '<td>\n  אולפן 4\n  </td>');
console.log('  studio with whitespace:', extractStudioFromPopup(popupWhitespace));

console.log('\nStep 10: Edge case — popup with NO content in first cell');
const popupEmptyFirst = `<html><body><table><tr><td>&nbsp;</td><td>אולפן 4</td><td>01/06/2026</td><td>17:45</td></tr></table></body></html>`;
const headerEmpty = parsePopupHeader(popupEmptyFirst);
console.log('  cells (first empty):', headerEmpty);

console.log('\n═══════════════════════════════════════════════════════');
console.log('  KEY FINDING: IDs match:', finalProds[0]?.id === personalProd.id ? '✓ YES' : `✗ NO (global="${finalProds[0]?.id}" personal="${personalProd.id}")`);
console.log('  Studio extracted:', studio ? `✓ "${studio}"` : '✗ EMPTY');
console.log('═══════════════════════════════════════════════════════');
