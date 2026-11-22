/* כלכלת הבית – שכבת נתונים: Supabase או מצב הדגמה (בדפדפן) */
(function (root) {
  'use strict';
  const TABLES = ['accounts', 'loans', 'recurring', 'transactions', 'assets', 'goals', 'snapshots'];
  const State = { household: null, user: null, mode: null };
  TABLES.forEach(t => (State[t] = []));

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const cfg = root.APP_CONFIG || {};
  const hasSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && root.supabase && !/YOUR_|xxx/i.test(cfg.SUPABASE_URL));

  // ---------- מצב הדגמה ----------
  const LS = 'kalkala-demo-v1';
  const Local = {
    db: null,
    read() { try { this.db = JSON.parse(localStorage.getItem(LS)) || null; } catch { this.db = null; } if (!this.db) { this.db = { household: { id: 'demo', name: 'משפחת הדגמה', settings: {} } }; TABLES.forEach(t => (this.db[t] = [])); } },
    write() { try { localStorage.setItem(LS, JSON.stringify(this.db)); } catch (e) { console.warn(e); } },
    async load() { this.read(); State.household = this.db.household; TABLES.forEach(t => (State[t] = this.db[t].slice())); },
    async insert(t, row) { const r = { id: uid(), created_at: new Date().toISOString(), household_id: 'demo', ...row }; this.db[t].push(r); this.write(); return r; },
    async insertMany(t, rows) {
      const have = new Set(this.db[t].map(x => x.import_hash).filter(Boolean));
      const out = [];
      for (const row of rows) { if (row.import_hash && have.has(row.import_hash)) continue; have.add(row.import_hash); out.push(await this.insert(t, row)); }
      return out;
    },
    async update(t, id, patch) { const r = this.db[t].find(x => x.id === id); Object.assign(r, patch); this.write(); return { ...r }; },
    async remove(t, id) { this.db[t] = this.db[t].filter(x => x.id !== id); this.write(); },
    async upsertSnapshot(s) { const i = this.db.snapshots.findIndex(x => x.date === s.date); const r = { household_id: 'demo', ...s }; if (i >= 0) this.db.snapshots[i] = r; else this.db.snapshots.push(r); this.write(); return r; },
    async saveHousehold(patch) { Object.assign(this.db.household, patch); this.write(); return this.db.household; },
    async invite() { throw new Error('בהדגמה אין משתמשים נוספים'); },
    reset() { localStorage.removeItem(LS); }
  };

  // ---------- Supabase ----------
  const Remote = {
    sb: null,
    client() { return this.sb || (this.sb = root.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)); },
    async session() { const { data } = await this.client().auth.getSession(); return data.session; },
    async signIn(email, password) { const { error } = await this.client().auth.signInWithPassword({ email, password }); if (error) throw error; },
    async signUp(email, password) { const { data, error } = await this.client().auth.signUp({ email, password }); if (error) throw error; return data; },
    async signOut() { await this.client().auth.signOut(); },
    async fetchAll(t, hh) {
      const out = []; const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await this.client().from(t).select('*').eq('household_id', hh).range(from, from + size - 1);
        if (error) throw error;
        out.push(...data); if (data.length < size) break;
      }
      return out;
    },
    async load() {
      const s = await this.session(); State.user = s.user;
      const { data: mem, error } = await this.client().from('household_members').select('household_id').eq('user_id', s.user.id).limit(1);
      if (error) throw error;
      if (!mem.length) throw new Error('לא נמצא משק בית למשתמש. בדקו שהסכמה הורצה במלואה (כולל ה-trigger).');
      const hh = mem[0].household_id;
      const { data: h } = await this.client().from('households').select('*').eq('id', hh).single();
      State.household = h;
      const res = await Promise.all(TABLES.map(t => this.fetchAll(t, hh)));
      TABLES.forEach((t, i) => (State[t] = res[i]));
    },
    async insert(t, row) { const { data, error } = await this.client().from(t).insert({ ...row, household_id: State.household.id }).select().single(); if (error) throw error; return data; },
    async insertMany(t, rows) {
      const out = [];
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map(r => ({ ...r, household_id: State.household.id }));
        const { data, error } = await this.client().from(t).upsert(chunk, { onConflict: 'household_id,import_hash', ignoreDuplicates: true }).select();
        if (error) throw error; out.push(...(data || []));
      }
      return out;
    },
    async update(t, id, patch) { const { data, error } = await this.client().from(t).update(patch).eq('id', id).select().single(); if (error) throw error; return data; },
    async remove(t, id) { const { error } = await this.client().from(t).delete().eq('id', id); if (error) throw error; },
    async upsertSnapshot(s) { const { data, error } = await this.client().from('snapshots').upsert({ ...s, household_id: State.household.id }, { onConflict: 'household_id,date' }).select().single(); if (error) throw error; return data; },
    async saveHousehold(patch) { const { data, error } = await this.client().from('households').update(patch).eq('id', State.household.id).select().single(); if (error) throw error; return data; },
    async invite(email) { const { error } = await this.client().from('household_invites').upsert({ email: email.trim().toLowerCase(), household_id: State.household.id }); if (error) throw error; }
  };

  const DB = {
    hasSupabase,
    impl: null,
    use(mode) { State.mode = mode; this.impl = mode === 'remote' ? Remote : Local; },
    remote: Remote,
    local: Local,
    async load() { await this.impl.load(); },
    async insert(t, row) { const r = await this.impl.insert(t, row); State[t].push(r); return r; },
    async insertMany(t, rows) { const r = await this.impl.insertMany(t, rows); State[t].push(...r); return r; },
    async update(t, id, patch) { const r = await this.impl.update(t, id, patch); const i = State[t].findIndex(x => x.id === id); if (i >= 0) State[t][i] = r; return r; },
    async remove(t, id) { await this.impl.remove(t, id); State[t] = State[t].filter(x => x.id !== id); },
    async upsertSnapshot(s) { const r = await this.impl.upsertSnapshot(s); const i = State.snapshots.findIndex(x => x.date === s.date); if (i >= 0) State.snapshots[i] = r; else State.snapshots.push(r); return r; },
    async saveHousehold(patch) { State.household = await this.impl.saveHousehold(patch); return State.household; },
    async invite(email) { return this.impl.invite(email); }
  };

  root.State = State;
  root.DB = DB;
  root.TABLES = TABLES;
})(window);
