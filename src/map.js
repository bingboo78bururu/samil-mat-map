// 약도 — 좌표로 직접 그리는 위치 개요도. 실제 지도 서비스가 아닙니다.
//
// 지도 제공자는 카카오맵으로 정해졌지만 API 키 발급 전이라, 그 전까지 쓰는 화면입니다.
// 카카오맵을 붙일 때는 이 파일의 mapPanel()만 교체하면 됩니다.
//
// 원칙: 좌표가 없는 식당은 '위치 확인 중'으로 두고 목록에만 남깁니다.
//       임의 좌표를 만들지 않습니다(기획안 S1).
import { HQ } from './config.js';
import { esc, walkLabel } from './ui.js';

const W = 280, H = 280, PAD = 18;
const hasCoords = (r) => r.lat != null && r.lng != null;

// 위경도를 본사 기준 미터 좌표로 바꿉니다.
function toMeters(r) {
  const c = Math.cos((HQ.lat * Math.PI) / 180);
  return { x: (r.lng - HQ.lng) * c * 111320, y: (r.lat - HQ.lat) * 110540 };
}

function buildSVG(rows, allRestaurants) {
  // 축척은 본사에서 1.3km 안쪽 식당들을 기준으로 잡습니다.
  // 멀리 떨어진 한 곳 때문에 전체가 쪼그라드는 것을 막기 위해서입니다.
  const near = allRestaurants
    .filter(hasCoords)
    .map(toMeters)
    .filter((p) => Math.hypot(p.x, p.y) <= 1300)
    .concat([{ x: 0, y: 0 }]);

  const minX = Math.min(...near.map((p) => p.x));
  const maxX = Math.max(...near.map((p) => p.x));
  const minY = Math.min(...near.map((p) => p.y));
  const maxY = Math.max(...near.map((p) => p.y));

  const s = Math.min((W - 2 * PAD) / Math.max(maxX - minX, 1), (H - 2 * PAD) / Math.max(maxY - minY, 1));
  const ox = (W - (maxX - minX) * s) / 2;
  const oy = (H - (maxY - minY) * s) / 2;

  const T = (p) => ({ x: ox + (p.x - minX) * s, y: oy + (maxY - p.y) * s });
  const place = (r) => T(toMeters(r));
  const hq = T({ x: 0, y: 0 });

  const ring = (d) =>
    `<circle cx="${hq.x.toFixed(1)}" cy="${hq.y.toFixed(1)}" r="${(d * s).toFixed(1)}" fill="none" stroke="#cdbfae" stroke-dasharray="3 4"/>` +
    `<text x="${(hq.x + d * s * 0.71 + 3).toFixed(1)}" y="${(hq.y + d * s * 0.71 + 10).toFixed(1)}" font-size="9" fill="#8a7b6b">${d >= 1000 ? d / 1000 + 'km' : d + 'm'}</text>`;

  const placed = rows.filter(hasCoords);
  const outside = placed.filter((r) => {
    const p = place(r);
    return p.x < 4 || p.x > W - 4 || p.y < 4 || p.y > H - 4;
  });

  const pins = placed
    .filter((r) => !outside.includes(r))
    .map((r) => {
      const p = place(r);
      return `<g class="pin" data-detail="${esc(r.id)}" tabindex="0" role="button" aria-label="${esc(r.name)} 상세 보기"><title>${esc(r.name)} · ${esc(walkLabel(r))}</title><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="8" fill="transparent"/><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--orange)" stroke="#fff" stroke-width="1.3"/></g>`;
    })
    .join('');

  const svg = `<svg class="map-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="본사 기준 후보 식당 위치 약도"><g>${ring(500)}${ring(1000)}</g>${pins}<rect x="${(hq.x - 6).toFixed(1)}" y="${(hq.y - 6).toFixed(1)}" width="12" height="12" rx="3" fill="var(--ink)" stroke="#fff" stroke-width="1.5"/><text x="${(hq.x - 9).toFixed(1)}" y="${(hq.y + 18).toFixed(1)}" text-anchor="end" font-size="10" font-weight="700" fill="var(--ink)">본사</text><text x="${W - 8}" y="16" text-anchor="end" font-size="9" fill="#8a7b6b">↑ 북</text></svg>`;

  return { svg, outside: outside.length, missing: rows.length - placed.length };
}

export function mapPanel(rows, allRestaurants) {
  const anyCoords = allRestaurants.some(hasCoords);

  // 좌표가 하나도 없으면 약도를 그리지 않습니다. 빈 약도를 보여주지 않습니다.
  if (!anyCoords) {
    return `
      <div class="map-panel">
        <h3>식당 위치 한눈에</h3>
        <p>아직 좌표가 있는 식당이 없어요. 목록에서 확인해 주세요.</p>
        <div class="placeholder">카카오맵 연결 전이에요. 주소를 좌표로 바꾸면 이 자리에 위치가 표시됩니다.</div>
      </div>`;
  }

  const m = buildSVG(rows, allRestaurants);
  return `
    <div class="map-panel">
      <h3>식당 위치 한눈에</h3>
      <p>목록과 같은 후보 ${rows.length}곳을 본사 기준으로 표시해요. 점을 누르면 상세로 이동해요.</p>
      ${m.svg}
      <div class="map-legend">
        <span>■ 본사(한강대로 100)</span>
        <span><b style="color:var(--orange)">●</b> 후보 식당</span>
        <span>점선: 직선 500m·1km</span>
      </div>
      ${m.outside ? `<p class="map-extra">약도 범위 밖 ${m.outside}곳은 목록에서 확인해 주세요.</p>` : ''}
      ${m.missing ? `<p class="map-extra">위치 확인 중 ${m.missing}곳은 목록에만 표시돼요.</p>` : ''}
      <div class="placeholder">약도 · 좌표로 그린 위치 개요도이며 실제 지도 서비스가 아니에요. 카카오맵 연결은 다음 단계입니다.</div>
    </div>`;
}
