/* ============================================
   GOLFHERO — Core JS
   Auth, State, Utilities, API layer
   ============================================ */

'use strict';

/* ─── App State ─────────────────────────────── */
const GH = {
  version: '1.0.0',
  state: {
    user: null,
    subscription: null,
    scores: [],
    charities: [],
    draws: [],
  },

  /* ─── Local Storage Helpers ─── */
  store: {
    get: (k)    => { try { return JSON.parse(localStorage.getItem('gh_'+k)); } catch { return null; } },
    set: (k, v) => localStorage.setItem('gh_'+k, JSON.stringify(v)),
    del: (k)    => localStorage.removeItem('gh_'+k),
    clear: ()   => Object.keys(localStorage).filter(k=>k.startsWith('gh_')).forEach(k=>localStorage.removeItem(k)),
  },

  /* ─── Auth ─── */
  auth: {
    isLoggedIn: () => !!GH.store.get('user'),
    getUser:    () => GH.store.get('user'),
    isAdmin:    () => { const u = GH.store.get('user'); return u && u.role === 'admin'; },

    login(email, password) {
      // Demo users — replace with Supabase auth
      const users = GH.store.get('users') || GH.demo.seedUsers();
      const user = users.find(u => u.email === email && u.password === password);
      if (!user) throw new Error('Invalid email or password');
      const { password: _, ...safeUser } = user;
      GH.store.set('user', safeUser);
      GH.state.user = safeUser;
      return safeUser;
    },

    register(data) {
      const users = GH.store.get('users') || GH.demo.seedUsers();
      if (users.find(u => u.email === data.email)) throw new Error('Email already registered');
      const user = {
        id: 'u_' + Date.now(),
        ...data,
        role: 'subscriber',
        createdAt: new Date().toISOString(),
        subscriptionStatus: 'inactive',
        selectedCharity: null,
        charityPercent: 10,
      };
      users.push(user);
      GH.store.set('users', users);
      const { password: _, ...safeUser } = user;
      GH.store.set('user', safeUser);
      GH.state.user = safeUser;
      return safeUser;
    },

    logout() {
      GH.store.del('user');
      GH.state.user = null;
      window.location.href = '/index.html';
    },

    requireAuth(adminOnly = false) {
      if (!GH.auth.isLoggedIn()) { window.location.href = '/pages/login.html'; return false; }
      if (adminOnly && !GH.auth.isAdmin()) { window.location.href = '/pages/dashboard.html'; return false; }
      return true;
    },
  },

  /* ─── Score Management ─── */
  scores: {
    MAX: 5,
    MIN_SCORE: 1,
    MAX_SCORE: 45,

    getAll() {
      const user = GH.auth.getUser();
      if (!user) return [];
      const allScores = GH.store.get('scores') || {};
      return (allScores[user.id] || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    add(score, date) {
      const user = GH.auth.getUser();
      if (!user) throw new Error('Not logged in');
      score = parseInt(score);
      if (isNaN(score) || score < GH.scores.MIN_SCORE || score > GH.scores.MAX_SCORE)
        throw new Error(`Score must be between ${GH.scores.MIN_SCORE} and ${GH.scores.MAX_SCORE}`);
      if (!date) throw new Error('Date is required');
      const allScores = GH.store.get('scores') || {};
      const userScores = allScores[user.id] || [];
      if (userScores.find(s => s.date === date)) throw new Error('A score already exists for this date');
      userScores.push({ id: 's_' + Date.now(), score, date, createdAt: new Date().toISOString() });
      // Keep only latest 5 by date
      userScores.sort((a, b) => new Date(b.date) - new Date(a.date));
      allScores[user.id] = userScores.slice(0, GH.scores.MAX);
      GH.store.set('scores', allScores);
      return allScores[user.id];
    },

    update(id, score, date) {
      const user = GH.auth.getUser();
      if (!user) throw new Error('Not logged in');
      score = parseInt(score);
      if (isNaN(score) || score < GH.scores.MIN_SCORE || score > GH.scores.MAX_SCORE)
        throw new Error(`Score must be between ${GH.scores.MIN_SCORE} and ${GH.scores.MAX_SCORE}`);
      const allScores = GH.store.get('scores') || {};
      const userScores = allScores[user.id] || [];
      const idx = userScores.findIndex(s => s.id === id);
      if (idx === -1) throw new Error('Score not found');
      if (userScores.find(s => s.date === date && s.id !== id)) throw new Error('A score already exists for this date');
      userScores[idx] = { ...userScores[idx], score, date };
      allScores[user.id] = userScores;
      GH.store.set('scores', allScores);
      return userScores;
    },

    delete(id) {
      const user = GH.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const allScores = GH.store.get('scores') || {};
      const userScores = (allScores[user.id] || []).filter(s => s.id !== id);
      allScores[user.id] = userScores;
      GH.store.set('scores', allScores);
      return userScores;
    },

    scoreClass(s) {
      if (s >= 32) return 'high';
      if (s >= 20) return 'med';
      return 'low';
    },
  },

  /* ─── Subscriptions ─── */
  subscriptions: {
    plans: {
      monthly: { id: 'monthly', name: 'Monthly', price: 15, period: 'month', prizeContrib: 0.6, charityMin: 0.1 },
      yearly:  { id: 'yearly',  name: 'Yearly',  price: 150, period: 'year', prizeContrib: 0.6, charityMin: 0.1, discount: '17%' },
    },

    activate(planId) {
      const user = GH.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const plan = GH.subscriptions.plans[planId];
      if (!plan) throw new Error('Invalid plan');
      const users = GH.store.get('users') || [];
      const idx = users.findIndex(u => u.id === user.id);
      const now = new Date();
      const renewDate = new Date(now);
      if (planId === 'yearly') renewDate.setFullYear(renewDate.getFullYear() + 1);
      else renewDate.setMonth(renewDate.getMonth() + 1);
      const sub = {
        planId, status: 'active',
        startDate: now.toISOString(),
        renewDate: renewDate.toISOString(),
        price: plan.price,
      };
      if (idx > -1) { users[idx].subscriptionStatus = 'active'; users[idx].subscription = sub; }
      GH.store.set('users', users);
      const updatedUser = { ...user, subscriptionStatus: 'active', subscription: sub };
      GH.store.set('user', updatedUser);
      GH.state.user = updatedUser;
      return sub;
    },

    cancel() {
      const user = GH.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const users = GH.store.get('users') || [];
      const idx = users.findIndex(u => u.id === user.id);
      if (idx > -1) { users[idx].subscriptionStatus = 'cancelled'; }
      GH.store.set('users', users);
      const updatedUser = { ...user, subscriptionStatus: 'cancelled' };
      GH.store.set('user', updatedUser);
      GH.state.user = updatedUser;
    },

    isActive() {
      const user = GH.auth.getUser();
      return user && user.subscriptionStatus === 'active';
    },
  },

  /* ─── Charity ─── */
  charity: {
    getAll: () => GH.store.get('charities') || GH.demo.seedCharities(),

    select(charityId, percent = 10) {
      const user = GH.auth.getUser();
      if (!user) throw new Error('Not logged in');
      if (percent < 10 || percent > 100) throw new Error('Charity % must be between 10 and 100');
      const users = GH.store.get('users') || [];
      const idx = users.findIndex(u => u.id === user.id);
      if (idx > -1) { users[idx].selectedCharity = charityId; users[idx].charityPercent = percent; }
      GH.store.set('users', users);
      const updatedUser = { ...user, selectedCharity: charityId, charityPercent: percent };
      GH.store.set('user', updatedUser);
      GH.state.user = updatedUser;
    },

    getById(id) {
      return GH.charity.getAll().find(c => c.id === id);
    },

    totalContributions() {
      const users = GH.store.get('users') || [];
      return users.reduce((sum, u) => {
        if (u.subscriptionStatus !== 'active' || !u.subscription) return sum;
        const plan = GH.subscriptions.plans[u.subscription.planId];
        if (!plan) return sum;
        const monthly = u.subscription.planId === 'yearly' ? plan.price / 12 : plan.price;
        return sum + (monthly * (u.charityPercent || 10) / 100);
      }, 0);
    },
  },

  /* ─── Draw Engine ─── */
  draws: {
    getAll:    () => GH.store.get('draws') || GH.demo.seedDraws(),
    getCurrent:() => GH.draws.getAll().find(d => d.status === 'active') || null,
    getPast:   () => GH.draws.getAll().filter(d => d.status === 'published'),

    simulate() {
      const nums = new Set();
      while (nums.size < 5) nums.add(Math.floor(Math.random() * 45) + 1);
      return [...nums].sort((a,b)=>a-b);
    },

    checkMatch(userScores, drawNums) {
      const scores = userScores.map(s => s.score);
      const matched = drawNums.filter(n => scores.includes(n));
      return { matched, count: matched.length };
    },

    prizeShare(pool, matchCount) {
      if (matchCount === 5) return pool * 0.40;
      if (matchCount === 4) return pool * 0.35;
      if (matchCount === 3) return pool * 0.25;
      return 0;
    },

    publish(drawId, numbers) {
      const draws = GH.draws.getAll();
      const idx = draws.findIndex(d => d.id === drawId);
      if (idx === -1) throw new Error('Draw not found');
      draws[idx].numbers = numbers;
      draws[idx].status = 'published';
      draws[idx].publishedAt = new Date().toISOString();
      GH.store.set('draws', draws);
      return draws[idx];
    },

    create(month) {
      const draws = GH.draws.getAll();
      const newDraw = {
        id: 'd_' + Date.now(),
        month, status: 'active',
        numbers: null,
        jackpot: 0,
        createdAt: new Date().toISOString(),
      };
      draws.push(newDraw);
      GH.store.set('draws', draws);
      return newDraw;
    },
  },

  /* ─── Prize Pool ─── */
  pool: {
    calculate() {
      const users = GH.store.get('users') || [];
      const active = users.filter(u => u.subscriptionStatus === 'active');
      let monthly = 0;
      active.forEach(u => {
        if (!u.subscription) return;
        const plan = GH.subscriptions.plans[u.subscription.planId];
        if (!plan) return;
        const m = u.subscription.planId === 'yearly' ? plan.price / 12 : plan.price;
        monthly += m * 0.60; // 60% to prize pool
      });
      return {
        total: monthly,
        jackpot: monthly * 0.40,
        fourMatch: monthly * 0.35,
        threeMatch: monthly * 0.25,
        subscribers: active.length,
      };
    },
  },

  /* ─── Demo Seed Data ─── */
  demo: {
    seedUsers() {
      const users = [
        {
          id: 'u_admin',
          name: 'Admin User',
          email: 'admin@golfhero.com',
          password: 'admin123',
          role: 'admin',
          subscriptionStatus: 'active',
          selectedCharity: 'c_1',
          charityPercent: 15,
          createdAt: '2025-01-01T00:00:00Z',
          subscription: { planId: 'yearly', status: 'active', startDate: '2025-01-01T00:00:00Z', renewDate: '2026-01-01T00:00:00Z', price: 150 },
        },
        {
          id: 'u_test',
          name: 'Test Subscriber',
          email: 'test@golfhero.com',
          password: 'test123',
          role: 'subscriber',
          subscriptionStatus: 'active',
          selectedCharity: 'c_2',
          charityPercent: 10,
          createdAt: '2025-03-15T00:00:00Z',
          subscription: { planId: 'monthly', status: 'active', startDate: '2025-03-15T00:00:00Z', renewDate: '2026-04-15T00:00:00Z', price: 15 },
        },
      ];
      GH.store.set('users', users);
      return users;
    },

    seedCharities() {
      const charities = [
        { id: 'c_1', name: 'Junior Golf Foundation', description: 'Bringing golf to underprivileged youth across the UK, creating pathways to sport and life skills.', image: null, category: 'Youth', totalRaised: 24850, events: ['Golf Day – 14 Jun 2025', 'Charity Tournament – Sep 2025'] },
        { id: 'c_2', name: 'Cancer Research Golf Society', description: 'Every shot you take funds breakthrough cancer research. A community of golfers making a real difference.', image: null, category: 'Health', totalRaised: 41200, events: ['Charity Classic – 22 Jul 2025'] },
        { id: 'c_3', name: 'Veterans on the Fairway', description: 'Supporting armed forces veterans through therapeutic golf programmes and mental health resources.', image: null, category: 'Veterans', totalRaised: 18750, events: ['Memorial Round – 11 Nov 2025'] },
        { id: 'c_4', name: 'Green Earth Golf', description: 'Planting trees and restoring ecosystems. For every subscriber, we plant one tree per month.', image: null, category: 'Environment', totalRaised: 9300, events: [] },
        { id: 'c_5', name: 'Dementia Fairways', description: 'Funding dementia care through golf communities. Because everyone deserves dignity in their later years.', image: null, category: 'Health', totalRaised: 31600, events: ['Memory Walk – May 2025'] },
        { id: 'c_6', name: 'Girls in Golf', description: 'Breaking barriers in a traditionally male sport — funding girls\' golf academies and scholarships nationwide.', image: null, category: 'Equality', totalRaised: 15400, events: ['Pro-Am – Aug 2025'] },
      ];
      GH.store.set('charities', charities);
      return charities;
    },

    seedDraws() {
      const draws = [
        { id: 'd_jan25', month: 'January 2025', status: 'published', numbers: [7,14,22,33,41], publishedAt: '2025-02-01T10:00:00Z', jackpot: 0, rollover: false },
        { id: 'd_feb25', month: 'February 2025', status: 'published', numbers: [3,11,28,35,44], publishedAt: '2025-03-01T10:00:00Z', jackpot: 2400, rollover: true },
        { id: 'd_mar25', month: 'March 2025', status: 'published', numbers: [9,16,24,37,42], publishedAt: '2025-04-01T10:00:00Z', jackpot: 0, rollover: false },
        { id: 'd_apr25', month: 'April 2025', status: 'active', numbers: null, jackpot: 0 },
      ];
      GH.store.set('draws', draws);
      return draws;
    },

    seedScores() {
      const scores = {
        u_test: [
          { id: 's_1', score: 38, date: '2025-04-18', createdAt: '2025-04-18T10:00:00Z' },
          { id: 's_2', score: 27, date: '2025-04-10', createdAt: '2025-04-10T10:00:00Z' },
          { id: 's_3', score: 33, date: '2025-04-03', createdAt: '2025-04-03T10:00:00Z' },
          { id: 's_4', score: 21, date: '2025-03-27', createdAt: '2025-03-27T10:00:00Z' },
          { id: 's_5', score: 35, date: '2025-03-20', createdAt: '2025-03-20T10:00:00Z' },
        ],
      };
      GH.store.set('scores', scores);
      return scores;
    },

    init() {
      if (!GH.store.get('users'))    GH.demo.seedUsers();
      if (!GH.store.get('charities')) GH.demo.seedCharities();
      if (!GH.store.get('draws'))    GH.demo.seedDraws();
      if (!GH.store.get('scores'))   GH.demo.seedScores();
    },
  },

  /* ─── UI Helpers ─── */
  ui: {
    toast(msg, type = 'info') {
      const container = document.getElementById('toast-container') || (() => {
        const el = document.createElement('div');
        el.id = 'toast-container'; el.className = 'toast-container';
        document.body.appendChild(el); return el;
      })();
      const icons = { success: '✓', error: '✕', info: 'ℹ' };
      const t = document.createElement('div');
      t.className = `toast toast-${type}`;
      t.innerHTML = `<span>${icons[type]||'•'}</span><span>${msg}</span>`;
      container.appendChild(t);
      requestAnimationFrame(() => { requestAnimationFrame(() => t.classList.add('show')); });
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 3500);
    },

    modal(id, open) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('open', open);
    },

    formatDate(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
    },

    formatCurrency(n) {
      return '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    formatMonth(iso) {
      return new Date(iso).toLocaleDateString('en-GB', { month:'long', year:'numeric' });
    },

    initNavbar() {
      const nav = document.querySelector('.navbar');
      if (!nav) return;
      const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    },

    initTabs() {
      document.querySelectorAll('.tabs').forEach(tabsEl => {
        tabsEl.querySelectorAll('.tab-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            const parent = btn.closest('.tab-panel-group') || document;
            tabsEl.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const content = parent.querySelector(`[data-panel="${target}"]`);
            if (content) content.classList.add('active');
          });
        });
        // Activate first tab
        const first = tabsEl.querySelector('.tab-btn');
        if (first && !tabsEl.querySelector('.tab-btn.active')) first.click();
      });
    },

    charityColor(category) {
      const map = { Youth:'#5C9BE0', Health:'#5CBF8A', Veterans:'#C9A84C', Environment:'#5CBF8A', Equality:'#E05C9B', Default:'#8A8780' };
      return map[category] || map.Default;
    },

    charityIcon(category) {
      const map = {
        Youth: '⛳', Health: '🎗️', Veterans: '🎖️', Environment: '🌱', Equality: '⚡', Default: '♥',
      };
      return map[category] || map.Default;
    },
  },
};

/* ─── Bootstrap on DOM ready ─── */
document.addEventListener('DOMContentLoaded', () => {
  GH.demo.init();
  GH.ui.initNavbar();
  GH.ui.initTabs();

  // Highlight active nav
  const path = window.location.pathname;
  document.querySelectorAll('[data-page]').forEach(el => {
    if (path.includes(el.dataset.page)) el.classList.add('active');
  });
});
