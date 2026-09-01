const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..', 'appscript', 'src', 'UI');
const port = Number(process.env.ATLAS_TOOLING_PREVIEW_PORT || 4188);
const design = (fs.readFileSync(path.join(root, 'AtlasDesignSystem.html'), 'utf8').match(/<style id="atlas-design-system">([\s\S]*?)<\/style>/) || [])[1] || '';
const source = fs.readFileSync(path.join(root, 'ToolingWorkspace.html'), 'utf8')
  .replace(/<\?!= includeAtlasUi_\('UI\/AtlasDesignSystem'\) \?>/, `<style>${design}</style>`)
  .replace(/<\?!= includeAtlasUi_\('UI\/NavigationFrame'\) \?>/, '');

function model(state) {
  const fixture = {
    nominal: { condition: 'NEW', actual: 0.5, verification: 'VERIFIED', preflight: 'READY', reasons: ['Physical tool, holder, machine pocket, and verified geometry match the operation.'], holder: true },
    regrind: { condition: 'REGROUND', actual: 0.4975, verification: 'VERIFIED', preflight: 'BLOCKED', reasons: ['ACTUAL diameter is 0.0025 in below CAM expectation and exceeds the operation tolerance.', 'Use the verified ACTUAL geometry or assign a conforming tool before run.'], holder: true },
    unverified: { condition: 'REGROUND', actual: null, verification: 'UNVERIFIED', preflight: 'UNVERIFIED', reasons: ['REGROUND tooling requires verified ACTUAL geometry before precision CAM work.'], holder: true },
    blocked: { condition: 'DAMAGED', actual: 0.4981, verification: 'VERIFIED', preflight: 'BLOCKED', reasons: ['The physical cutter is damaged and cannot run this operation.'], holder: true },
    holder: { condition: 'USED', actual: 0.4998, verification: 'VERIFIED', preflight: 'WARNING', reasons: ['ACTUAL geometry differs from nominal but remains within operation policy.'], holder: true },
    empty: { condition: 'USED', actual: 0.4998, verification: 'VERIFIED', preflight: 'NOT_ASSIGNED', reasons: ['The scanned holder has no active cutter assembly.'], holder: false },
    quarantined: { condition: 'QUARANTINED', actual: 0.4975, verification: 'STALE', preflight: 'BLOCKED', reasons: ['The physical cutter is quarantined and cannot run this operation.'], holder: true },
    stale: { condition: 'MODIFIED', actual: 0.4975, verification: 'STALE', preflight: 'STALE', reasons: ['Verified geometry is older than operation policy allows.'], holder: true }
  }[state] || null;
  if (!fixture) return null;
  const id = 'TOOL-33333333-3333-4333-8333-333333333333';
  return {
    selectedId: id,
    results: [{ id, description: '1/2 in carbide end mill', condition: fixture.condition, location: fixture.holder ? 'Haas VF-4 / T12' : 'Tool crib A-14' }, { id: 'TOOL-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', description: '1/4 in carbide end mill', condition: 'USED', location: 'Tool crib B-03' }],
    tool: { id, description: '1/2 in carbide end mill · Nanoverse 8767-00 fixture', nominalDiameter: 0.5, actualDiameter: fixture.actual, unitLabel: 'in', condition: fixture.condition, verificationStatus: fixture.verification, measurementAge: fixture.actual == null ? '' : 'measured 1 hour ago' },
    assembly: fixture.holder ? { id: 'TOOL-ASM-55555555-5555-4555-8555-555555555555', holderId: 'HOLDER-44444444-4444-4444-8444-444444444444', machine: 'Haas VF-4', pocket: 'T12', state: 'ACTIVE / VERIFIED' } : { state: 'EMPTY' },
    operation: { reference: '8767-00 · OP2 · 2D CONTOUR', expectedDiameter: 0.5, radialStockToLeave: 0.004 },
    preflight: { state: fixture.preflight, ready: ['READY', 'WARNING'].includes(fixture.preflight), reasons: fixture.reasons }
  };
}

function mockScript(state, fail) {
  const data = JSON.stringify(model(state));
  return `<script>var __toolingData=${data};var __toolingFail=${fail ? 'true' : 'false'};var google={script:{run:{ok:null,bad:null,withSuccessHandler:function(f){this.ok=f;return this;},withFailureHandler:function(f){this.bad=f;return this;},getToolingWorkspace:function(){var ok=this.ok,bad=this.bad;setTimeout(function(){__toolingFail?bad({message:'Unavailable'}):ok({ok:true,data:__toolingData});},40);},getToolingDetail:function(){var ok=this.ok,bad=this.bad;setTimeout(function(){__toolingFail?bad({message:'Unavailable'}):ok({ok:true,data:__toolingData});},40);}}}};<\/script>`;
}

http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname !== '/') { response.writeHead(404); response.end('Not found'); return; }
  const state = url.searchParams.get('state') || 'nominal';
  const fail = state === 'unavailable' || state === 'error';
  const html = source.replace('</head>', `${mockScript(state, fail)}</head>`);
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
}).listen(port, '127.0.0.1', () => console.log(`Atlas Tooling preview: http://127.0.0.1:${port}`));
