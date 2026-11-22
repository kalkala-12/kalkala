/* כלכלת הבית – חישובים (ללא תלות במסך) */
(function (root) {
  'use strict';

  // ---------- תאריכים ----------
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const monthKey = s => s.slice(0, 7);
  const mkIndex = mk => { const [y, m] = mk.split('-').map(Number); return y * 12 + (m - 1); };
  const mkFromIndex = i => Math.floor(i / 12) + '-' + pad(i % 12 + 1);
  const daysIn = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const dateIn = (mk, day) => mk + '-' + pad(Math.min(day, daysIn(mk)));
  const addMonths = (mk, n) => mkFromIndex(mkIndex(mk) + n);
  const num = v => Number(v) || 0;

  const CASH_KINDS = ['bank', 'cash', 'savings'];

  // ---------- יתרות ----------
  function accountBalance(acc, txs, today) {
    if (acc.kind === 'card') return 0;
    let b = num(acc.opening_balance);
    for (const t of txs) {
      if (t.date < acc.opening_date || t.date > today) continue;
      const a = num(t.amount);
      if (t.account_id === acc.id) {
        if (t.kind === 'income') b += a; else b -= a;   // expense / transfer out
      } else if (t.kind === 'transfer' && t.to_account_id === acc.id) {
        b += a;
      }
    }
    return b;
  }

  function loanMonthlyRate(l) { return l.interest_rate != null && l.interest_rate !== '' ? num(l.interest_rate) / 1200 : null; }

  function position(S, today) {
    const accs = S.accounts.filter(a => a.active !== false);
    const balances = {};
    let cash = 0, overdraft = 0, limit = 0;
    for (const a of accs) {
      const b = accountBalance(a, S.transactions, today);
      balances[a.id] = b;
      if (CASH_KINDS.includes(a.kind)) {
        if (b >= 0) cash += b; else overdraft += -b;
        limit += num(a.credit_limit);
      }
    }
    const loans = S.loans.filter(l => l.active !== false);
    const debt = loans.reduce((s, l) => s + num(l.balance), 0);
    const assets = S.assets.reduce((s, x) => s + num(x.value) * num(x.ownership_pct ?? 100) / 100, 0);
    const cardCharges = accs.filter(a => a.kind === 'card').reduce((s, a) => s + num(a.expected_charge), 0);
    return { balances, cash, overdraft, limit, debt, assets, cardCharges, netCash: cash - overdraft, netWorth: cash - overdraft + assets - debt };
  }

  // ---------- אירועים צפויים בחודש ----------
  function occurrences(S, mk, today) {
    const accById = Object.fromEntries(S.accounts.map(a => [a.id, a]));
    const curMk = monthKey(today);
    const txInMonth = S.transactions.filter(t => monthKey(t.date) === mk);
    const ev = [];
    const isCard = id => accById[id] && accById[id].kind === 'card';

    for (const r of S.recurring) {
      if (r.active === false) continue;
      const smk = monthKey(r.start_date || today);
      const diff = mkIndex(mk) - mkIndex(smk);
      if (diff < 0 || diff % (num(r.every_months) || 1) !== 0) continue;
      const date = dateIn(mk, num(r.day_of_month) || 1);
      if (r.end_date && date > r.end_date) continue;
      const done = txInMonth.some(t => t.recurring_id === r.id);
      ev.push({ date, type: r.kind, amount: num(r.amount), label: r.description || r.category, category: r.category,
        owner: r.owner, account_id: r.account_id, ref: { t: 'recurring', id: r.id }, bank: !isCard(r.account_id), fixed: true, done });
    }

    const offset = mkIndex(mk) - mkIndex(curMk);
    for (const l of S.loans) {
      if (l.active === false || !(num(l.monthly_payment) > 0)) continue;
      const paidThis = S.transactions.some(t => t.loan_id === l.id && monthKey(t.date) === curMk);
      let include, done = false;
      if (offset < 0) continue;
      if (offset === 0) { include = true; done = paidThis; }
      else {
        const left = l.payments_left == null || l.payments_left === '' ? Infinity : num(l.payments_left);
        const k = paidThis ? offset : offset + 1; // מספר התשלום מתוך הנותרים
        include = k <= left;
      }
      if (offset === 0 && !done && l.payments_left != null && l.payments_left !== '' && num(l.payments_left) <= 0) include = false;
      if (!include) continue;
      ev.push({ date: dateIn(mk, num(l.payment_day) || 10), type: 'loan', amount: num(l.monthly_payment), label: l.name, category: l.kind === 'mortgage' ? 'משכנתא' : 'הלוואות',
        owner: l.owner, account_id: l.account_id, ref: { t: 'loan', id: l.id }, bank: !isCard(l.account_id), fixed: true, done });
    }

    for (const a of S.accounts) {
      if (a.kind !== 'card' || a.active === false || !a.billing_day || !(num(a.expected_charge) > 0)) continue;
      const done = txInMonth.some(t => t.kind === 'transfer' && t.to_account_id === a.id);
      ev.push({ date: dateIn(mk, num(a.billing_day)), type: 'card', amount: num(a.expected_charge), label: 'חיוב ' + a.name, category: 'חיוב כרטיס',
        owner: a.owner, account_id: a.linked_account_id, ref: { t: 'card', id: a.id }, bank: true, fixed: false, done });
    }
    ev.sort((x, y) => x.date.localeCompare(y.date));
    return ev;
  }

  // ממוצע הוצאות משתנות (שאינן קבועות/הלוואה) ב-3 החודשים המלאים האחרונים
  function variableAverage(S, today) {
    const accById = Object.fromEntries(S.accounts.map(a => [a.id, a]));
    const cur = mkIndex(monthKey(today));
    const months = [cur - 1, cur - 2, cur - 3].map(mkFromIndex);
    let all = 0, bank = 0, seen = new Set();
    for (const t of S.transactions) {
      if (t.kind !== 'expense' || t.recurring_id || t.loan_id || t.is_fixed) continue;
      const mk = monthKey(t.date);
      if (!months.includes(mk)) continue;
      seen.add(mk);
      all += num(t.amount);
      if (!(accById[t.account_id] && accById[t.account_id].kind === 'card')) bank += num(t.amount);
    }
    const n = seen.size || 1;
    return { all: all / n, bank: bank / n, months: seen.size };
  }

  // ---------- סיכום חודש ----------
  function monthSummary(S, mk, today) {
    const curMk = monthKey(today);
    const tx = S.transactions.filter(t => monthKey(t.date) === mk);
    const inc = tx.filter(t => t.kind === 'income'), exp = tx.filter(t => t.kind === 'expense');
    const actualIncome = inc.reduce((s, t) => s + num(t.amount), 0);
    const actualExpense = exp.reduce((s, t) => s + num(t.amount), 0);
    let pendingIncome = 0, pendingExpense = 0, pending = [];
    if (mk >= curMk) {
      for (const e of occurrences(S, mk, today)) {
        if (e.done || e.type === 'card') continue;
        pending.push(e);
        if (e.type === 'income') pendingIncome += e.amount; else pendingExpense += e.amount;
      }
    }
    const byCat = {}, incByCat = {}, byOwner = { me: 0, spouse: 0, joint: 0 };
    let fixed = 0, variable = 0;
    for (const t of exp) { byCat[t.category || 'לא מסווג'] = (byCat[t.category || 'לא מסווג'] || 0) + num(t.amount); byOwner[t.owner || 'joint'] += num(t.amount); if (t.is_fixed || t.recurring_id || t.loan_id) fixed += num(t.amount); else variable += num(t.amount); }
    for (const t of inc) incByCat[t.category || 'אחר'] = (incByCat[t.category || 'אחר'] || 0) + num(t.amount);
    for (const e of pending) {
      if (e.type === 'income') incByCat[e.category] = (incByCat[e.category] || 0) + e.amount;
      else { byCat[e.category] = (byCat[e.category] || 0) + e.amount; byOwner[e.owner || 'joint'] += e.amount; fixed += e.amount; }
    }
    const expIncome = actualIncome + pendingIncome, expExpense = actualExpense + pendingExpense;
    return { mk, actualIncome, actualExpense, pendingIncome, pendingExpense, expIncome, expExpense, net: expIncome - expExpense,
      actualNet: actualIncome - actualExpense, byCat, incByCat, byOwner, fixed, variable, pending, tx };
  }

  function fixedCommitments(S) {
    const rec = S.recurring.filter(r => r.active !== false && r.kind === 'expense').reduce((s, r) => s + num(r.amount) / (num(r.every_months) || 1), 0);
    const loans = S.loans.filter(l => l.active !== false).reduce((s, l) => s + num(l.monthly_payment), 0);
    const recInc = S.recurring.filter(r => r.active !== false && r.kind === 'income').reduce((s, r) => s + num(r.amount) / (num(r.every_months) || 1), 0);
    return { recurring: rec, loans, total: rec + loans, fixedIncome: recInc };
  }

  // ---------- תחזית יומית לחודש הנוכחי (יתרת בנק) ----------
  function dailyForecast(S, today) {
    const mk = monthKey(today);
    const pos = position(S, today);
    const va = variableAverage(S, today);
    const dim = daysIn(mk), td = parse(today).getDate();
    const daily = va.bank / dim;
    const ev = occurrences(S, mk, today).filter(e => !e.done && e.bank);
    let bal = pos.netCash;
    const days = [], events = [];
    for (let d = td; d <= dim; d++) {
      const date = dateIn(mk, d);
      for (const e of ev) {
        const due = e.date < today ? today : e.date;
        if (due === date) { bal += e.type === 'income' ? e.amount : -e.amount; events.push({ ...e, due }); }
      }
      if (d > td) bal -= daily;
      days.push({ date, day: d, balance: bal });
    }
    const end = days.length ? days[days.length - 1].balance : bal;
    const min = days.reduce((m, x) => (x.balance < m.balance ? x : m), days[0] || { balance: bal, date: today });
    const breach = pos.limit > 0 ? days.find(x => x.balance < -pos.limit) : null;
    return { start: pos.netCash, end, min, days, events, dailyVariable: daily, variableMonths: va.months, limit: pos.limit, breach };
  }

  // ---------- תחזית רב-חודשית (עד 60 חודשים) ----------
  function projection(S, today, months = 60) {
    const curMk = monthKey(today);
    const pos = position(S, today);
    const va = variableAverage(S, today);
    const loans = S.loans.filter(l => l.active !== false).map(l => ({ ...l, bal: num(l.balance), left: l.payments_left == null || l.payments_left === '' ? null : num(l.payments_left) }));
    let cash = pos.netCash;
    const rows = [];
    for (let i = 0; i < months; i++) {
      const mk = addMonths(curMk, i);
      const ev = occurrences(S, mk, today);
      let inc = 0, recExp = 0, loanPay = 0, cardCh = 0, bankOut = 0, bankIn = 0;
      for (const e of ev) {
        const counts = i > 0 || !e.done;
        if (e.type === 'income') { inc += e.amount; if (counts && e.bank) bankIn += e.amount; }
        else if (e.type === 'expense') { recExp += e.amount; if (counts && e.bank) bankOut += e.amount; }
        else if (e.type === 'loan') { loanPay += e.amount; if (counts && e.bank) bankOut += e.amount; }
        else if (e.type === 'card') { cardCh += e.amount; if (counts) bankOut += e.amount; }
      }
      const frac = i === 0 ? (daysIn(mk) - parse(today).getDate()) / daysIn(mk) : 1;
      const varAll = va.all, varBank = va.bank * frac;
      cash += bankIn - bankOut - varBank;
      // הלוואות: הפחתת יתרה
      const firstMonthDone = id => S.transactions.some(t => t.loan_id === id && monthKey(t.date) === curMk);
      for (const l of loans) {
        if (l.bal <= 0) continue;
        if (i === 0 && firstMonthDone(l.id)) continue;
        if (l.left !== null && l.left <= 0) { l.bal = 0; continue; }
        const r = loanMonthlyRate(l);
        if (r !== null) l.bal = Math.max(0, l.bal * (1 + r) - num(l.monthly_payment));
        else if (l.left) l.bal = Math.max(0, l.bal - l.bal / l.left);
        else l.bal = Math.max(0, l.bal - num(l.monthly_payment));
        if (l.left !== null) { l.left -= 1; if (l.left <= 0) l.bal = 0; }
      }
      const debt = loans.reduce((s, l) => s + l.bal, 0);
      const assets = S.assets.reduce((s, x) => s + num(x.value) * num(x.ownership_pct ?? 100) / 100 * Math.pow(1 + num(x.annual_growth_pct) / 100, (i + 1) / 12), 0);
      const expenses = recExp + loanPay + varAll;
      rows.push({ mk, income: inc, expenses, recurring: recExp, loans: loanPay, variable: varAll, cards: cardCh, net: inc - expenses,
        cash, overdraft: Math.max(0, -cash), debt, assets, netWorth: cash + assets - debt });
    }
    return { rows, variable: va, start: pos };
  }

  function yearly(rows) {
    const by = {};
    for (const r of rows) {
      const y = r.mk.slice(0, 4);
      const b = by[y] || (by[y] = { year: y, income: 0, expenses: 0, net: 0, months: 0 });
      b.income += r.income; b.expenses += r.expenses; b.net += r.net; b.months++;
      Object.assign(b, { cash: r.cash, debt: r.debt, assets: r.assets, netWorth: r.netWorth, overdraft: r.overdraft });
    }
    return Object.values(by);
  }

  // ---------- יעדים ----------
  const METRICS = {
    net_worth: { label: 'שווי נקי', up: true },
    total_debt: { label: 'סך החובות', up: false },
    overdraft: { label: 'מינוס בבנק', up: false },
    cash: { label: 'כסף בחשבונות', up: true },
    monthly_surplus: { label: 'עודף חודשי', up: true },
    assets: { label: 'שווי נכסים', up: true }
  };
  function metricNow(metric, S, today) {
    const p = position(S, today);
    switch (metric) {
      case 'net_worth': return p.netWorth;
      case 'total_debt': return p.debt;
      case 'overdraft': return p.overdraft;
      case 'cash': return p.cash;
      case 'assets': return p.assets;
      case 'monthly_surplus': return monthSummary(S, monthKey(today), today).net;
    }
    return 0;
  }
  function metricRow(metric, r) {
    return { net_worth: r.netWorth, total_debt: r.debt, overdraft: r.overdraft, cash: Math.max(0, r.cash), assets: r.assets, monthly_surplus: r.net }[metric];
  }
  function goalStatus(g, S, today, proj) {
    const cur = metricNow(g.metric, S, today);
    const up = METRICS[g.metric] ? METRICS[g.metric].up : true;
    const start = num(g.start_value), target = num(g.target);
    const span = target - start;
    let pct = span === 0 ? 100 : ((cur - start) / span) * 100;
    pct = Math.max(0, Math.min(100, pct));
    const reached = up ? cur >= target : cur <= target;
    const monthsLeft = Math.max(1, mkIndex(monthKey(g.target_date)) - mkIndex(monthKey(today)));
    const perMonth = (target - cur) / monthsLeft;
    let eta = null;
    if (!reached && proj) {
      const hit = proj.rows.find(r => { const v = metricRow(g.metric, r); return up ? v >= target : v <= target; });
      eta = hit ? hit.mk : null;
    }
    const onTrack = reached || (eta && eta <= monthKey(g.target_date));
    return { cur, pct: reached ? 100 : pct, reached, perMonth, monthsLeft, eta, onTrack, up };
  }

  // ---------- מדדי בריאות פיננסית ----------
  function health(S, today) {
    const sm = monthSummary(S, monthKey(today), today);
    const fc = fixedCommitments(S);
    const p = position(S, today);
    const income = sm.expIncome || fc.fixedIncome;
    const r = (a, b) => (b > 0 ? a / b : null);
    const grade = (v, good, warn, lowerBetter = true) => v == null ? 'na' : lowerBetter ? (v <= good ? 'good' : v <= warn ? 'warn' : 'bad') : (v >= good ? 'good' : v >= warn ? 'warn' : 'bad');
    const savings = r(sm.net, income), debtService = r(fc.loans, income), fixedRatio = r(fc.total, income), odUse = r(p.overdraft, p.limit);
    return [
      { key: 'savings', label: 'שיעור חיסכון', value: savings, grade: grade(savings, 0.1, 0, false), hint: 'כמה נשאר מההכנסה אחרי כל ההוצאות. מומלץ 10% ומעלה' },
      { key: 'debt', label: 'החזרי חובות מההכנסה', value: debtService, grade: grade(debtService, 0.2, 0.35), hint: 'עד 20% תקין, מעל 35% מסוכן' },
      { key: 'fixed', label: 'הוצאות קבועות מההכנסה', value: fixedRatio, grade: grade(fixedRatio, 0.5, 0.7), hint: 'עד 50% נותן גמישות' },
      { key: 'od', label: 'ניצול מסגרת המינוס', value: odUse, grade: grade(odUse, 0, 0.5), hint: 'אפס זה המצב הבריא' }
    ];
  }

  // ---------- ייבוא ----------
  const RULES = [
    ['עמלות בנק', ['עמלה', 'דמי כרטיס', 'דמי ניהול', 'ריבית']],
    ['תקשורת', ['רמי לוי תקשורת', 'פרטנר', 'סלקום', 'hot', 'הוט', 'בזק', 'גולן טלקום', 'פלאפון', 'pelephone', 'אתרוג', '012', '019', 'we4g', 'cellcom', 'partner']],
    ['מזון וקניות', ['אושר עד', 'שופרסל', 'רמי לוי', 'יוחננוף', 'ויקטורי', 'מגה', 'טיב טעם', 'חצי חינם', 'יש חסד', 'נתיב החסד', 'מינימרקט', 'סופר', 'מכולת', 'קצב', 'ירקות', 'מאפי', 'am:pm', 'פרש מרקט', 'קשת טעמים', 'אסם', 'שוק']],
    ['תחבורה ודלק', ['פז', 'דלק', 'סונול', 'דור אלון', 'ten ', 'yellow', 'פנגו', 'סלופארק', 'רב קו', 'רב-קו', 'אגד', 'מטרו', 'תבל', 'רכבת', 'gett', 'גט ', 'אנרגיה', 'חניון', 'טסט', 'מוסך']],
    ['בריאות', ['כללית', 'מכבי', 'מאוחדת', 'לאומית', 'סופר פארם', 'פארם', 'בית מרקחת', 'רופא', 'שיניים', 'אופטיק']],
    ['ביגוד', ['ביגוד', 'אופנה', 'הנעלה', 'נעליים', 'x30', 'קסטרו', 'h&m', 'זארה', 'zara', 'פוקס', 'fox', 'גולף', 'תלבושת', 'renuar', 'רנואר']],
    ['תינוק וילדים', ['מעון', 'גן ילדים', 'תמנון', 'צעצוע', 'שילב', 'בייבי', 'baby', 'טיטולים', 'האגיס', 'מטרנה', 'בייביסיטר']],
    ['חשבונות בית', ['חשמל', 'מים', 'ארנונה', 'עיריית', 'עירית', 'גז', 'ועד בית', 'מקורות', 'תאגיד']],
    ['ביטוחים', ['ביטוח', 'הראל', 'מגדל', 'כלל ביטוח', 'הפניקס', 'מנורה', 'aig', 'שלמה', 'ליברה', 'ווישור']],
    ['מנויים ודיגיטל', ['netflix', 'spotify', 'chatgpt', 'openai', 'google', 'apple.com', 'youtube', 'microsoft', 'adobe', 'disney']],
    ['הלוואות', ['הלוואה', 'הסדר חוב', 'מקס איט', 'אשראי מתגלגל']],
    ['משכנתא', ['משכנתא']],
    ['תרומות ומעשרות', ['תרומה', 'צדקה', 'ישיבת', 'כולל', 'מעשר', 'עמותה', 'קרן']],
    ['שכירות', ['שכר דירה', 'שכירות']]
  ];
  const INCOME_RULES = [
    ['החזרים', ['זיכוי', 'החזר', 'ביטול עסקה']],
    ['משכורת שלי', ['משכורת', 'שכר', 'salary']],
    ['שכירות', ['שכר דירה', 'שכירות']],
    ['יבוא ועמלות', ['עמלה', 'יבוא']],
    ['הכנסה נוספת', []]
  ];
  function autoCategory(desc, kind) {
    const d = String(desc || '').toLowerCase();
    const rules = kind === 'income' ? INCOME_RULES : RULES;
    for (const [cat, keys] of rules) if (keys.some(k => d.includes(k.toLowerCase()))) return cat;
    return kind === 'income' ? 'הכנסה נוספת' : 'לא מסווג';
  }
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return iso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
    if (v instanceof Date && !isNaN(v)) return iso(v);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return y + '-' + pad(+m[2]) + '-' + pad(+m[1]); }
    return null;
  }
  function parseAmount(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    let s = String(v).replace(/[₪\s,]|ש"ח|NIS/g, '');
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
    const n = parseFloat(s);
    return isNaN(n) ? null : (neg ? -n : n);
  }
  function importHash(date, amount, desc, accountId) {
    const s = [date, Math.round(amount * 100), String(desc || '').trim(), accountId || ''].join('|');
    let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(36) + s.length.toString(36);
  }

  root.Calc = { pad, iso, parse, monthKey, mkIndex, mkFromIndex, addMonths, daysIn, dateIn, num, accountBalance, position, occurrences,
    variableAverage, monthSummary, fixedCommitments, dailyForecast, projection, yearly, METRICS, metricNow, goalStatus, health,
    autoCategory, parseDate, parseAmount, importHash };
})(typeof window !== 'undefined' ? window : globalThis);
