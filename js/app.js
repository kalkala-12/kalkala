/* כלכלת הבית – ממשק */
(function () {
  'use strict';
  const C = window.Calc;
  const $ = id => document.getElementById(id);
  const TODAY = C.iso(new Date());
  const CUR_MK = C.monthKey(TODAY);
  const UI = { view: 'home', sub: null, month: CUR_MK, fcTab: 'month', txFilter: 'all', search: '', flowFilter: 'all' };
  const charts = {};

  // ---------- קבועים ----------
  const EXP_CATS = ['מזון וקניות', 'שכירות', 'משכנתא', 'הלוואות', 'תחבורה ודלק', 'חשבונות בית', 'בריאות', 'תינוק וילדים', 'ביגוד', 'תקשורת', 'ביטוחים', 'חינוך', 'מנויים ודיגיטל', 'תרומות ומעשרות', 'עמלות בנק', 'הוצאות אישיות', 'הוצאות עסקיות', 'הוצאות בלתי צפויות', 'לא מסווג'];
  const INC_CATS = ['משכורת שלי', 'משכורת אשתי', 'שכירות', 'יבוא ועמלות', 'הכנסה חד-פעמית', 'הכנסה נוספת', 'קצבאות', 'החזרים'];
  const ACC_KINDS = { bank: 'חשבון בנק', card: 'כרטיס אשראי', cash: 'מזומן', savings: 'חיסכון' };
  const LOAN_KINDS = { bank: 'הלוואה בנקאית', mortgage: 'משכנתא', private: 'הלוואה פרטית', person: 'חוב לאדם', installments: 'עסקת תשלומים', other: 'אחר' };
  const ASSET_KINDS = { real_estate: 'נדל"ן', savings: 'חיסכון / פיקדון', pension: 'פנסיה / השתלמות', investment: 'השקעות', vehicle: 'רכב', other: 'אחר' };
  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const DARK = matchMedia('(prefers-color-scheme: dark)').matches;
  const PAL = DARK ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'] : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
  const OTHER = DARK ? '#5c625e' : '#b9bdb8';

  // ---------- עזרים ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, sign) => { n = Number(n) || 0; const s = '₪' + Math.round(Math.abs(n)).toLocaleString('he-IL'); return n < 0 ? '-' + s : (sign && n > 0 ? '+' + s : s); };
  const pct = x => (x == null || !isFinite(x) ? '—' : Math.round(x * 100) + '%');
  const mkLabel = mk => MONTHS[+mk.slice(5, 7) - 1] + ' ' + mk.slice(0, 4);
  const mkShort = mk => MONTHS[+mk.slice(5, 7) - 1].slice(0, 3) + "' " + mk.slice(2, 4);
  const dLabel = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
  const owners = () => Object.assign({ me: 'אני', spouse: 'אשתי', joint: 'משותף' }, (State.household && State.household.settings && State.household.settings.owners) || {});
  const accName = id => { const a = State.accounts.find(x => x.id === id); return a ? a.name : ''; };
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const cls = v => (v < 0 ? 'neg' : v > 0 ? 'pos' : '');
  function toast(t) { const el = $('toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => (el.style.opacity = 0), 2000); }
  function top(title, sub, right = '') { return `<div class="top"><h1>${title}${sub ? `<small>${sub}</small>` : ''}</h1>${right}</div>`; }
  const demoBar = () => (State.mode === 'local' ? '<div class="demo-bar">מצב הדגמה: הנתונים נשמרים רק בדפדפן הזה</div>' : '');

  // ---------- גרפים ----------
  function chart(id, cfg) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    const el = $(id);
    if (!el) return;
    if (!window.Chart) { el.parentElement.innerHTML = '<div class="empty">הגרף לא נטען (אין חיבור לספריית הגרפים)</div>'; return; }
    Chart.defaults.font.family = 'Heebo, system-ui, sans-serif';
    Chart.defaults.color = css('--muted');
    charts[id] = new Chart(el, cfg);
  }
  const tip = { rtl: true, textDirection: 'rtl', callbacks: { label: c => ' ' + (c.dataset.label ? c.dataset.label + ': ' : '') + money(c.parsed.y ?? c.parsed) }, filter: i => (i.parsed.y ?? i.parsed) != null };
  const legendTop = { position: 'top', align: 'start', rtl: true, labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } };
  const axes = () => ({ x: { grid: { display: false }, ticks: { font: { size: 11 } } }, y: { grid: { color: css('--line') }, border: { display: false }, ticks: { font: { size: 11 }, callback: v => (Math.abs(v) >= 1000 ? (v < 0 ? '-' : '') + '₪' + Math.round(Math.abs(v) / 1000) + 'K' : '₪' + v) } } });
  function topN(obj, n = 7) {
    let rows = Object.entries(obj).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
    if (rows.length > n) { const rest = rows.slice(n - 1).reduce((s, r) => s + r[1], 0); rows = rows.slice(0, n - 1).concat([['אחר', rest]]); }
    return rows;
  }
  function donut(id, legId, obj) {
    const rows = topN(obj), total = rows.reduce((s, r) => s + r[1], 0);
    const cols = rows.map((r, i) => (r[0] === 'אחר' && i === rows.length - 1 ? OTHER : PAL[i]));
    const leg = $(legId);
    if (leg) leg.innerHTML = rows.length ? rows.map((r, i) => `<div class="lg"><i style="background:${cols[i]}"></i><span>${esc(r[0])}</span><em>${pct(r[1] / total)}</em><b>${money(r[1])}</b></div>`).join('') : '<div class="empty">אין נתונים</div>';
    if (!rows.length) { const el = $(id); if (el) el.parentElement.style.display = 'none'; return; }
    chart(id, { type: 'doughnut', data: { labels: rows.map(r => r[0]), datasets: [{ data: rows.map(r => r[1]), backgroundColor: cols, borderColor: css('--card'), borderWidth: 2, borderRadius: 4 }] },
      options: { maintainAspectRatio: false, cutout: '64%', plugins: { legend: { display: false }, tooltip: { rtl: true, textDirection: 'rtl', callbacks: { label: c => ` ${c.label}: ${money(c.parsed)} (${pct(c.parsed / total)})` } } } } });
  }
  function stackBar(parts) {
    const total = parts.reduce((s, p) => s + Math.max(0, p.v), 0);
    if (!total) return '<div class="empty">אין נתונים</div>';
    return `<div class="stack">${parts.filter(p => p.v > 0).map(p => `<i style="width:${(p.v / total) * 100}%;background:${p.c}" title="${esc(p.l)}"></i>`).join('')}</div>` +
      parts.filter(p => p.v > 0).map(p => `<div class="lg"><i style="background:${p.c}"></i><span>${esc(p.l)}</span><em>${pct(p.v / total)}</em><b>${money(p.v)}</b></div>`).join('');
  }

  // =====================================================================
  // ראשי
  // =====================================================================
  function viewHome() {
    const sm = C.monthSummary(State, CUR_MK, TODAY), pos = C.position(State, TODAY), fc = C.fixedCommitments(State), df = C.dailyForecast(State, TODAY);
    const hl = C.health(State, TODAY), O = owners();
    const proj = C.projection(State, TODAY, 60);
    const deepen = df.end < df.start - 1;
    let alert = '';
    if (df.breach) alert = `<div class="alert">⚠️ צפוי לחרוג ממסגרת האשראי ב-${dLabel(df.breach.date)}</div>`;
    else if (df.end < 0 && deepen) alert = `<div class="alert">⚠️ המינוס צפוי להעמיק ב-${money(df.start - df.end)} עד סוף החודש</div>`;
    else if (df.end >= 0) alert = `<div class="alert">✓ צפוי להישאר ביתרה חיובית עד סוף החודש</div>`;
    const goals = State.goals.slice(0, 3).map(g => goalRow(g, proj)).join('');
    return demoBar() + top('כלכלת הבית', (State.household && State.household.name) || '', `<button class="icon-btn" data-act="go" data-v="more" aria-label="תפריט">☰</button>`) +
      `<div class="sec-title">💸 תזרים: ${mkLabel(CUR_MK)}</div>
      <div class="card hero">
        <div class="lbl">יתרה חודשית צפויה</div>
        <div class="big">${money(sm.net, true)}</div>
        <div class="tiles">
          <div class="tile"><span>הכנסות</span><b>${money(sm.expIncome)}</b><small>התקבלו ${money(sm.actualIncome)}</small></div>
          <div class="tile"><span>הוצאות</span><b>${money(sm.expExpense)}</b><small>יצאו ${money(sm.actualExpense)}</small></div>
          <div class="tile"><span>התחייבויות קבועות</span><b>${money(fc.total)}</b><small>מתוכן חובות ${money(fc.loans)}</small></div>
          <div class="tile"><span>צפי בבנק בסוף החודש</span><b>${money(df.end)}</b><small>היום ${money(df.start)}</small></div>
        </div>
        ${alert}
      </div>
      ${sm.pending.length ? `<div class="card"><h2>צפוי עד סוף החודש <button class="act" data-act="go" data-v="flow">לכל התזרים ›</button></h2>${pendingRows(sm.pending.slice(0, 4))}</div>` : ''}

      <div class="sec-title">🏦 נכסים וחובות</div>
      <div class="card">
        <div class="tiles t3">
          <div class="tile"><span>כסף בחשבונות</span><b class="pos">${money(pos.cash)}</b></div>
          <div class="tile"><span>מינוס</span><b class="neg">${money(pos.overdraft)}</b>${pos.limit ? `<small>${pct(pos.overdraft / pos.limit)} מהמסגרת</small>` : ''}</div>
          <div class="tile"><span>הלוואות וחובות</span><b class="neg">${money(pos.debt)}</b></div>
          <div class="tile"><span>נכסים</span><b>${money(pos.assets)}</b></div>
          <div class="tile"><span>חיובי אשראי צפויים</span><b>${money(pos.cardCharges)}</b></div>
          <div class="tile"><span>שווי נקי</span><b class="${cls(pos.netWorth)}">${money(pos.netWorth)}</b></div>
        </div>
        <div class="hint">שווי נקי = כסף בחשבונות + נכסים − מינוס − הלוואות</div>
      </div>

      <div class="sec-title">👨‍👩‍👧 תמונה משפחתית</div>
      <div class="card"><h2>מדדי בריאות כלכלית</h2><div class="health">${hl.map(h => `<div class="hcell ${h.grade}"><span>${h.label}</span><b>${pct(h.value)}</b><div class="st">${{ good: 'תקין', warn: 'לתשומת לב', bad: 'בעייתי', na: 'אין נתונים' }[h.grade]}</div><small>${h.hint}</small></div>`).join('')}</div></div>
      <div class="card"><h2>לאן הולך הכסף החודש</h2><div class="cbox donut"><canvas id="chHomeExp"></canvas></div><div class="legend" id="lgHomeExp"></div></div>
      <div class="card"><h2>מקורות ההכנסה</h2><div class="cbox donut"><canvas id="chHomeInc"></canvas></div><div class="legend" id="lgHomeInc"></div></div>
      <div class="card"><h2>קבוע מול משתנה</h2>${stackBar([{ l: 'הוצאות קבועות', v: sm.fixed, c: PAL[0] }, { l: 'הוצאות משתנות', v: sm.variable, c: PAL[1] }])}</div>
      <div class="card"><h2>הוצאות לפי בעלות</h2>${stackBar([{ l: O.me, v: sm.byOwner.me, c: PAL[0] }, { l: O.spouse, v: sm.byOwner.spouse, c: PAL[1] }, { l: O.joint, v: sm.byOwner.joint, c: PAL[2] }])}</div>
      <div class="card"><h2>6 חודשים אחרונים</h2><div class="cbox"><canvas id="chHomeTrend"></canvas></div><div class="hint">החודש הנוכחי כולל את מה שעוד צפוי להיכנס ולצאת</div></div>

      <div class="sec-title">🎯 יעדים</div>
      <div class="card">${goals || '<div class="empty">עוד לא הוגדרו יעדים</div>'}<button class="btn sec" data-act="sub" data-s="goals">${State.goals.length ? 'לכל היעדים' : 'הגדרת יעד צמיחה'}</button></div>`;
  }
  function afterHome() {
    const sm = C.monthSummary(State, CUR_MK, TODAY);
    donut('chHomeExp', 'lgHomeExp', sm.byCat);
    donut('chHomeInc', 'lgHomeInc', sm.incByCat);
    const mks = [-5, -4, -3, -2, -1, 0].map(i => C.addMonths(CUR_MK, i));
    const sums = mks.map(mk => C.monthSummary(State, mk, TODAY));
    chart('chHomeTrend', { type: 'bar', data: { labels: mks.map(mkShort), datasets: [
      { label: 'הכנסות', data: sums.map(s => (s.mk === CUR_MK ? s.expIncome : s.actualIncome)), backgroundColor: PAL[2], borderRadius: 4, maxBarThickness: 22 },
      { label: 'הוצאות', data: sums.map(s => (s.mk === CUR_MK ? s.expExpense : s.actualExpense)), backgroundColor: PAL[1], borderRadius: 4, maxBarThickness: 22 }] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: axes(), plugins: { legend: legendTop, tooltip: tip } } });
  }

  function pendingRows(list) {
    return list.map(e => {
      const late = e.date < TODAY;
      const sign = e.type === 'income' ? '+' : '−';
      return `<div class="row"><div class="dot ${e.type === 'income' ? 'i' : e.type === 'card' ? 'n' : 'e'}">${sign}</div>
        <div class="m"><div>${esc(e.label)}${late ? '<span class="tag warn">באיחור</span>' : ''}${!e.bank ? '<span class="tag">באשראי</span>' : ''}</div><small>${dLabel(e.date)} · ${esc(e.category)}${e.account_id ? ' · ' + esc(accName(e.account_id)) : ''}</small></div>
        <div class="a ${e.type === 'income' ? 'pos' : 'neg'}">${money(e.amount)}</div>
        <button class="okbtn" data-act="confirm" data-t="${e.ref.t}" data-id="${e.ref.id}" data-d="${e.date}" data-amt="${e.amount}">${e.type === 'income' ? 'התקבל' : 'שולם'}</button></div>`;
    }).join('');
  }

  // =====================================================================
  // תזרים
  // =====================================================================
  function viewFlow() {
    const mk = UI.month, sm = C.monthSummary(State, mk, TODAY);
    const occ = mk >= CUR_MK ? C.occurrences(State, mk, TODAY) : [];
    const pend = occ.filter(e => !e.done);
    const done = occ.filter(e => e.done);
    const filt = UI.flowFilter;
    const tx = sm.tx.filter(t => filt === 'all' || t.kind === filt).sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at).localeCompare(String(a.created_at)));
    const catRows = topN(sm.byCat, 50), totE = catRows.reduce((s, r) => s + r[1], 0);
    return demoBar() + top('תזרים', 'כסף שנכנס ויוצא', `<div class="mnav"><button data-act="mprev">›</button><span>${mkLabel(mk)}</span><button data-act="mnext">‹</button></div>`) +
      `<div class="card"><div class="tiles t3">
        <div class="tile"><span>הכנסות</span><b class="pos">${money(sm.expIncome)}</b><small>בפועל ${money(sm.actualIncome)}</small></div>
        <div class="tile"><span>הוצאות</span><b class="neg">${money(sm.expExpense)}</b><small>בפועל ${money(sm.actualExpense)}</small></div>
        <div class="tile"><span>יתרה</span><b class="${cls(sm.net)}">${money(sm.net, true)}</b><small>${mk === CUR_MK ? 'צפי לחודש' : mk > CUR_MK ? 'צפי' : 'בפועל'}</small></div>
      </div>${mk >= CUR_MK ? '<div class="hint">הכנסה צפויה לא נספרת כ"התקבלה" עד שמאשרים אותה</div>' : ''}</div>
      ${mk === CUR_MK ? `<div class="card"><h2>יתרה צפויה בבנק עד סוף החודש</h2><div class="cbox sm"><canvas id="chFlowDaily"></canvas></div><div class="hint" id="flowDailyHint"></div></div>` : ''}
      ${occ.length ? `<div class="card"><h2>חיובים והכנסות צפויים <span class="tag">${pend.length} ממתינים</span></h2>${pend.length ? pendingRows(pend) : '<div class="empty">הכול אושר החודש ✓</div>'}
        ${done.length ? `<div class="hint" style="margin-top:10px">אושרו: ${done.map(e => esc(e.label)).join(' · ')}</div>` : ''}</div>` : ''}
      <div class="card"><h2>הוצאות לפי קטגוריה</h2>${catRows.length ? catRows.map(([k, v]) => `<div class="lg"><span>${esc(k)}</span><em>${pct(v / totE)}</em><b>${money(v)}</b></div><div class="bar"><i style="width:${Math.max(2, (v / totE) * 100)}%;background:${PAL[1]}"></i></div>`).join('') : '<div class="empty">אין הוצאות</div>'}</div>
      <div class="card"><h2>תנועות בפועל <span class="seg" style="padding:2px">${[['all', 'הכול'], ['income', 'הכנסות'], ['expense', 'הוצאות']].map(([v, l]) => `<button class="${filt === v ? 'on' : ''}" data-act="ffilt" data-v="${v}" style="padding:4px 8px;font-size:12px">${l}</button>`).join('')}</span></h2>
        ${tx.length ? tx.map(txRow).join('') : '<div class="empty">אין תנועות. לחצו על + כדי להוסיף</div>'}</div>`;
  }
  function txRow(t) {
    const i = t.kind === 'income', tr = t.kind === 'transfer';
    return `<div class="row click" data-act="edittx" data-id="${t.id}"><div class="dot ${i ? 'i' : tr ? 'n' : 'e'}">${i ? '+' : tr ? '⇄' : '−'}</div>
      <div class="m"><div>${esc(t.description || t.category || '')}${t.is_fixed || t.recurring_id || t.loan_id ? '<span class="tag">קבוע</span>' : ''}${t.source === 'import' ? '<span class="tag">יובא</span>' : ''}</div>
      <small>${dLabel(t.date)} · ${esc(t.category || '')}${t.account_id ? ' · ' + esc(accName(t.account_id)) : ''} · ${esc(owners()[t.owner || 'joint'])}</small></div>
      <div class="a ${i ? 'pos' : tr ? '' : 'neg'}">${i ? '+' : tr ? '' : '-'}${money(t.amount)}</div></div>`;
  }
  function afterFlow() {
    if (UI.month !== CUR_MK || !$('chFlowDaily')) return;
    const df = C.dailyForecast(State, TODAY);
    dailyChart('chFlowDaily', df);
    $('flowDailyHint').textContent = `היום ${money(df.start)} · בסוף החודש ${money(df.end)} · הנקודה הנמוכה ${money(df.min.balance)} ב-${dLabel(df.min.date)}` + (df.variableMonths ? ` · כולל הוצאה משתנה של כ-${money(df.dailyVariable)} ליום (ממוצע ${df.variableMonths} חודשים)` : '');
  }
  function dailyChart(id, df) {
    const ds = [{ label: 'יתרה צפויה', data: df.days.map(d => d.balance), borderColor: PAL[0], backgroundColor: PAL[0], borderWidth: 2, pointRadius: 0, tension: 0.15, stepped: false }];
    if (df.limit > 0) ds.push({ label: 'גבול המסגרת', data: df.days.map(() => -df.limit), borderColor: css('--muted'), borderDash: [3, 3], borderWidth: 1.5, pointRadius: 0 });
    chart(id, { type: 'line', data: { labels: df.days.map(d => d.day), datasets: ds }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: axes(), plugins: { legend: legendTop, tooltip: { ...tip, callbacks: { ...tip.callbacks, title: i => i[0].label + '/' + CUR_MK.slice(5) } } } } });
  }

  // =====================================================================
  // הון וחובות
  // =====================================================================
  function viewWealth() {
    const pos = C.position(State, TODAY), O = owners();
    const banks = State.accounts.filter(a => a.kind !== 'card' && a.active !== false), cards = State.accounts.filter(a => a.kind === 'card' && a.active !== false);
    const loans = State.loans.filter(l => l.active !== false);
    const lPay = loans.reduce((s, l) => s + C.num(l.monthly_payment), 0);
    return demoBar() + top('הון וחובות', 'מה יש לנו ומה אנחנו חייבים') +
      `<div class="card hero"><div class="lbl">שווי נקי</div><div class="big">${money(pos.netWorth)}</div>
        <div class="tiles"><div class="tile"><span>יש לנו</span><b>${money(pos.cash + pos.assets)}</b><small>חשבונות ${money(pos.cash)} · נכסים ${money(pos.assets)}</small></div>
        <div class="tile"><span>אנחנו חייבים</span><b>${money(pos.overdraft + pos.debt)}</b><small>מינוס ${money(pos.overdraft)} · הלוואות ${money(pos.debt)}</small></div></div></div>
      <div class="card"><h2>התפתחות לאורך זמן</h2><div class="cbox"><canvas id="chWealthHist"></canvas></div><div class="hint" id="wealthHint"></div></div>

      <div class="card"><h2>חשבונות בנק וחיסכון <button class="act" data-act="addacc">+ הוספה</button></h2>
        ${banks.length ? banks.map(a => { const b = pos.balances[a.id] || 0, lim = C.num(a.credit_limit); return `<div class="row click" data-act="editacc" data-id="${a.id}"><div class="dot ${b < 0 ? 'e' : 'i'}">${a.kind === 'savings' ? '◎' : a.kind === 'cash' ? '¤' : '₪'}</div>
          <div class="m"><div>${esc(a.name)}<span class="tag">${esc(O[a.owner])}</span></div><small>${esc(a.bank || ACC_KINDS[a.kind])}${lim ? ' · מסגרת ' + money(lim) : ''} · עודכן ${dLabel(a.opening_date)}</small>
          ${lim && b < 0 ? `<div class="bar"><i style="width:${Math.min(100, (-b / lim) * 100)}%;background:${-b / lim > 0.8 ? 'var(--exp)' : 'var(--warn)'}"></i></div>` : ''}</div>
          <div class="a ${cls(b)}">${money(b)}</div></div>`; }).join('') : '<div class="empty">הוסיפו את חשבונות הבנק שלכם</div>'}</div>

      <div class="card"><h2>כרטיסי אשראי <button class="act" data-act="addcard">+ הוספה</button></h2>
        ${cards.length ? cards.map(a => `<div class="row click" data-act="editacc" data-id="${a.id}"><div class="dot n">▭</div><div class="m"><div>${esc(a.name)}<span class="tag">${esc(O[a.owner])}</span></div><small>חיוב ב-${a.billing_day || '?'} לחודש${a.linked_account_id ? ' מ' + esc(accName(a.linked_account_id)) : ''}</small></div><div class="a neg">${money(a.expected_charge)}<small>חיוב צפוי</small></div></div>`).join('') : '<div class="empty">אין כרטיסים</div>'}</div>

      <div class="card"><h2>הלוואות והתחייבויות <button class="act" data-act="addloan">+ הוספה</button></h2>
        ${loans.length ? `<div class="tiles" style="margin-bottom:6px"><div class="tile"><span>החזר חודשי</span><b class="neg">${money(lPay)}</b></div><div class="tile"><span>יתרת חוב</span><b class="neg">${money(pos.debt)}</b></div></div>` +
        loans.map(l => { const left = l.payments_left == null || l.payments_left === '' ? null : C.num(l.payments_left); const end = left != null ? C.addMonths(CUR_MK, Math.max(0, left - 1)) : null; const paid = C.num(l.original_amount) > 0 ? 1 - C.num(l.balance) / C.num(l.original_amount) : null;
          return `<div class="row click" data-act="editloan" data-id="${l.id}"><div class="dot e">%</div><div class="m"><div>${esc(l.name)}<span class="tag">${esc(LOAN_KINDS[l.kind] || '')}</span></div>
          <small>${money(l.monthly_payment)} לחודש${left != null ? ` · נשארו ${left} תשלומים · עד ${mkShort(end)}` : ''}${l.interest_rate != null && l.interest_rate !== '' ? ` · ${l.interest_rate}%` : ''}</small>
          ${paid != null ? `<div class="bar"><i style="width:${Math.max(0, Math.min(100, paid * 100))}%"></i></div>` : ''}</div><div class="a neg">${money(l.balance)}${paid != null ? `<small>שולם ${pct(paid)}</small>` : ''}</div></div>`; }).join('') : '<div class="empty">אין הלוואות 🎉</div>'}</div>

      <div class="card"><h2>נכסים <button class="act" data-act="addasset">+ הוספה</button></h2>
        ${State.assets.length ? State.assets.map(x => `<div class="row click" data-act="editasset" data-id="${x.id}"><div class="dot i">◆</div><div class="m"><div>${esc(x.name)}</div><small>${esc(ASSET_KINDS[x.kind])}${C.num(x.ownership_pct) !== 100 ? ' · בעלות ' + x.ownership_pct + '%' : ''}${C.num(x.annual_growth_pct) ? ' · צמיחה ' + x.annual_growth_pct + '% בשנה' : ''}</small></div><div class="a">${money(C.num(x.value) * C.num(x.ownership_pct ?? 100) / 100)}</div></div>`).join('') : '<div class="empty">דירה, חיסכון, פנסיה, רכב…</div>'}</div>`;
  }
  function afterWealth() {
    const s = State.snapshots.slice().sort((a, b) => a.date.localeCompare(b.date));
    $('wealthHint').textContent = s.length < 2 ? 'תמונת מצב נשמרת אוטומטית בכל יום שנכנסים לאתר. הגרף יתמלא עם הזמן.' : `מ-${dLabel(s[0].date)}/${s[0].date.slice(2, 4)}: חובות ${s[s.length - 1].debt <= s[0].debt ? 'ירדו' : 'עלו'} ב-${money(Math.abs(s[s.length - 1].debt - s[0].debt))}, מינוס ${s[s.length - 1].overdraft <= s[0].overdraft ? 'ירד' : 'עלה'} ב-${money(Math.abs(s[s.length - 1].overdraft - s[0].overdraft))}`;
    chart('chWealthHist', { type: 'line', data: { labels: s.map(x => dLabel(x.date)), datasets: [
      { label: 'שווי נקי', data: s.map(x => x.net_worth), borderColor: PAL[0], backgroundColor: PAL[0], borderWidth: 2, pointRadius: 3 },
      { label: 'הלוואות', data: s.map(x => x.debt), borderColor: PAL[1], backgroundColor: PAL[1], borderWidth: 2, pointRadius: 3 },
      { label: 'מינוס', data: s.map(x => x.overdraft), borderColor: PAL[7], backgroundColor: PAL[7], borderWidth: 2, pointRadius: 3 }] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: axes(), plugins: { legend: legendTop, tooltip: tip } } });
  }

  // =====================================================================
  // תחזית
  // =====================================================================
  function viewForecast() {
    const t = UI.fcTab;
    const seg = `<div class="seg" style="margin-bottom:4px">${[['month', 'החודש'], ['year', '12 חודשים'], ['five', '5 שנים']].map(([v, l]) => `<button class="${t === v ? 'on' : ''}" data-act="fctab" data-v="${v}">${l}</button>`).join('')}</div>`;
    const P = C.projection(State, TODAY, 60);
    const va = P.variable;
    const assume = `<div class="card"><h2>הנחות התחזית</h2><div class="hint">• הכנסות והוצאות קבועות לפי מה שהוגדר ב"קבועים"<br>• החזרי הלוואות עד סיום מספר התשלומים, יתרת החוב יורדת לפי הריבית אם ידועה<br>• הוצאות משתנות: ממוצע ${va.months ? va.months + ' החודשים האחרונים, ' + money(va.all) + ' לחודש' : '— עוד אין מספיק היסטוריה (יתווסף אוטומטית)'}<br>• חיובי אשראי: לפי "חיוב צפוי" של כל כרטיס<br>• נכסים: לפי אחוז הצמיחה השנתי שהוגדר</div></div>`;
    let body = '';
    if (t === 'month') {
      const df = C.dailyForecast(State, TODAY);
      let run = df.start;
      body = `<div class="card"><div class="tiles t3"><div class="tile"><span>היום בבנק</span><b class="${cls(df.start)}">${money(df.start)}</b></div><div class="tile"><span>סוף החודש</span><b class="${cls(df.end)}">${money(df.end)}</b></div><div class="tile"><span>הנקודה הנמוכה</span><b class="${cls(df.min.balance)}">${money(df.min.balance)}</b><small>${dLabel(df.min.date)}</small></div></div>
        ${df.breach ? `<div class="alert bad">⚠️ צפוי לחרוג מהמסגרת ב-${dLabel(df.breach.date)}</div>` : df.end < df.start ? `<div class="alert warn">המינוס צפוי להעמיק ב-${money(df.start - df.end)}</div>` : `<div class="alert good">היתרה צפויה לעלות ב-${money(df.end - df.start)}</div>`}</div>
        <div class="card"><h2>יתרה יומית צפויה</h2><div class="cbox"><canvas id="chFcDaily"></canvas></div></div>
        <div class="card"><h2>מה צפוי לרדת ולהיכנס</h2>${df.events.length ? `<div class="tscroll"><table class="t"><tr><th>תאריך</th><th>מה</th><th>סכום</th><th>יתרה אחרי</th></tr>${df.events.map(e => { run += e.type === 'income' ? e.amount : -e.amount; return `<tr><td>${dLabel(e.due)}</td><td>${esc(e.label)}</td><td class="n ${e.type === 'income' ? 'pos' : 'neg'}">${e.type === 'income' ? '+' : '-'}${money(e.amount)}</td><td class="n">${money(run)}</td></tr>`; }).join('')}</table></div><div class="hint">היתרה בטבלה לא כוללת את ההוצאות המשתנות היומיות (${money(df.dailyVariable)} ליום)</div>` : '<div class="empty">אין חיובים צפויים</div>'}</div>`;
    } else if (t === 'year') {
      const rows = P.rows.slice(0, 12);
      const tot = rows.reduce((s, r) => ({ i: s.i + r.income, e: s.e + r.expenses }), { i: 0, e: 0 });
      body = `<div class="card"><div class="tiles t3"><div class="tile"><span>הכנסות שנה</span><b class="pos">${money(tot.i)}</b></div><div class="tile"><span>הוצאות שנה</span><b class="neg">${money(tot.e)}</b></div><div class="tile"><span>עודף / גירעון</span><b class="${cls(tot.i - tot.e)}">${money(tot.i - tot.e, true)}</b></div></div></div>
        <div class="card"><h2>הכנסות מול הוצאות</h2><div class="cbox"><canvas id="chFcYear"></canvas></div></div>
        <div class="card"><h2>חודש אחרי חודש</h2><div class="tscroll"><table class="t"><tr><th>חודש</th><th>הכנסות</th><th>הוצאות</th><th>עודף</th><th>בבנק</th></tr>${rows.map(r => `<tr><td>${mkShort(r.mk)}</td><td class="n">${money(r.income)}</td><td class="n">${money(r.expenses)}</td><td class="n ${cls(r.net)}">${money(r.net, true)}</td><td class="n ${cls(r.cash)}">${money(r.cash)}</td></tr>`).join('')}</table></div></div>`;
    } else {
      const Y = C.yearly(P.rows);
      const ends = loanEnds();
      body = `<div class="card"><div class="tiles t3"><div class="tile"><span>שווי נקי היום</span><b class="${cls(P.start.netWorth)}">${money(P.start.netWorth)}</b></div><div class="tile"><span>בעוד 5 שנים</span><b class="${cls(P.rows[59].netWorth)}">${money(P.rows[59].netWorth)}</b></div><div class="tile"><span>חובות בעוד 5 שנים</span><b>${money(P.rows[59].debt)}</b></div></div></div>
        <div class="card"><h2>שווי נקי, חובות ויתרת בנק</h2><div class="cbox"><canvas id="chFcFive"></canvas></div></div>
        <div class="card"><h2>שנה אחרי שנה</h2><div class="tscroll"><table class="t"><tr><th>שנה</th><th>עודף שנתי</th><th>בבנק</th><th>חובות</th><th>שווי נקי</th></tr>${Y.map(y => `<tr><td>${y.year}${y.months < 12 ? ` <span class="tag">${y.months} ח'</span>` : ''}</td><td class="n ${cls(y.net)}">${money(y.net, true)}</td><td class="n ${cls(y.cash)}">${money(y.cash)}</td><td class="n">${money(y.debt)}</td><td class="n ${cls(y.netWorth)}">${money(y.netWorth)}</td></tr>`).join('')}</table></div></div>
        <div class="card"><h2>מתי מתפנה כסף</h2>${ends.length ? ends.map(e => `<div class="row"><div class="dot i">✓</div><div class="m"><div>${esc(e.name)}</div><small>התשלום האחרון ב-${mkLabel(e.mk)}</small></div><div class="a pos">+${money(e.pay)}<small>לחודש</small></div></div>`).join('') : '<div class="empty">אין הלוואות עם מספר תשלומים ידוע</div>'}</div>`;
    }
    return demoBar() + top('תחזית', 'מה צפוי לקרות קדימה') + seg + body + assume;
  }
  function loanEnds() {
    return State.loans.filter(l => l.active !== false && l.payments_left != null && l.payments_left !== '' && C.num(l.payments_left) > 0 && C.num(l.payments_left) <= 60)
      .map(l => ({ name: l.name, pay: C.num(l.monthly_payment), mk: C.addMonths(CUR_MK, C.num(l.payments_left) - (State.transactions.some(t => t.loan_id === l.id && C.monthKey(t.date) === CUR_MK) ? 0 : 1)) }))
      .sort((a, b) => a.mk.localeCompare(b.mk));
  }
  function afterForecast() {
    const P = C.projection(State, TODAY, 60);
    if (UI.fcTab === 'month') dailyChart('chFcDaily', C.dailyForecast(State, TODAY));
    else if (UI.fcTab === 'year') {
      const rows = P.rows.slice(0, 12);
      chart('chFcYear', { type: 'bar', data: { labels: rows.map(r => mkShort(r.mk)), datasets: [
        { label: 'הכנסות', data: rows.map(r => r.income), backgroundColor: PAL[2], borderRadius: 4, maxBarThickness: 18 },
        { label: 'הוצאות', data: rows.map(r => r.expenses), backgroundColor: PAL[1], borderRadius: 4, maxBarThickness: 18 }] },
        options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: axes(), plugins: { legend: legendTop, tooltip: tip } } });
    } else {
      const rows = P.rows;
      chart('chFcFive', { type: 'line', data: { labels: rows.map(r => mkShort(r.mk)), datasets: [
        { label: 'שווי נקי', data: rows.map(r => r.netWorth), borderColor: PAL[0], backgroundColor: PAL[0], borderWidth: 2, pointRadius: 0 },
        { label: 'חובות', data: rows.map(r => r.debt), borderColor: PAL[1], backgroundColor: PAL[1], borderWidth: 2, pointRadius: 0 },
        { label: 'יתרת בנק', data: rows.map(r => r.cash), borderColor: PAL[2], backgroundColor: PAL[2], borderWidth: 2, pointRadius: 0 }] },
        options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { ...axes(), x: { ...axes().x, ticks: { maxTicksLimit: 6, font: { size: 11 } } } }, plugins: { legend: legendTop, tooltip: tip } } });
    }
  }

  // =====================================================================
  // עוד: יעדים, קבועים, תנועות, ייבוא, ייצוא, הגדרות
  // =====================================================================
  function viewMore() {
    if (UI.sub === 'goals') return viewGoals();
    if (UI.sub === 'recurring') return viewRecurring();
    if (UI.sub === 'tx') return viewTx();
    if (UI.sub === 'import') return viewImport();
    if (UI.sub === 'settings') return viewSettings();
    const items = [['goals', '🎯', 'יעדי צמיחה', 'הגדרה ומעקב'], ['recurring', '🔁', 'הכנסות והוצאות קבועות', 'משכורות, הוראות קבע, שכירות'], ['tx', '📋', 'כל התנועות', 'חיפוש, עריכה ומחיקה'], ['import', '📥', 'ייבוא מ-Excel / CSV', 'פירוט בנק או אשראי'], ['export', '📤', 'ייצוא וגיבוי ל-Excel', 'כל הנתונים בקובץ אחד'], ['settings', '⚙️', 'הגדרות', 'שמות, משתמש נוסף, יציאה']];
    return demoBar() + top('עוד') + `<div class="card menu">${items.map(([s, ic, t, d]) => `<div class="row" data-act="${s === 'export' ? 'export' : 'sub'}" data-s="${s}"><div class="ic">${ic}</div><div class="m"><div>${t}</div><small>${d}</small></div><div class="a">‹</div></div>`).join('')}</div>`;
  }
  const back = t => top(t, '', `<button class="icon-btn" data-act="back" aria-label="חזרה">›</button>`);

  function goalRow(g, proj) {
    const st = C.goalStatus(g, State, TODAY, proj), M = C.METRICS[g.metric];
    const badge = st.reached ? '<span class="badge good">הושג ✓</span>' : st.onTrack ? '<span class="badge good">בדרך הנכונה</span>' : st.eta ? '<span class="badge warn">באיחור</span>' : '<span class="badge bad">לא צפוי ב-5 שנים</span>';
    return `<div class="row click goal" data-act="editgoal" data-id="${g.id}" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(g.name)}</b>${badge}</div>
      <div class="bar"><i style="width:${st.pct}%;background:${st.reached || st.onTrack ? 'var(--inc)' : 'var(--warn)'}"></i></div>
      <small style="color:var(--muted);font-size:12px">${M.label}: עכשיו ${money(st.cur)} · יעד ${money(g.target)} עד ${mkShort(C.monthKey(g.target_date))}${!st.reached ? ` · צריך ${money(Math.abs(st.perMonth))} ${M.up ? 'גידול' : 'הפחתה'} בחודש` : ''}${st.eta && !st.reached ? ` · לפי התחזית: ${mkShort(st.eta)}` : ''}</small></div>`;
  }
  function viewGoals() {
    const proj = C.projection(State, TODAY, 60);
    return back('יעדי צמיחה') + `<div class="card">${State.goals.length ? State.goals.map(g => goalRow(g, proj)).join('') : '<div class="empty">יעד טוב הוא מספר ותאריך: "לצאת מהמינוס עד יוני", "שווי נקי של 500 אלף בעוד 3 שנים"</div>'}<button class="btn" data-act="addgoal">+ יעד חדש</button></div>
      <div class="hint">"לפי התחזית" מחושב מהתחזית ל-5 שנים, ומתעדכן אוטומטית כשהנתונים משתנים.</div>`;
  }
  function viewRecurring() {
    const O = owners();
    const list = k => State.recurring.filter(r => r.kind === k).sort((a, b) => b.amount - a.amount);
    const block = (k, title) => { const l = list(k), tot = l.filter(r => r.active !== false).reduce((s, r) => s + C.num(r.amount) / (C.num(r.every_months) || 1), 0);
      return `<div class="card"><h2>${title} <span class="${k === 'income' ? 'pos' : 'neg'}" style="direction:ltr">${money(tot)} לחודש</span></h2>${l.length ? l.map(r => `<div class="row click" data-act="editrec" data-id="${r.id}"><div class="dot ${k === 'income' ? 'i' : 'e'}">${k === 'income' ? '+' : '−'}</div><div class="m"><div>${esc(r.description || r.category)}${r.active === false ? '<span class="tag">מושהה</span>' : ''}</div><small>${esc(r.category)} · ב-${r.day_of_month} ${C.num(r.every_months) > 1 ? 'כל ' + r.every_months + ' חודשים' : 'לחודש'}${r.account_id ? ' · ' + esc(accName(r.account_id)) : ''} · ${esc(O[r.owner])}${r.end_date ? ' · עד ' + dLabel(r.end_date) + '/' + r.end_date.slice(2, 4) : ''}</small></div><div class="a">${money(r.amount)}</div></div>`).join('') : '<div class="empty">אין</div>'}</div>`; };
    return back('הכנסות והוצאות קבועות') + block('income', 'הכנסות קבועות') + block('expense', 'הוצאות קבועות') + `<button class="btn" data-act="addrec">+ הוספה</button><div class="hint">החזרי הלוואות מנוהלים במסך "הון וחובות" ולא צריך להוסיף אותם כאן.</div>`;
  }
  function viewTx() {
    const q = UI.search.trim();
    const list = State.transactions.filter(t => !q || [t.description, t.category, accName(t.account_id), String(t.amount)].join(' ').includes(q)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
    return back('כל התנועות') + `<input class="f search" id="txSearch" placeholder="חיפוש לפי תיאור, קטגוריה, סכום…" value="${esc(UI.search)}"><div class="card" id="txList">${list.length ? list.map(txRow).join('') : '<div class="empty">אין תנועות</div>'}</div>`;
  }

  // ---------- ייבוא ----------
  const IMP = { rows: null, header: [], hi: 0, map: {}, sign: 'expense_positive', account: '', file: '' };
  function viewImport() {
    const accs = State.accounts.filter(a => a.active !== false);
    let html = back('ייבוא מ-Excel / CSV') + `<div class="card"><h2>1. בחירת קובץ</h2><input type="file" class="f" id="impFile" accept=".csv,.xlsx,.xls,.txt"><div class="hint">מורידים מאתר הבנק או חברת האשראי "ייצוא ל-Excel" של התנועות, ומעלים כאן. אפשר לייבא שוב את אותו קובץ: תנועות שכבר יובאו מדלגים עליהן.</div>${IMP.file ? `<div class="hint">נטען: ${esc(IMP.file)} · ${IMP.rows.length} שורות</div>` : ''}</div>`;
    if (!IMP.rows) return html;
    const opts = sel => `<option value="">—</option>` + IMP.header.map((h, i) => `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${esc(h || 'עמודה ' + (i + 1))}</option>`).join('');
    html += `<div class="card"><h2>2. התאמת עמודות</h2>
      <label class="l">שורת הכותרות</label><select class="f" data-imp="hi">${IMP.rows.slice(0, 15).map((r, i) => `<option value="${i}" ${i === IMP.hi ? 'selected' : ''}>שורה ${i + 1}: ${esc(r.filter(Boolean).slice(0, 4).join(' | ').slice(0, 60))}</option>`).join('')}</select>
      <label class="l">תאריך</label><select class="f" data-imp="date">${opts(IMP.map.date)}</select>
      <label class="l">תיאור / בית עסק</label><select class="f" data-imp="desc">${opts(IMP.map.desc)}</select>
      <label class="l">סכום (עמודה אחת)</label><select class="f" data-imp="amount">${opts(IMP.map.amount)}</select>
      <div class="hint">או, בדפי בנק עם עמודות נפרדות:</div>
      <label class="l">חובה / הוצאה</label><select class="f" data-imp="debit">${opts(IMP.map.debit)}</select>
      <label class="l">זכות / הכנסה</label><select class="f" data-imp="credit">${opts(IMP.map.credit)}</select>
      <label class="l">סימן הסכום</label><select class="f" data-imp="sign"><option value="expense_positive" ${IMP.sign === 'expense_positive' ? 'selected' : ''}>סכום חיובי = הוצאה (פירוט אשראי)</option><option value="income_positive" ${IMP.sign === 'income_positive' ? 'selected' : ''}>סכום חיובי = הכנסה, שלילי = הוצאה (דף בנק)</option></select>
      <label class="l">לאיזה חשבון / כרטיס</label><select class="f" data-imp="account"><option value="">—</option>${accs.map(a => `<option value="${a.id}" ${IMP.account === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>`;
    const parsed = parseImport();
    const dup = new Set(State.transactions.map(t => t.import_hash).filter(Boolean));
    const fresh = parsed.filter(p => !dup.has(p.import_hash));
    html += `<div class="card"><h2>3. תצוגה מקדימה <span class="tag">${fresh.length} חדשות · ${parsed.length - fresh.length} כבר קיימות</span></h2>
      ${parsed.length ? parsed.slice(0, 12).map(p => `<div class="row"><div class="dot ${p.kind === 'income' ? 'i' : 'e'}">${p.kind === 'income' ? '+' : '−'}</div><div class="m"><div>${esc(p.description)}${dup.has(p.import_hash) ? '<span class="tag">קיים</span>' : ''}</div><small>${dLabel(p.date)}/${p.date.slice(2, 4)} · ${esc(p.category)}</small></div><div class="a ${p.kind === 'income' ? 'pos' : 'neg'}">${money(p.amount)}</div></div>`).join('') : '<div class="empty">לא זוהו תנועות. בדקו את התאמת העמודות</div>'}
      ${parsed.length > 12 ? `<div class="hint">ועוד ${parsed.length - 12}…</div>` : ''}
      <div class="err" id="impErr"></div><button class="btn" data-act="doimport" ${fresh.length && IMP.account ? '' : 'disabled style="opacity:.5"'}>ייבוא ${fresh.length} תנועות</button>
      ${!IMP.account ? '<div class="hint">צריך לבחור חשבון / כרטיס</div>' : ''}<div class="hint">הקטגוריות נקבעות אוטומטית לפי שם בית העסק, ואפשר לשנות כל תנועה אחר כך.</div></div>`;
    return html;
  }
  function guessMap() {
    const h = IMP.header.map(x => String(x || ''));
    const find = re => { const i = h.findIndex(x => re.test(x)); return i >= 0 ? i : ''; };
    IMP.map = { date: find(/תאריך עסקה|תאריך ערך|^תאריך|date/i), desc: find(/בית עסק|תיאור|פרטים|שם|אסמכתא|description|merchant/i), amount: find(/סכום חיוב|סכום|חיוב|amount/i), debit: find(/חובה|debit/i), credit: find(/זכות|credit/i) };
    if (IMP.map.debit !== '' || IMP.map.credit !== '') { if (IMP.map.amount !== '' && /חיוב|סכום/.test(h[IMP.map.amount]) === false) IMP.map.amount = ''; }
    if (IMP.map.date === '') IMP.map.date = find(/תאריך/);
  }
  function setHeader(i) { IMP.hi = i; IMP.header = (IMP.rows[i] || []).map(x => String(x ?? '').trim()); guessMap(); }
  function parseImport() {
    if (!IMP.rows) return [];
    const m = IMP.map, out = [];
    const acc = State.accounts.find(a => a.id === IMP.account);
    for (const r of IMP.rows.slice(IMP.hi + 1)) {
      const date = m.date !== '' ? C.parseDate(r[m.date]) : null;
      if (!date) continue;
      let signed = null;
      if (m.debit !== '' || m.credit !== '') {
        const d = m.debit !== '' ? C.parseAmount(r[m.debit]) : null, c = m.credit !== '' ? C.parseAmount(r[m.credit]) : null;
        if (c) signed = Math.abs(c); else if (d) signed = -Math.abs(d);
      } else if (m.amount !== '') {
        const a = C.parseAmount(r[m.amount]);
        if (a != null) signed = IMP.sign === 'expense_positive' ? -a : a;
      }
      if (!signed) continue;
      const kind = signed > 0 ? 'income' : 'expense', amount = Math.round(Math.abs(signed) * 100) / 100;
      const desc = m.desc !== '' ? String(r[m.desc] ?? '').trim() : '';
      out.push({ date, kind, amount, description: desc, category: C.autoCategory(desc, kind), account_id: IMP.account || null, owner: acc ? acc.owner : 'joint', source: 'import', import_hash: C.importHash(date, signed, desc, IMP.account) });
    }
    return out;
  }
  function parseCSV(text) {
    const first = text.split(/\r?\n/)[0] || '';
    const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true; else if (ch === delim) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  async function loadImportFile(f) {
    IMP.file = f.name;
    let rows;
    if (/\.csv$|\.txt$/i.test(f.name) || !window.XLSX) {
      if (!/\.csv$|\.txt$/i.test(f.name) && !window.XLSX) { toast('ספריית Excel לא נטענה. נסו לשמור את הקובץ כ-CSV'); return; }
      let text = await f.text();
      if (/�/.test(text)) { try { text = new TextDecoder('windows-1255').decode(await f.arrayBuffer()); } catch (e) { /* ignore */ } }
      rows = parseCSV(text);
    } else {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
    }
    IMP.rows = rows.filter(r => r.some(c => String(c).trim() !== ''));
    const hi = IMP.rows.findIndex(r => r.filter(c => String(c).trim() !== '').length >= 3 && r.some(c => /תאריך|date/i.test(String(c))));
    setHeader(hi >= 0 ? hi : 0);
    render();
  }

  // ---------- ייצוא ----------
  function exportAll() {
    const O = owners();
    const k = (o, map) => Object.fromEntries(Object.entries(map).map(([a, b]) => [b, typeof a === 'function' ? '' : o[a]]));
    const sheets = {
      'תנועות': State.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map(t => ({ 'תאריך': t.date, 'סוג': { income: 'הכנסה', expense: 'הוצאה', transfer: 'העברה' }[t.kind], 'סכום': C.num(t.amount), 'קטגוריה': t.category, 'תיאור': t.description, 'חשבון': accName(t.account_id), 'שייך ל': O[t.owner || 'joint'], 'קבוע': t.is_fixed || t.recurring_id || t.loan_id ? 'כן' : '', 'מקור': t.source })),
      'חשבונות': State.accounts.map(a => ({ 'שם': a.name, 'בנק': a.bank, 'סוג': ACC_KINDS[a.kind], 'שייך ל': O[a.owner], 'יתרה נוכחית': a.kind === 'card' ? '' : Math.round(C.accountBalance(a, State.transactions, TODAY)), 'מסגרת': C.num(a.credit_limit), 'יום חיוב': a.billing_day || '', 'חיוב צפוי': C.num(a.expected_charge) })),
      'הלוואות': State.loans.map(l => ({ 'שם': l.name, 'מלווה': l.lender, 'סוג': LOAN_KINDS[l.kind], 'סכום מקורי': C.num(l.original_amount), 'יתרה': C.num(l.balance), 'החזר חודשי': C.num(l.monthly_payment), 'ריבית %': l.interest_rate ?? '', 'תשלומים שנותרו': l.payments_left ?? '', 'יום חיוב': l.payment_day })),
      'קבועים': State.recurring.map(r => ({ 'סוג': r.kind === 'income' ? 'הכנסה' : 'הוצאה', 'סכום': C.num(r.amount), 'קטגוריה': r.category, 'תיאור': r.description, 'יום בחודש': r.day_of_month, 'כל כמה חודשים': r.every_months, 'חשבון': accName(r.account_id), 'מתאריך': r.start_date, 'עד תאריך': r.end_date || '' })),
      'נכסים': State.assets.map(x => ({ 'שם': x.name, 'סוג': ASSET_KINDS[x.kind], 'שווי': C.num(x.value), 'בעלות %': x.ownership_pct, 'צמיחה שנתית %': x.annual_growth_pct })),
      'יעדים': State.goals.map(g => ({ 'שם': g.name, 'מדד': C.METRICS[g.metric].label, 'יעד': C.num(g.target), 'ערך התחלתי': C.num(g.start_value), 'תאריך יעד': g.target_date })),
      'תמונות מצב': State.snapshots.slice().sort((a, b) => a.date.localeCompare(b.date)).map(s => ({ 'תאריך': s.date, 'כסף בחשבונות': s.cash, 'מינוס': s.overdraft, 'חובות': s.debt, 'נכסים': s.assets, 'שווי נקי': s.net_worth }))
    };
    void k;
    const name = 'kalkala-' + TODAY;
    if (window.XLSX) {
      const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
      for (const [n, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), n);
      XLSX.writeFile(wb, name + '.xlsx');
    } else {
      const blob = new Blob([JSON.stringify({ exported: TODAY, ...State }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.json'; a.click();
    }
    toast('הקובץ ירד');
  }

  function viewSettings() {
    const O = owners(), remote = State.mode === 'remote';
    return back('הגדרות') + `<div class="card"><h2>משק הבית</h2>
      <label class="l">שם</label><input class="f" id="setName" value="${esc(State.household.name || '')}">
      <label class="l">איך לקרוא לי</label><input class="f" id="setMe" value="${esc(O.me)}">
      <label class="l">איך לקרוא לבן / בת הזוג</label><input class="f" id="setSp" value="${esc(O.spouse)}">
      <label class="l">כסף משותף</label><input class="f" id="setJo" value="${esc(O.joint)}">
      <button class="btn" data-act="savesettings">שמירה</button></div>
      ${remote ? `<div class="card"><h2>הוספת משתמש (למשל בת הזוג)</h2><input class="f" id="invEmail" type="email" placeholder="כתובת מייל" dir="ltr"><button class="btn sec" data-act="invite">הזמנה</button><div class="hint">אחרי ההזמנה, היא נרשמת לאתר עם המייל הזה ורואה את אותם נתונים.</div></div>
        <div class="card"><div class="hint">מחובר כ: ${esc(State.user && State.user.email)}</div><button class="btn ghost" data-act="logout">התנתקות</button></div>`
      : `<div class="card"><h2>מצב הדגמה</h2><div class="hint">הנתונים נשמרים רק בדפדפן. כדי לשמור בענן, מחברים Supabase לפי ההוראות בקובץ README.</div><button class="btn ghost" data-act="resetdemo">מחיקת כל נתוני ההדגמה</button></div>`}`;
  }

  // =====================================================================
  // טפסים
  // =====================================================================
  let F = null;
  function openForm(spec) {
    F = { spec, vals: Object.assign({}, spec.values || {}) };
    for (const f of spec.fields) if (F.vals[f.k] === undefined && f.def !== undefined) F.vals[f.k] = typeof f.def === 'function' ? f.def() : f.def;
    drawForm();
    $('sheetBg').style.display = 'block';
    requestAnimationFrame(() => $('sheet').classList.add('open'));
    const first = $('sheet').querySelector('input.amt');
    if (first && !spec.values) setTimeout(() => first.focus(), 260);
  }
  function closeForm() { $('sheet').classList.remove('open'); setTimeout(() => ($('sheetBg').style.display = 'none'), 200); F = null; }
  function opts(f) { return typeof f.options === 'function' ? f.options(F.vals) : f.options; }
  function drawForm() {
    const s = F.spec, v = F.vals;
    let h = `<div class="grab"></div><h3>${s.title}</h3>`;
    for (const f of s.fields) {
      if (f.show && !f.show(v)) continue;
      const val = v[f.k] ?? '';
      const lab = f.label ? `<label class="l">${f.label}</label>` : '';
      switch (f.type) {
        case 'seg': h += lab + `<div class="seg ${f.cls || ''}">${opts(f).map(([o, l]) => `<button type="button" class="${String(val) === String(o) ? 'on ' + o : ''}" data-fk="${f.k}" data-fv="${o}">${l}</button>`).join('')}</div>`; break;
        case 'chips': h += lab + `<div class="chips">${opts(f).map(o => `<button type="button" class="chip ${val === o ? 'on' : ''}" data-fk="${f.k}" data-fv="${esc(o)}">${esc(o)}</button>`).join('')}</div>`; break;
        case 'select': h += lab + `<select class="f" data-fin="${f.k}">${opts(f).map(([o, l]) => `<option value="${esc(o)}" ${String(val) === String(o) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`; break;
        case 'amount': h += `<input class="amt" data-fin="${f.k}" inputmode="decimal" placeholder="₪0" value="${esc(val)}">`; break;
        case 'toggle': h += `<label class="tog"><input type="checkbox" data-fin="${f.k}" ${val ? 'checked' : ''}> ${f.label}</label>`; break;
        case 'textarea': h += lab + `<textarea class="f" data-fin="${f.k}">${esc(val)}</textarea>`; break;
        case 'note': h += `<div class="hint">${typeof f.text === 'function' ? f.text(v) : f.text}</div>`; break;
        default: h += lab + `<input class="f" type="${f.type === 'number' ? 'text' : f.type || 'text'}" ${f.type === 'number' ? 'inputmode="decimal"' : ''} data-fin="${f.k}" value="${esc(val)}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>`;
      }
    }
    h += `<div class="err" id="fErr"></div><button class="btn" data-act="fsave">${s.saveLabel || 'שמירה'}</button>`;
    if (s.onDelete) h += `<button class="btn ghost" data-act="fdel">${s.deleteLabel || 'מחיקה'}</button>`;
    $('sheet').innerHTML = h;
  }
  function readNum(x) { if (x === '' || x == null) return null; const n = C.parseAmount(x); return n == null ? NaN : n; }
  async function saveForm() {
    const s = F.spec, v = { ...F.vals };
    for (const f of s.fields) {
      if (f.show && !f.show(v)) continue;
      if (f.type === 'number' || f.type === 'amount') { const n = readNum(v[f.k]); if (Number.isNaN(n)) return ($('fErr').textContent = `"${f.label || 'סכום'}" צריך להיות מספר`); v[f.k] = n; }
      if (f.req && (v[f.k] === '' || v[f.k] == null)) return ($('fErr').textContent = `חסר: ${f.label || 'סכום'}`);
    }
    const btn = $('sheet').querySelector('[data-act=fsave]'); btn.disabled = true;
    try { await s.onSave(v); closeForm(); toast('נשמר'); afterChange(); }
    catch (e) { console.error(e); $('fErr').textContent = 'שגיאה: ' + (e.message || e); btn.disabled = false; }
  }
  async function deleteForm(el) {
    if (!el.dataset.sure) { el.dataset.sure = 1; el.textContent = 'ללחוץ שוב לאישור המחיקה'; return; }
    try { await F.spec.onDelete(); closeForm(); toast('נמחק'); afterChange(); } catch (e) { $('fErr').textContent = 'שגיאה: ' + (e.message || e); }
  }

  const ownerOpts = () => { const O = owners(); return [['me', O.me], ['spouse', O.spouse], ['joint', O.joint]]; };
  const accOpts = (filter = () => true, none = 'ללא') => [['', none]].concat(State.accounts.filter(a => a.active !== false && filter(a)).map(a => [a.id, a.name + (a.kind === 'card' ? ' (אשראי)' : '')]));
  const catUsage = kind => { const c = {}; State.transactions.filter(t => t.kind === kind).forEach(t => (c[t.category] = (c[t.category] || 0) + 1)); const base = kind === 'income' ? INC_CATS : EXP_CATS; return base.slice().sort((a, b) => (c[b] || 0) - (c[a] || 0)); };
  const lastAcc = () => { try { return localStorage.getItem('kalkala-lastacc') || ''; } catch { return ''; } };

  // תנועה (הוספה מהירה)
  function txForm(t) {
    openForm({ title: t ? 'עריכת תנועה' : 'הוספה מהירה', values: t ? { ...t } : null,
      fields: [
        { k: 'kind', type: 'seg', cls: 'kind', def: 'expense', options: [['expense', 'הוצאה'], ['income', 'הכנסה']].concat(t && t.kind === 'transfer' ? [['transfer', 'העברה']] : []), rerender: true },
        { k: 'amount', type: 'amount', req: true },
        { k: 'category', type: 'chips', label: 'קטגוריה', options: v => catUsage(v.kind), def: 'מזון וקניות', show: v => v.kind !== 'transfer' },
        { k: 'account_id', type: 'select', label: 'מאיזה חשבון / כרטיס', options: () => accOpts(), def: () => { const l = lastAcc(); const act = State.accounts.filter(x => x.active !== false); return act.some(x => x.id === l) ? l : (act.find(x => x.kind === 'bank') || act[0] || {}).id || ''; } },
        { k: 'date', type: 'date', label: 'תאריך', def: TODAY, req: true },
        { k: 'description', label: 'תיאור', ph: 'לא חובה' },
        { k: 'owner', type: 'seg', label: 'שייך ל', options: ownerOpts, def: 'joint' },
        { k: 'is_fixed', type: 'toggle', label: 'הוצאה / הכנסה קבועה' }
      ],
      onSave: async v => {
        if (v.kind !== 'transfer' && !catUsage(v.kind).includes(v.category)) v.category = v.kind === 'income' ? 'הכנסה נוספת' : 'לא מסווג';
        const row = { kind: v.kind, amount: v.amount, category: v.category, account_id: v.account_id || null, date: v.date, description: v.description || null, owner: v.owner || 'joint', is_fixed: !!v.is_fixed };
        try { localStorage.setItem('kalkala-lastacc', v.account_id || ''); } catch (e) { /* ignore */ }
        if (t) await DB.update('transactions', t.id, row); else await DB.insert('transactions', row);
      },
      onDelete: t ? async () => DB.remove('transactions', t.id) : null });
  }

  function accForm(a, kind) {
    const isNew = !a; kind = a ? a.kind : kind || 'bank';
    const cur = a && a.kind !== 'card' ? Math.round(C.accountBalance(a, State.transactions, TODAY) * 100) / 100 : 0;
    openForm({ title: isNew ? (kind === 'card' ? 'כרטיס אשראי חדש' : 'חשבון חדש') : 'עריכת ' + a.name,
      values: a ? { ...a, balance_now: cur, balance_date: TODAY } : null,
      fields: [
        { k: 'kind', type: 'seg', options: kind === 'card' ? [['card', 'כרטיס אשראי']] : [['bank', 'בנק'], ['savings', 'חיסכון'], ['cash', 'מזומן']], def: kind, rerender: true },
        { k: 'name', label: 'שם', req: true, ph: kind === 'card' ? 'ויזה של פועלים' : 'עו"ש פועלים' },
        { k: 'bank', label: 'בנק / חברה', ph: 'לא חובה' },
        { k: 'owner', type: 'seg', label: 'של מי', options: ownerOpts, def: 'joint' },
        { k: 'balance_now', type: 'number', label: 'יתרה נוכחית (מינוס עם סימן -)', def: 0, show: v => v.kind !== 'card' },
        { k: 'balance_date', type: 'date', label: 'נכון לתאריך', def: TODAY, show: v => v.kind !== 'card' },
        { k: 'credit_limit', type: 'number', label: 'מסגרת אשראי (מינוס מותר)', def: 0, show: v => v.kind === 'bank' },
        { k: 'expected_charge', type: 'number', label: 'חיוב צפוי בחודש', def: 0, show: v => v.kind === 'card' },
        { k: 'billing_day', type: 'number', label: 'יום חיוב בחודש', def: 10, show: v => v.kind === 'card' },
        { k: 'linked_account_id', type: 'select', label: 'מאיזה חשבון יורד החיוב', options: () => accOpts(x => x.kind !== 'card' && (!a || x.id !== a.id), 'לא ידוע'), show: v => v.kind === 'card' },
        { k: 'note', type: 'note', text: v => v.kind === 'card' ? 'הוצאות שתרשמו על הכרטיס נספרות בהוצאות החודש, אבל יורדות מהבנק רק ביום החיוב, לפי "חיוב צפוי".' : 'כשמעדכנים יתרה, התנועות שכבר נרשמו עד היום נחשבות כלולות בה.' }
      ],
      onSave: async v => {
        const row = { name: v.name, bank: v.bank || null, kind: v.kind, owner: v.owner, credit_limit: v.credit_limit || 0, expected_charge: v.expected_charge || 0,
          billing_day: v.kind === 'card' ? Math.min(31, Math.max(1, v.billing_day || 10)) : null, linked_account_id: v.kind === 'card' ? v.linked_account_id || null : null };
        if (v.kind !== 'card') {
          const d = v.balance_date || TODAY;
          // היתרה שהוזנה כוללת את כל התנועות שנרשמו מהתאריך הזה ועד היום
          const delta = a ? C.accountBalance({ ...a, opening_balance: 0, opening_date: d }, State.transactions, TODAY) : 0;
          row.opening_balance = (v.balance_now || 0) - delta; row.opening_date = d;
        }
        if (a) await DB.update('accounts', a.id, row); else await DB.insert('accounts', row);
      },
      onDelete: a ? async () => DB.update('accounts', a.id, { active: false }) : null, deleteLabel: 'הסרת החשבון' });
  }

  function loanForm(l) {
    openForm({ title: l ? 'עריכת ' + l.name : 'הלוואה / התחייבות חדשה', values: l ? { ...l } : null,
      fields: [
        { k: 'name', label: 'שם', req: true, ph: 'הלוואה לרכב' },
        { k: 'kind', type: 'select', label: 'סוג', options: Object.entries(LOAN_KINDS), def: 'bank' },
        { k: 'lender', label: 'ממי', ph: 'בנק / אדם' },
        { k: 'owner', type: 'seg', label: 'של מי', options: ownerOpts, def: 'joint' },
        { k: 'original_amount', type: 'number', label: 'סכום מקורי', def: 0 },
        { k: 'balance', type: 'number', label: 'יתרת חוב היום', req: true },
        { k: 'monthly_payment', type: 'number', label: 'החזר חודשי', def: 0 },
        { k: 'interest_rate', type: 'number', label: 'ריבית שנתית % (אם ידוע)' },
        { k: 'payments_left', type: 'number', label: 'תשלומים שנותרו (אם ידוע)' },
        { k: 'payment_day', type: 'number', label: 'יום חיוב בחודש', def: 10 },
        { k: 'account_id', type: 'select', label: 'יורד מחשבון', options: () => accOpts(), def: '' },
        { k: 'note', type: 'note', text: v => { const n = readNum(v.payments_left); return n > 0 ? `תאריך סיום משוער: ${mkLabel(C.addMonths(CUR_MK, n - 1))}` : 'עם מספר תשלומים, המערכת יודעת מתי ההלוואה נגמרת ומתי מתפנה כסף.'; } },
        { k: 'notes', type: 'textarea', label: 'הערות' }
      ],
      onSave: async v => {
        const row = { name: v.name, kind: v.kind, lender: v.lender || null, owner: v.owner, original_amount: v.original_amount || 0, balance: v.balance || 0, monthly_payment: v.monthly_payment || 0,
          interest_rate: v.interest_rate, payments_left: v.payments_left == null ? null : Math.round(v.payments_left), payment_day: Math.min(31, Math.max(1, v.payment_day || 10)), account_id: v.account_id || null, notes: v.notes || null };
        if (l) await DB.update('loans', l.id, row); else await DB.insert('loans', row);
      },
      onDelete: l ? async () => DB.update('loans', l.id, { active: false }) : null, deleteLabel: 'סימון כהסתיימה / הסרה' });
  }

  function recForm(r) {
    openForm({ title: r ? 'עריכת קבוע' : 'הכנסה / הוצאה קבועה', values: r ? { ...r } : null,
      fields: [
        { k: 'kind', type: 'seg', cls: 'kind', options: [['expense', 'הוצאה'], ['income', 'הכנסה']], def: 'expense', rerender: true },
        { k: 'amount', type: 'amount', req: true },
        { k: 'category', type: 'chips', label: 'קטגוריה', options: v => (v.kind === 'income' ? INC_CATS : EXP_CATS), def: v => 'חשבונות בית' },
        { k: 'description', label: 'תיאור', ph: 'משכורת, ארנונה, גן…' },
        { k: 'owner', type: 'seg', label: 'של מי', options: ownerOpts, def: 'joint' },
        { k: 'account_id', type: 'select', label: 'חשבון / כרטיס', options: () => accOpts() , def: '' },
        { k: 'day_of_month', type: 'number', label: 'יום בחודש', def: 1 },
        { k: 'every_months', type: 'select', label: 'תדירות', options: [['1', 'כל חודש'], ['2', 'כל חודשיים'], ['3', 'כל רבעון'], ['6', 'כל חצי שנה'], ['12', 'פעם בשנה']], def: '1' },
        { k: 'start_date', type: 'date', label: 'החל מ', def: TODAY },
        { k: 'end_date', type: 'date', label: 'עד (לא חובה)' },
        { k: 'active', type: 'toggle', label: 'פעיל', def: true }
      ],
      onSave: async v => {
        const cats = v.kind === 'income' ? INC_CATS : EXP_CATS;
        const row = { kind: v.kind, amount: v.amount, category: cats.includes(v.category) ? v.category : cats[cats.length - 1], description: v.description || null, owner: v.owner, account_id: v.account_id || null,
          day_of_month: Math.min(31, Math.max(1, v.day_of_month || 1)), every_months: +v.every_months || 1, start_date: v.start_date || TODAY, end_date: v.end_date || null, active: !!v.active };
        if (r) await DB.update('recurring', r.id, row); else await DB.insert('recurring', row);
      },
      onDelete: r ? async () => DB.remove('recurring', r.id) : null });
  }

  function assetForm(x) {
    openForm({ title: x ? 'עריכת ' + x.name : 'נכס חדש', values: x ? { ...x } : null,
      fields: [
        { k: 'name', label: 'שם', req: true, ph: 'דירה בלוד' },
        { k: 'kind', type: 'select', label: 'סוג', options: Object.entries(ASSET_KINDS), def: 'real_estate' },
        { k: 'value', type: 'number', label: 'שווי מלא היום', req: true },
        { k: 'ownership_pct', type: 'number', label: 'אחוז בעלות שלנו', def: 100 },
        { k: 'annual_growth_pct', type: 'number', label: 'צמיחה שנתית צפויה %', def: 0 },
        { k: 'notes', type: 'textarea', label: 'הערות' }
      ],
      onSave: async v => { const row = { name: v.name, kind: v.kind, value: v.value || 0, ownership_pct: v.ownership_pct ?? 100, annual_growth_pct: v.annual_growth_pct || 0, notes: v.notes || null }; if (x) await DB.update('assets', x.id, row); else await DB.insert('assets', row); },
      onDelete: x ? async () => DB.remove('assets', x.id) : null });
  }

  function goalForm(g) {
    openForm({ title: g ? 'עריכת יעד' : 'יעד צמיחה חדש', values: g ? { ...g } : null,
      fields: [
        { k: 'name', label: 'שם היעד', req: true, ph: 'יציאה מהמינוס' },
        { k: 'metric', type: 'select', label: 'מה מודדים', options: Object.entries(C.METRICS).map(([k, m]) => [k, m.label + (m.up ? ' (להגדיל)' : ' (להקטין)')]), def: 'overdraft', rerender: true },
        { k: 'note', type: 'note', text: v => 'עכשיו: ' + money(C.metricNow(v.metric, State, TODAY)) },
        { k: 'target', type: 'number', label: 'יעד', req: true, def: 0 },
        { k: 'target_date', type: 'date', label: 'עד תאריך', req: true, def: C.addMonths(CUR_MK, 12) + '-01' }
      ],
      onSave: async v => {
        const row = { name: v.name, metric: v.metric, target: v.target, target_date: v.target_date };
        if (g) { if (g.metric !== v.metric) Object.assign(row, { start_value: C.metricNow(v.metric, State, TODAY), start_date: TODAY }); await DB.update('goals', g.id, row); }
        else await DB.insert('goals', { ...row, start_value: C.metricNow(v.metric, State, TODAY), start_date: TODAY });
      },
      onDelete: g ? async () => DB.remove('goals', g.id) : null });
  }

  function confirmForm(t, id, date, amt) {
    const due = date > TODAY ? TODAY : date;
    const src = t === 'recurring' ? State.recurring.find(x => x.id === id) : t === 'loan' ? State.loans.find(x => x.id === id) : State.accounts.find(x => x.id === id);
    if (!src) return;
    const title = t === 'recurring' ? (src.kind === 'income' ? 'אישור הכנסה: ' : 'אישור תשלום: ') + (src.description || src.category) : t === 'loan' ? 'תשלום הלוואה: ' + src.name : 'חיוב כרטיס: ' + src.name;
    openForm({ title, values: { amount: amt, date: due }, saveLabel: 'אישור',
      fields: [{ k: 'amount', type: 'amount', req: true }, { k: 'date', type: 'date', label: 'תאריך', req: true },
        { k: 'note', type: 'note', text: t === 'loan' ? 'יתרת ההלוואה ומספר התשלומים יתעדכנו אוטומטית.' : t === 'card' ? 'נרשם כהעברה מהבנק לכרטיס, ולא נספר שוב כהוצאה.' : 'הסכום ייכנס לתנועות בפועל.' }],
      onSave: async v => {
        if (t === 'recurring') await DB.insert('transactions', { kind: src.kind, amount: v.amount, category: src.category, description: src.description || src.category, owner: src.owner, account_id: src.account_id, date: v.date, is_fixed: true, recurring_id: src.id });
        else if (t === 'loan') {
          await DB.insert('transactions', { kind: 'expense', amount: v.amount, category: src.kind === 'mortgage' ? 'משכנתא' : 'הלוואות', description: src.name, owner: src.owner, account_id: src.account_id, date: v.date, is_fixed: true, loan_id: src.id });
          const bal = C.num(src.balance), r = src.interest_rate != null && src.interest_rate !== '' ? C.num(src.interest_rate) / 1200 : null;
          const left = src.payments_left == null || src.payments_left === '' ? null : C.num(src.payments_left);
          let nb = r != null ? bal - (v.amount - bal * r) : left ? bal - bal / left : bal - v.amount;
          nb = Math.max(0, Math.round(nb * 100) / 100);
          await DB.update('loans', src.id, { balance: left === 1 ? 0 : nb, payments_left: left == null ? null : Math.max(0, left - 1) });
        } else await DB.insert('transactions', { kind: 'transfer', amount: v.amount, category: 'חיוב כרטיס', description: 'חיוב ' + src.name, owner: src.owner, account_id: src.linked_account_id, to_account_id: src.id, date: v.date, is_fixed: false });
      } });
  }

  // =====================================================================
  // ניתוב ואירועים
  // =====================================================================
  const VIEWS = { home: [viewHome, afterHome], flow: [viewFlow, afterFlow], wealth: [viewWealth, afterWealth], forecast: [viewForecast, afterForecast], more: [viewMore, () => {}] };
  function render() {
    Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; });
    const [v, after] = VIEWS[UI.view];
    $('app').innerHTML = v();
    document.querySelectorAll('nav.bn button[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === UI.view));
    try { after(); } catch (e) { console.error(e); }
  }
  function go(view, sub = null) { UI.view = view; UI.sub = sub; render(); window.scrollTo(0, 0); }
  let snapT;
  function afterChange() { render(); clearTimeout(snapT); snapT = setTimeout(saveSnapshot, 1500); }
  async function saveSnapshot() {
    try {
      const p = C.position(State, TODAY);
      const s = { date: TODAY, cash: Math.round(p.cash), overdraft: Math.round(p.overdraft), debt: Math.round(p.debt), assets: Math.round(p.assets), net_worth: Math.round(p.netWorth) };
      const old = State.snapshots.find(x => x.date === TODAY);
      if (old && ['cash', 'overdraft', 'debt', 'assets', 'net_worth'].every(k => Math.round(old[k]) === s[k])) return;
      if (!State.accounts.length && !State.loans.length && !State.assets.length) return;
      await DB.upsertSnapshot(s);
    } catch (e) { console.warn('snapshot', e); }
  }

  const ACTIONS = {
    go: el => go(el.dataset.v),
    sub: el => go('more', el.dataset.s),
    back: () => go('more'),
    mprev: () => { UI.month = C.addMonths(UI.month, -1); render(); },
    mnext: () => { UI.month = C.addMonths(UI.month, 1); render(); },
    ffilt: el => { UI.flowFilter = el.dataset.v; render(); },
    fctab: el => { UI.fcTab = el.dataset.v; render(); },
    edittx: el => txForm(State.transactions.find(x => x.id === el.dataset.id)),
    addacc: () => accForm(null, 'bank'), addcard: () => accForm(null, 'card'), editacc: el => accForm(State.accounts.find(x => x.id === el.dataset.id)),
    addloan: () => loanForm(null), editloan: el => loanForm(State.loans.find(x => x.id === el.dataset.id)),
    addasset: () => assetForm(null), editasset: el => assetForm(State.assets.find(x => x.id === el.dataset.id)),
    addrec: () => recForm(null), editrec: el => recForm(State.recurring.find(x => x.id === el.dataset.id)),
    addgoal: () => goalForm(null), editgoal: el => goalForm(State.goals.find(x => x.id === el.dataset.id)),
    confirm: el => confirmForm(el.dataset.t, el.dataset.id, el.dataset.d, +el.dataset.amt),
    fsave: () => saveForm(), fdel: el => deleteForm(el),
    export: () => exportAll(),
    doimport: async el => {
      const parsed = parseImport(), dup = new Set(State.transactions.map(t => t.import_hash).filter(Boolean));
      const fresh = parsed.filter(p => !dup.has(p.import_hash));
      if (!fresh.length) return;
      el.disabled = true; el.textContent = 'מייבא…';
      try { const r = await DB.insertMany('transactions', fresh); toast(`יובאו ${r.length} תנועות`); IMP.rows = null; IMP.file = ''; afterChange(); go('flow'); }
      catch (e) { $('impErr').textContent = 'שגיאה: ' + (e.message || e); el.disabled = false; }
    },
    savesettings: async () => {
      const settings = Object.assign({}, State.household.settings || {}, { owners: { me: $('setMe').value.trim() || 'אני', spouse: $('setSp').value.trim() || 'בן/בת הזוג', joint: $('setJo').value.trim() || 'משותף' } });
      try { await DB.saveHousehold({ name: $('setName').value.trim() || 'המשפחה שלי', settings }); toast('נשמר'); render(); } catch (e) { toast('שגיאה: ' + e.message); }
    },
    invite: async () => { const em = $('invEmail').value.trim(); if (!/.+@.+\..+/.test(em)) return toast('כתובת מייל לא תקינה'); try { await DB.invite(em); toast('ההזמנה נשמרה'); $('invEmail').value = ''; } catch (e) { toast('שגיאה: ' + e.message); } },
    logout: async () => { await DB.remote.signOut(); location.reload(); },
    resetdemo: el => { if (!el.dataset.sure) { el.dataset.sure = 1; el.textContent = 'ללחוץ שוב לאישור'; return; } DB.local.reset(); location.reload(); }
  };
  document.addEventListener('click', e => {
    const fk = e.target.closest('[data-fk]');
    if (fk && F) { const f = F.spec.fields.find(x => x.k === fk.dataset.fk); F.vals[fk.dataset.fk] = fk.dataset.fv; syncInputs(); if (f && f.rerender) { const fv = F.spec.fields.find(x => x.type === 'chips'); if (fv) { const o = opts(fv); if (!o.includes(F.vals[fv.k])) F.vals[fv.k] = o[0]; } } drawForm(); return; }
    const a = e.target.closest('[data-act]');
    if (a && ACTIONS[a.dataset.act]) ACTIONS[a.dataset.act](a);
  });
  function syncInputs() { if (!F) return; $('sheet').querySelectorAll('[data-fin]').forEach(i => { F.vals[i.dataset.fin] = i.type === 'checkbox' ? i.checked : i.value; }); }
  document.addEventListener('input', e => {
    const i = e.target;
    if (i.dataset && i.dataset.fin && F) { F.vals[i.dataset.fin] = i.type === 'checkbox' ? i.checked : i.value; const f = F.spec.fields.find(x => x.k === i.dataset.fin); if ((f && f.rerender) || F.spec.fields.some(x => x.type === 'note' && typeof x.text === 'function')) { if (i.tagName === 'SELECT' || i.type === 'checkbox') drawForm(); } }
    if (i.id === 'txSearch') { UI.search = i.value; const list = $('txList'); const q = i.value.trim(); const l = State.transactions.filter(t => !q || [t.description, t.category, accName(t.account_id), String(t.amount)].join(' ').includes(q)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300); list.innerHTML = l.length ? l.map(txRow).join('') : '<div class="empty">אין תנועות</div>'; }
  });
  document.addEventListener('change', e => {
    const i = e.target;
    if (i.id === 'impFile' && i.files[0]) loadImportFile(i.files[0]).catch(err => toast('לא הצלחתי לקרוא את הקובץ: ' + err.message));
    if (i.dataset && i.dataset.imp) { const k = i.dataset.imp; if (k === 'hi') setHeader(+i.value); else if (k === 'sign') IMP.sign = i.value; else if (k === 'account') IMP.account = i.value; else IMP.map[k] = i.value; render(); }
    if (i.dataset && i.dataset.fin && F && i.type === 'date') { F.vals[i.dataset.fin] = i.value; }
  });
  $('sheetBg').addEventListener('click', closeForm);
  document.querySelectorAll('nav.bn button[data-v]').forEach(b => b.addEventListener('click', () => go(b.dataset.v)));
  $('fab').addEventListener('click', () => txForm(null));

  // =====================================================================
  // התחברות ואתחול
  // =====================================================================
  function renderAuth(msg = '') {
    $('nav').style.display = 'none';
    const remote = DB.hasSupabase;
    $('app').innerHTML = `<div class="auth"><div class="logo">כלכלת הבית</div><p>שליטה בתזרים, בחובות ובתחזית של המשפחה</p>
      ${remote ? `<div class="card"><label class="l">מייל</label><input class="f" id="aEmail" type="email" dir="ltr" autocomplete="email">
        <label class="l">סיסמה</label><input class="f" id="aPass" type="password" dir="ltr" autocomplete="current-password">
        <div class="err" id="aErr">${esc(msg)}</div><button class="btn" id="aIn">כניסה</button><button class="btn sec" id="aUp">הרשמה</button></div>`
      : `<div class="card"><h2>עוד לא חובר מסד נתונים</h2><div class="hint">כדי לשמור את הנתונים בענן ולהיכנס מכל מכשיר עם סיסמה, ממלאים את הקובץ js/config.js לפי ההוראות ב-README. בינתיים אפשר לנסות את האתר במצב הדגמה. הנתונים בו נשמרים רק בדפדפן הזה.</div>
        <button class="btn" id="dEmpty">התחלה במצב הדגמה (ריק)</button><button class="btn sec" id="dSeed">מצב הדגמה עם נתוני דוגמה</button></div>`}</div>`;
    if (remote) {
      const go2 = async up => {
        const em = $('aEmail').value.trim(), pw = $('aPass').value;
        if (!em || pw.length < 6) return ($('aErr').textContent = 'צריך מייל וסיסמה של 6 תווים לפחות');
        $('aErr').textContent = '';
        try {
          if (up) { const d = await DB.remote.signUp(em, pw); if (!d.session) return ($('aErr').textContent = 'נשלח אליך מייל לאישור. אחרי האישור חוזרים לכאן ונכנסים.'); }
          else await DB.remote.signIn(em, pw);
          await start();
        } catch (e) { $('aErr').textContent = /Invalid login/i.test(e.message) ? 'מייל או סיסמה שגויים' : e.message; }
      };
      $('aIn').onclick = () => go2(false); $('aUp').onclick = () => go2(true);
    } else {
      $('dEmpty').onclick = async () => { DB.local.read(); DB.local.write(); await start(); };
      $('dSeed').onclick = async () => { DB.local.reset(); await seedDemo(); await start(); };
    }
  }
  async function start() {
    try { await DB.load(); } catch (e) { return renderAuth(e.message || String(e)); }
    $('nav').style.display = 'flex';
    render();
    saveSnapshot();
  }
  async function seedDemo() {
    DB.use('local'); await DB.load();
    const A = await DB.insert('accounts', { name: 'עו"ש פועלים', bank: 'פועלים', kind: 'bank', owner: 'me', opening_balance: -8400, opening_date: TODAY, credit_limit: 15000 });
    const B = await DB.insert('accounts', { name: 'עו"ש לאומי', bank: 'לאומי', kind: 'bank', owner: 'spouse', opening_balance: 2300, opening_date: TODAY, credit_limit: 5000 });
    await DB.insert('accounts', { name: 'פיקדון', bank: 'פועלים', kind: 'savings', owner: 'joint', opening_balance: 12000, opening_date: TODAY, credit_limit: 0 });
    const V = await DB.insert('accounts', { name: 'ויזה פועלים', bank: 'כאל', kind: 'card', owner: 'joint', billing_day: 10, expected_charge: 3400, linked_account_id: A.id, opening_balance: 0, opening_date: TODAY });
    const rec = [
      ['income', 11500, 'משכורת שלי', 'משכורת', 'me', A.id, 10], ['income', 8200, 'משכורת אשתי', 'משכורת', 'spouse', B.id, 1], ['income', 2250, 'שכירות', 'שכירות דירה בלוד (50%)', 'joint', A.id, 5],
      ['expense', 5200, 'שכירות', 'שכר דירה', 'joint', A.id, 1], ['expense', 1850, 'תינוק וילדים', 'מעון', 'joint', B.id, 3], ['expense', 640, 'חשבונות בית', 'ארנונה', 'joint', A.id, 15],
      ['expense', 320, 'ביטוחים', 'ביטוח בריאות', 'joint', V.id, 25], ['expense', 150, 'תקשורת', 'סלולר ואינטרנט', 'joint', V.id, 27]];
    for (const [kind, amount, category, description, owner, account_id, day] of rec) await DB.insert('recurring', { kind, amount, category, description, owner, account_id, day_of_month: day, every_months: 1, start_date: C.addMonths(CUR_MK, -4) + '-01', end_date: null, active: true });
    await DB.insert('loans', { name: 'משכנתא דירה בלוד (חלקי)', kind: 'mortgage', lender: 'מזרחי טפחות', owner: 'joint', original_amount: 340000, balance: 312000, monthly_payment: 1650, interest_rate: 4.6, payments_left: 260, payment_day: 10, account_id: A.id });
    await DB.insert('loans', { name: 'הלוואה לרכב', kind: 'bank', lender: 'פועלים', owner: 'me', original_amount: 60000, balance: 41000, monthly_payment: 1280, interest_rate: 7.9, payments_left: 36, payment_day: 15, account_id: A.id });
    await DB.insert('loans', { name: 'הלוואה מההורים', kind: 'person', lender: 'הורים', owner: 'joint', original_amount: 15000, balance: 9000, monthly_payment: 500, interest_rate: null, payments_left: 18, payment_day: 1, account_id: B.id });
    await DB.insert('assets', { name: 'דירה בלוד', kind: 'real_estate', value: 1450000, ownership_pct: 50, annual_growth_pct: 3 });
    await DB.insert('assets', { name: 'קרן השתלמות', kind: 'pension', value: 48000, ownership_pct: 100, annual_growth_pct: 5 });
    // היסטוריה: הוצאות משתנות ב-3 החודשים האחרונים
    const pool = [['מזון וקניות', 'שופרסל', 420], ['מזון וקניות', 'מינימרקט', 85], ['תחבורה ודלק', 'פז', 300], ['בריאות', 'סופר פארם', 120], ['ביגוד', 'קסטרו', 260], ['הוצאות אישיות', 'מספרה', 80], ['תינוק וילדים', 'טיטולים', 140], ['הוצאות בלתי צפויות', 'תיקון מזגן', 450]];
    const rows = [];
    for (let m = -3; m <= 0; m++) {
      const mk = C.addMonths(CUR_MK, m), days = m === 0 ? Math.max(1, +TODAY.slice(8, 10)) : C.daysIn(mk);
      pool.forEach(([cat, desc, base], i) => {
        const times = cat === 'מזון וקניות' ? 4 : i === 7 ? (m === -2 ? 1 : 0) : 1;
        for (let k = 0; k < times; k++) { const d = Math.min(days, 2 + ((i * 7 + k * 6 + (m + 3) * 3) % 26)); if (m === 0 && d > days) continue; rows.push({ kind: 'expense', amount: Math.round(base * (0.8 + ((i + k + m + 9) % 5) * 0.1)), category: cat, description: desc, owner: 'joint', account_id: i % 3 ? V.id : A.id, date: C.dateIn(mk, d), is_fixed: false, source: 'manual' }); }
      });
      const tdy = +TODAY.slice(8, 10);
      for (const r of State.recurring) if (m < 0 || r.day_of_month < tdy) rows.push({ kind: r.kind, amount: r.amount, category: r.category, description: r.description, owner: r.owner, account_id: r.account_id, date: C.dateIn(mk, r.day_of_month), is_fixed: true, recurring_id: r.id, source: 'manual' });
      if (m === 0) {
        for (const l of State.loans) if (l.payment_day < tdy) rows.push({ kind: 'expense', amount: l.monthly_payment, category: l.kind === 'mortgage' ? 'משכנתא' : 'הלוואות', description: l.name, owner: l.owner, account_id: l.account_id, date: C.dateIn(mk, l.payment_day), is_fixed: true, loan_id: l.id, source: 'manual' });
        if (V.billing_day < tdy) rows.push({ kind: 'transfer', amount: 3250, category: 'חיוב כרטיס', description: 'חיוב ' + V.name, owner: 'joint', account_id: A.id, to_account_id: V.id, date: C.dateIn(mk, V.billing_day), source: 'manual' });
      }
    }
    for (const r of rows) await DB.insert('transactions', r);
    await DB.insert('goals', { name: 'יציאה מהמינוס', metric: 'overdraft', target: 0, start_value: 8400, start_date: TODAY, target_date: C.addMonths(CUR_MK, 10) + '-01' });
    await DB.insert('goals', { name: 'שווי נקי של חצי מיליון', metric: 'net_worth', target: 500000, start_value: C.metricNow('net_worth', State, TODAY), start_date: TODAY, target_date: C.addMonths(CUR_MK, 36) + '-01' });
    const hist = [[-120, -5200, 50500], [-90, -6100, 49600], [-60, -6900, 48700], [-30, -7800, 47800]];
    for (const [d, od, debt] of hist) { const dt = new Date(); dt.setDate(dt.getDate() + d); await DB.upsertSnapshot({ date: C.iso(dt), cash: 14300, overdraft: -od, debt: debt + 312000, assets: 773000, net_worth: 14300 + od + 773000 - debt - 312000 }); }
  }

  async function boot() {
    const wantDemo = /demo/.test(location.hash);
    if (DB.hasSupabase && !wantDemo) {
      DB.use('remote');
      try { const s = await DB.remote.session(); if (!s) return renderAuth(); await start(); }
      catch (e) { renderAuth(e.message); }
      DB.remote.client().auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') renderAuth(); });
    } else {
      DB.use('local');
      let has = false; try { has = !!localStorage.getItem('kalkala-demo-v1'); } catch (e) { /* ignore */ }
      if (has) await start(); else renderAuth();
    }
  }
  window.__app = { State, Calc: C, UI, go, render };
  boot();
})();
