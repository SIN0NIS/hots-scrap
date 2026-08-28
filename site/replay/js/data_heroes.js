// 영웅 90명 — 미니맵 아이콘 파일과 한국어/영어 이름.
// 아이콘 파일명은 게임 내부 이름이라 영웅 이름과 다른 것이 있다
// (예: demonhunter=발라, wizard=리밍, warfield=해머 상사, nexus2=키히라).
// 한국어 이름은 게임 데이터(gamestrings ko-KR) 공식 표기를 따른다.
/* 역할군 — 게임 데이터의 expandedRole. 고르는 차례대로 늘어놓는다. */
const HERO_ROLES = ['전사','투사','치유사','지원가','근접 암살자','원거리 암살자'];
const HERO_DB = [
  {icon:"storm_ui_minimapicon_heros_infestor.png",      ko:"아바투르",        en:"Abathur", role:"지원가"},
  {icon:"storm_ui_minimapicon_alarak.png",              ko:"알라라크",        en:"Alarak", role:"근접 암살자"},
  {icon:"storm_ui_minimapicon_alexstrasza.png",         ko:"알렉스트라자",    en:"Alexstrasza", role:"치유사"},
  {icon:"storm_ui_minimapicon_ana.png",                 ko:"아나",            en:"Ana", role:"치유사"},
  {icon:"storm_ui_minimapicon_anduin.png",              ko:"안두인",          en:"Anduin", role:"치유사"},
  {icon:"storm_ui_minimapicon_anubarak.png",            ko:"아눕아락",        en:"Anub'arak", role:"전사"},
  {icon:"storm_ui_minimapicon_artanis.png",             ko:"아르타니스",      en:"Artanis", role:"투사"},
  {icon:"storm_ui_minimapicon_arthas.png",              ko:"아서스",          en:"Arthas", role:"전사"},
  {icon:"storm_ui_minimapicon_auriel.png",              ko:"아우리엘",        en:"Auriel", role:"치유사"},
  {icon:"storm_ui_minimapicon_heros_azmodan.png",       ko:"아즈모단",        en:"Azmodan", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_firebat.png",             ko:"블레이즈",        en:"Blaze", role:"전사"},
  {icon:"storm_ui_minimapicon_heros_faeriedragon.png",  ko:"빛나래",          en:"Brightwing", role:"치유사"},
  {icon:"storm_ui_minimapicon_d2amazonf.png",           ko:"카시아",          en:"Cassia", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_heros_chen.png",          ko:"첸",              en:"Chen", role:"투사"},
  {icon:"storm_ui_minimapicon_cho.png",                 ko:"초",              en:"Cho", role:"전사"},
  {icon:"storm_ui_minimapicon_chromie.png",             ko:"크로미",          en:"Chromie", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_deathwing.png",           ko:"데스윙",          en:"Deathwing", role:"투사"},
  {icon:"storm_ui_minimapicon_deckard.png",             ko:"데커드",          en:"Deckard", role:"치유사"},
  {icon:"storm_ui_minimapicon_dehaka.png",              ko:"데하카",          en:"Dehaka", role:"투사"},
  {icon:"storm_ui_minimapicon_heros_diablo.png",        ko:"디아블로",        en:"Diablo", role:"전사"},
  {icon:"storm_ui_minimapicon_dva_mech.png",            ko:"D.Va",            en:"D.Va", role:"투사"},
  {icon:"storm_ui_minimapicon_etc.png",                 ko:"정예 타우렌 족장", en:"E.T.C.", role:"전사"},
  {icon:"storm_ui_minimapicon_gryphon_rider.png",       ko:"폴스타트",        en:"Falstad", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_fenix.png",               ko:"피닉스",          en:"Fenix", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_gall.png",                ko:"갈",              en:"Gall", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_garrosh.png",             ko:"가로쉬",          en:"Garrosh", role:"전사"},
  {icon:"storm_ui_minimapicon_heros_gazlowe.png",       ko:"가즈로",          en:"Gazlowe", role:"투사"},
  {icon:"storm_ui_minimapicon_genji.png",               ko:"겐지",            en:"Genji", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_genngreymane.png",        ko:"그레이메인",      en:"Greymane", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_guldan.png",              ko:"굴단",            en:"Gul'dan", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_hanzo.png",               ko:"한조",            en:"Hanzo", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_hogger.png",              ko:"들창코",          en:"Hogger", role:"투사"},
  {icon:"storm_ui_minimapicon_illidan.png",             ko:"일리단",          en:"Illidan", role:"근접 암살자"},
  {icon:"storm_ui_minimapicon_imperius.png",            ko:"임페리우스",      en:"Imperius", role:"투사"},
  {icon:"storm_ui_minimapicon_heros_jaina.png",         ko:"제이나",          en:"Jaina", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_heros_johanna.png",       ko:"요한나",          en:"Johanna", role:"전사"},
  {icon:"storm_ui_minimapicon_junkrat.png",             ko:"정크랫",          en:"Junkrat", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_heros_kaelthas.png",      ko:"캘타스",          en:"Kael'thas", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_kelthuzad.png",           ko:"켈투자드",        en:"Kel'Thuzad", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_kerrigan.png",            ko:"케리건",          en:"Kerrigan", role:"근접 암살자"},
  {icon:"storm_ui_minimapicon_monk.png",                ko:"카라짐",          en:"Kharazim", role:"치유사"},
  {icon:"storm_ui_minimapicon_leoric.png",              ko:"레오릭",          en:"Leoric", role:"투사"},
  {icon:"storm_ui_minimapicon_heros_lili.png",          ko:"리 리",           en:"Li Li", role:"치유사"},
  {icon:"storm_ui_minimapicon_wizard.png",              ko:"리밍",            en:"Li-Ming", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_medic.png",               ko:"모랄레스 중위",   en:"Lt. Morales", role:"치유사"},
  {icon:"storm_ui_minimapicon_lucio.png",               ko:"루시우",          en:"Lúcio", role:"치유사"},
  {icon:"storm_ui_minimapicon_lunara.png",              ko:"루나라",          en:"Lunara", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_maiev.png",               ko:"마이에브",        en:"Maiev", role:"근접 암살자"},
  {icon:"storm_ui_minimapicon_malganis.png",            ko:"말가니스",        en:"Mal'Ganis", role:"전사"},
  {icon:"storm_ui_minimapicon_heros_malfurion.png",     ko:"말퓨리온",        en:"Malfurion", role:"치유사"},
  {icon:"storm_ui_minimapicon_malthael.png",            ko:"말티엘",          en:"Malthael", role:"투사"},
  {icon:"storm_ui_minimapicon_medivh.png",              ko:"메디브",          en:"Medivh", role:"지원가"},
  {icon:"storm_ui_minimapicon_meiow.png",               ko:"메이",            en:"Mei", role:"전사"},
  {icon:"storm_ui_minimapicon_mephisto.png",            ko:"메피스토",        en:"Mephisto", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_muradin.png",             ko:"무라딘",          en:"Muradin", role:"전사"},
  {icon:"storm_ui_minimapicon_heros_murky.png",         ko:"머키",            en:"Murky", role:"근접 암살자"},
  {icon:"storm_ui_minimapicon_witchdoctor.png",         ko:"나지보",          en:"Nazeebo", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_nova.png",                ko:"노바",            en:"Nova", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_orphea.png",              ko:"오르피아",        en:"Orphea", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_probius.png",             ko:"프로비우스",      en:"Probius", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_nexus2.png",              ko:"키히라",          en:"Qhira", role:"근접 암살자"},
  {icon:"storm_ui_minimapicon_ragnaros.png",            ko:"라그나로스",      en:"Ragnaros", role:"투사"},
  {icon:"storm_ui_minimapicon_raynor.png",              ko:"레이너",          en:"Raynor", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_rehgar.png",              ko:"레가르",          en:"Rehgar", role:"치유사"},
  {icon:"storm_ui_minimapicon_heros_rexxar.png",        ko:"렉사르",          en:"Rexxar", role:"투사"},
  {icon:"storm_ui_minimapicon_samuro.png",              ko:"사무로",          en:"Samuro", role:"근접 암살자"},
  {icon:"storm_ui_minimapicon_warfield.png",            ko:"해머 상사",       en:"Sgt. Hammer", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_heros_femalebarbarian.png",ko:"소냐",           en:"Sonya", role:"투사"},
  {icon:"storm_ui_minimapicon_heros_stitches.png",      ko:"누더기",          en:"Stitches", role:"전사"},
  {icon:"storm_ui_minimapicon_stukov.png",              ko:"스투코프",        en:"Stukov", role:"치유사"},
  {icon:"storm_ui_minimapicon_sylvanas.png",            ko:"실바나스",        en:"Sylvanas", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_tassadar.png",            ko:"태사다르",        en:"Tassadar", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_butcher.png",             ko:"도살자",          en:"The Butcher", role:"근접 암살자"},
  {icon:"storm_ui_minimapicon_heros_erik.png",          ko:"길 잃은 바이킹",  en:"The Lost Vikings", role:"지원가"},
  {icon:"storm_ui_minimapicon_thrall.png",              ko:"스랄",            en:"Thrall", role:"투사"},
  {icon:"storm_ui_minimapicon_tracer.png",              ko:"트레이서",        en:"Tracer", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_tychus.png",              ko:"타이커스",        en:"Tychus", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_heros_tyrael.png",        ko:"티리엘",          en:"Tyrael", role:"전사"},
  {icon:"storm_ui_minimapicon_heros_tyrande.png",       ko:"티란데",          en:"Tyrande", role:"치유사"},
  {icon:"storm_ui_minimapicon_uther.png",               ko:"우서",            en:"Uther", role:"치유사"},
  {icon:"storm_ui_minimapicon_valeera.png",             ko:"발리라",          en:"Valeera", role:"근접 암살자"},
  {icon:"storm_ui_minimapicon_demonhunter.png",         ko:"발라",            en:"Valla", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_varian.png",              ko:"바리안",          en:"Varian", role:"투사"},
  {icon:"storm_ui_minimapicon_whitemane.png",           ko:"화이트메인",      en:"Whitemane", role:"치유사"},
  {icon:"storm_ui_minimapicon_necromancer.png",         ko:"줄",              en:"Xul", role:"투사"},
  {icon:"storm_ui_minimapicon_yrel.png",                ko:"이렐",            en:"Yrel", role:"투사"},
  {icon:"storm_ui_minimapicon_zagara.png",              ko:"자가라",          en:"Zagara", role:"원거리 암살자"},
  {icon:"storm_ui_minimapicon_zarya.png",               ko:"자리야",          en:"Zarya", role:"지원가"},
  {icon:"storm_ui_minimapicon_zeratul.png",             ko:"제라툴",          en:"Zeratul", role:"근접 암살자"},
  {icon:"storm_ui_minimapicon_zuljin.png",              ko:"줄진",            en:"Zul'jin", role:"원거리 암살자"},
];

// 이름 비교용 정규화: 소문자, 발음 구별 기호·공백·문장부호 제거, 앞의 the 제거.
// (리플레이의 영웅 이름 표기가 클라이언트 언어·판본에 따라 조금씩 달라서 필요하다)
// 주의: NFD 는 한글 음절도 자모로 분해하므로, 분음 기호를 떼어낸 뒤 반드시
// NFC 로 되돌려야 [가-힣] 필터에서 한글이 살아남는다 (Lúcio→lucio 는 유지).
function heroNorm(s){
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').normalize('NFC')
    .toLowerCase().replace(/[^a-z0-9가-힣]/g,'').replace(/^the/,'');
}
const HERO_LOOKUP = {};   // 정규화된 이름 -> HERO_DB 항목
for(const h of HERO_DB){
  HERO_LOOKUP[heroNorm(h.ko)] = h;
  HERO_LOOKUP[heroNorm(h.en)] = h;
}
// 자주 쓰는 별칭·옛 표기
for(const [alias, en] of [
  ["Lost Vikings","The Lost Vikings"], ["ETC","E.T.C."], ["Morales","Lt. Morales"],
  ["Sgt Hammer","Sgt. Hammer"], ["Hammer","Sgt. Hammer"], ["Butcher","The Butcher"],
  ["Cho'gall","Cho"], ["초갈","Cho"], ["잃어버린 바이킹","The Lost Vikings"],
  ["디바","D.Va"], ["말타엘","Malthael"], ["키라","Qhira"],
]){
  const h = HERO_DB.find(x=>x.en===en);
  if(h) HERO_LOOKUP[heroNorm(alias)] = h;
}
function heroByName(name){ return HERO_LOOKUP[heroNorm(name)] || null; }
