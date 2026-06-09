const fs = require('fs');
const file = 'scripts/fetch-schedules.js';
let source = fs.readFileSync(file, 'utf8');
const before = `    const mergedCrewByName = new Map();
    for (const member of [...existingCrewList, ...crewList]) {
      const key = normalizeName(member.name || '');
      if (key) mergedCrewByName.set(key, member);
    }
    const mergedCrewList = Array.from(mergedCrewByName.values());`;
const after = `    const hasAuthoritativeDepartmentCrew =
      !prod.departmentEnriched
      && existingGlobal.crewSource === 'department'
      && existingCrewList.length > 0;
    const globalCrewCandidates = hasAuthoritativeDepartmentCrew
      ? existingCrewList
      : [...existingCrewList, ...crewList];
    const mergedCrewByName = new Map();
    for (const member of globalCrewCandidates) {
      const key = normalizeName(member.name || '');
      if (key) mergedCrewByName.set(key, member);
    }
    const mergedCrewList = Array.from(mergedCrewByName.values());`;
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Could not patch authoritative crew protection');
  source = source.replace(before, after);
}
const globalMarker = `      herzliyaId: prod.herzliyaId,
      crew_list: mergedCrewList,`;
const globalReplacement = `      herzliyaId: prod.herzliyaId,
      crewSource: prod.departmentEnriched
        ? 'department'
        : existingGlobal.crewSource || (prod.popupParsed ? 'popup' : 'fallback'),
      crew_list: mergedCrewList,`;
if (!source.includes(globalReplacement)) {
  if (!source.includes(globalMarker)) throw new Error('Could not persist global crew source');
  source = source.replace(globalMarker, globalReplacement);
}
if (!source.includes('hasAuthoritativeDepartmentCrew')) throw new Error('Protection patch failed');
fs.writeFileSync(file, source);
const footer = 'src/components/Footer.tsx';
const footerSource = fs.readFileSync(footer, 'utf8').replace(/v2\.8\.\d+/, 'v2.8.97');
if (!footerSource.includes('v2.8.97')) throw new Error('Footer version update failed');
fs.writeFileSync(footer, footerSource);
