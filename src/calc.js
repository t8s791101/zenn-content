// 年齢・学年・干支・和暦の計算（ブラウザとNodeの両方で使う）
(function (root) {
  const ERAS = [
    // [元号, 開始日（この日から）]
    ['令和', '2019-05-01'],
    ['平成', '1989-01-08'],
    ['昭和', '1926-12-25'],
    ['大正', '1912-07-30'],
    ['明治', '1868-10-23'],
  ];
  const KAN = '甲乙丙丁戊己庚辛壬癸';
  const SHI = '子丑寅卯辰巳午未申酉戌亥';
  const ANIMAL = ['ねずみ', 'うし', 'とら', 'うさぎ', 'たつ', 'へび', 'うま', 'ひつじ', 'さる', 'とり', 'いぬ', 'いのしし'];

  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

  // 日付の和暦（例: 1989-01-07 → 昭和64年）
  function wareki(y, m, d) {
    const s = iso(y, m, d);
    for (const [name, start] of ERAS) {
      if (s >= start) {
        const n = y - Number(start.slice(0, 4)) + 1;
        return `${name}${n === 1 ? '元' : n}年`;
      }
    }
    return null;
  }

  // 年の和暦（改元の年は2つ）
  function warekiOfYear(y) {
    const a = wareki(y, 1, 1), b = wareki(y, 12, 31);
    return a === b ? [a] : [a, b];
  }

  // 干支（年の1月1日で区切る一般的な数え方）
  function eto(y) {
    const k = ((y - 4) % 10 + 10) % 10, s = ((y - 4) % 12 + 12) % 12;
    return { kanshi: KAN[k] + SHI[s], shi: SHI[s], animal: ANIMAL[s] };
  }

  // 満年齢（誕生日の当日に1つ増える。2/29生まれは平年は3/1）
  function age(by, bm, bd, ty, tm, td) {
    let a = ty - by;
    if (tm < bm || (tm === bm && td < bd)) a--;
    return a;
  }

  // 早生まれ（1/1〜4/1生まれ）
  const isEarly = (m, d) => m < 4 || (m === 4 && d === 1);

  // 学校の入学・卒業年（日本の学年は4/2生まれ〜翌4/1生まれで1学年）
  function school(by, bm, bd) {
    const s = by + (isEarly(bm, bd) ? 6 : 7); // 小学校入学の年（4月）
    return {
      early: isEarly(bm, bd),
      kindergarten: s - 3, // 幼稚園（3年保育）入園
      elementaryIn: s, elementaryOut: s + 6,
      juniorIn: s + 6, juniorOut: s + 9,
      highIn: s + 9, highOut: s + 12,
      univIn: s + 12, univOut: s + 16,
      twenty: s + 14, // 二十歳を祝う式典（多くの自治体は1月開催）
    };
  }

  // 長寿祝い（数え年で祝う場合の西暦年＝生まれ年＋数え年−1。還暦は満60と同じ）
  const CHOJU = [['還暦', 61], ['古希', 70], ['喜寿', 77], ['傘寿', 80], ['米寿', 88], ['卒寿', 90], ['白寿', 99], ['百寿', 100]];
  const choju = by => CHOJU.map(([name, kazoe]) => ({ name, kazoe, year: by + kazoe - 1 }));

  // 数え年（生まれた年を1歳、元日ごとに1つ増える）
  const kazoe = (by, ty) => ty - by + 1;

  // 年齢から生まれ年（誕生日前後の2通り）
  const birthYearsFromAge = (a, ty) => ({ afterBirthday: ty - a, beforeBirthday: ty - a - 1 });

  const api = { wareki, warekiOfYear, eto, age, isEarly, school, choju, kazoe, birthYearsFromAge };
  if (typeof module !== 'undefined') module.exports = api; else root.Calc = api;
})(this);
