// 리플레이 위치 추정 홀드아웃 평가기 (개발용 · site/ 밖이라 배포 안 됨)
//
// 전투 스냅샷(c)의 1/4 을 숨기고, 엔진이 그 시각에 추정한 위치와의 거리(타일)를 잰다.
// 4번 돌려(숨기는 자리를 바꿔 가며) 모든 스냅샷을 한 번씩 정답으로 쓴다.
// 스냅샷 간격이 약 15초라 «앵커 사이 한가운데» 의 오차를 재는 셈이다.
//
// 준비: 예제 리플레이를 추출기로 JSON 으로 뽑아 한 폴더에 둔다.
//   python -I -c "import sys; sys.path.insert(0,'<py 폴더>'); import browser_extract; \
//     open('out/x.json','w').write(browser_extract.extract('site/replay/samples/x.StormReplay'))"
// 사용: node tools/replay_holdout.js <json 폴더> [engine.js]   (VERBOSE=1 이면 전장별)
//
// 2026-10 기준 (표본 8판 · 1,803점)
//   옛 엔진 + 옛 추출                       평균 5.40 · 중앙 3.36 · p95 16.10
//   끌기 이동(SCmdUpdateTargetPoint) 반영    평균 4.34 · 중앙 2.75 · p95  9.87
//   + 이속 6.0                               평균 4.22 · 중앙 2.83 · p95  9.38
//   + 귀환석(6초 채널 → 본진)                평균 3.88 · 중앙 2.79 · p95  9.22
//   + 부활 직후 순간이동(머키 알, 카메라 확인) 평균 3.84
//   + 유닛 대상 명령 멈춤 6                  평균 3.53
//   + 땅 어택무브 멈춤 5                     평균 3.40
//   + 일반 이동 멈춤 2                       평균 3.26 · 중앙 2.14 · p95  8.49
//   해 봤지만 넣지 않은 것: 카메라 중심 약한 당김(−0.6%), 막타 앵커(−0.6%),
//   탈것 이속 흉내(고정 6.0 보다 못함), 전투 중 걷기·밖에서 빠르게(−1%),
//   영웅별 공격 사거리로 멈춤(고정값보다 −1.4%), 부활 제한 없는 순간이동 감지(오탐으로 ±0).
//   8판으로는 잡음과 구별이 안 된다.
//
// 오차를 어디서 잃는지 볼 때: 숨긴 점마다 «추정이 마지막 명령 목적지에 이미 닿았나 /
// 실제는 닿았나» 로 나누면 어디를 고칠지 바로 보인다 (멈춤 거리는 그렇게 찾았다).
const fs = require('fs'), vm = require('vm'), path = require('path');
const JS = path.join(__dirname, '..', 'site', 'replay', 'js') + path.sep;
const dir = process.argv[2];
const engineFile = process.argv[3] || JS + 'engine.js';
if (!dir) { console.error('사용: node tools/replay_holdout.js <json 폴더> [engine.js]'); process.exit(2); }
const FOLDS = 4;

const ctx = { console, Math, Map, Float32Array, Uint8Array, Int32Array,
              atob: s => Buffer.from(s, 'base64').toString('binary') };
vm.createContext(ctx);
for (const f of ['data_maps.js', 'data_pathing.js', 'pathing.js'])
  vm.runInContext(fs.readFileSync(JS + f, 'utf8'), ctx, { filename: f });
vm.runInContext(fs.readFileSync(engineFile, 'utf8') + '\n;this.__prepare=prepare;this.__posAt=posAt;',
                ctx, { filename: 'engine' });
vm.runInContext('this.__maps=MAP_DB; this.__load=loadPathing;', ctx);

const errs = [], perMap = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const mm = ctx.__maps.find(m => m.ko === raw.map || m.en === raw.map);
  if (mm) ctx.__load(mm.slug, mm.W, mm.H); else ctx.__load('', 0, 0);
  const me = [];
  for (let fold = 0; fold < FOLDS; fold++) {
    const r2 = JSON.parse(JSON.stringify(raw));
    const hidden = {};
    for (const lab in r2.hero_position_tracks) {
      let ci = 0; const keep = [], hid = [];
      for (const p of r2.hero_position_tracks[lab]) {
        // 첫 스냅샷은 숨기지 않는다 (시작 위치가 없어진다)
        if (p[3] === 'c' && ci++ % FOLDS === fold && ci > 1) { hid.push(p); continue; }
        keep.push(p);
      }
      r2.hero_position_tracks[lab] = keep;
      hidden[lab] = hid;
    }
    const G = ctx.__prepare(r2);
    for (const lab in hidden) {
      const h = G.heroes[lab]; if (!h) continue;
      for (const p of hidden[lab]) {
        const q = ctx.__posAt(h, p[0]);
        if (!q || q.dead) continue;
        const e = Math.hypot(q.x - p[1], q.y - p[2]);
        errs.push(e); me.push(e);
      }
    }
  }
  perMap[f] = me;
}
const st = a => {
  const s = [...a].sort((x, y) => x - y), m = s.reduce((x, y) => x + y, 0) / s.length;
  return `n=${s.length} 평균 ${m.toFixed(3)} 중앙 ${s[s.length >> 1].toFixed(2)} p95 ${s[Math.floor(s.length * 0.95)].toFixed(2)}`;
};
if (process.env.VERBOSE) for (const k in perMap) console.log(k.padEnd(28), st(perMap[k]));
console.log('전체', st(errs));
