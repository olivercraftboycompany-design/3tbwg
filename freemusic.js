/* nortest 1.6.6 - Free music: songs artists give away on purpose (Creative Commons / public domain), from the
   Internet Archive's netlabel and live-music collections. Search, stream and DOWNLOAD them for offline play.
   Only items whose license allows sharing are listed; the license shows on every song.
   Streams play in the normal player (au) with CORS, so the equalizer, lock screen and remote work as usual.
   Stored (new keys only): IndexedDB database "nortest_free" (store "songs": downloaded audio + cover),
   localStorage nortest_free_index (the downloaded songs' details, no audio), nortest_free_mode. */
(() => {
  'use strict';
  const IA = 'https://archive.org';
  const LIC = 'licenseurl:(*creativecommons.org* OR *publicdomain*)';
  const BASE = `((collection:netlabels AND mediatype:audio) OR collection:etree) AND ${LIC}`;
  const GENRES = [
    ['pop', 'Popular', ''],
    ['hiphop', 'Hip hop', 'subject:(hip hop OR hiphop OR rap OR "hip-hop" OR beats)'],
    ['lofi', 'Lofi', 'subject:(lofi OR "lo-fi" OR chillhop OR "lo fi")'],
    ['elec', 'Electronic', 'subject:(electronic OR electronica OR edm OR house OR techno OR dubstep)'],
    ['rock', 'Rock', 'subject:(rock OR "indie rock" OR punk OR metal OR grunge)'],
    ['chill', 'Chill', 'subject:(ambient OR chillout OR downtempo OR chill)'],
    ['jazz', 'Jazz', 'subject:(jazz OR swing OR "nu jazz" OR soul OR funk)'],
    ['indie', 'Indie pop', 'subject:(pop OR "indie pop" OR synthpop OR indie)'],
    ['live', 'Live shows', 'collection:etree']
  ];
  const LSI = 'nortest_free_index', LSM = 'nortest_free_mode';
  const SVG_DL = '<path d="M12 4v10.6M7.6 10.4L12 14.8l4.4-4.4"/><path d="M4.8 13.4v4a2.8 2.8 0 0 0 2.8 2.8h8.8a2.8 2.8 0 0 0 2.8-2.8v-4"/>';
  const SVG_NOTE = '<path d="M9 17.6V6.2l10-2v11.2"/><circle cx="6.6" cy="17.6" r="2.4"/><circle cx="16.6" cy="15.4" r="2.4"/><path d="M12.2 20.6h7.2M15.8 17.8v5.6" style="display:none"/>';
  if (window.SFI) { SFI.fm_dl = SVG_DL; SFI.fm_free = '<path d="M12 3.6v9.8M8 9.6l4 4 4-4"/><path d="M4.6 16.2v1.4a2.8 2.8 0 0 0 2.8 2.8h9.2a2.8 2.8 0 0 0 2.8-2.8v-1.4"/>'; SFI.fm_ok = '<circle cx="12" cy="12" r="8.4"/><path d="M8.2 12.3l2.6 2.6 5-5.2"/>'; SFI.fm_out = '<path d="M13.6 4.8h5.6v5.6M19.2 4.8l-8 8"/><path d="M17.4 13.6v3.6a2 2 0 0 1-2 2H6.8a2 2 0 0 1-2-2V8.6a2 2 0 0 1 2-2h3.6"/>'; }

  { const nb = document.querySelector('#nav button[data-v="free"] .ind'); if (nb && window.SFI) nb.innerHTML = mi('fm_free') + mi('fm_free', 1); }
  const ls = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const T = {};
  const toast = m => {
    try { if (NN && NN.toast) return NN.toast(m); } catch (e) { }
    let t = document.querySelector('.toast.b1t'); if (!t) { t = document.createElement('div'); t.className = 'toast b1t'; document.body.appendChild(t); }
    t.textContent = m; t.classList.add('show'); clearTimeout(T.t); T.t = setTimeout(() => t.classList.remove('show'), 2400);
  };
  const mb = b => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? Math.round(b / 1e6) + ' MB' : Math.max(0, Math.round(b / 1e3)) + ' KB';

  /* ---------- the downloaded songs: own database, never the nortest one ---------- */
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const q = indexedDB.open('nortest_free', 1);
    q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains('songs')) q.result.createObjectStore('songs', { keyPath: 'id' }); };
    q.onsuccess = () => res(q.result); q.onerror = () => { dbp = null; rej(q.error); };
  }));
  const dtx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('songs', mode), r = fn(t.objectStore('songs')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted')); }); };

  /* ---------- songs: song-shaped objects the player can queue (byId finds them through spSong) ---------- */
  const REG = new Map();
  const isFm = id => typeof id === 'string' && id.startsWith('fm:');
  const FIELDS = ['id', 'title', 'artist', 'album', 'dur', 'lic', 'ident', 'file', 'size', 'at'];
  const slimIdx = s => { const o = {}; FIELDS.forEach(k => o[k] = s[k]); return o; };
  let IDX = ls(LSI, []); if (!Array.isArray(IDX)) IDX = [];
  const dlSet = new Set();
  const enc = p => p.split('/').map(encodeURIComponent).join('/');
  const mk = o => {
    let s = REG.get(o.id);
    if (!s) {
      s = { id: o.id, title: o.title, artist: o.artist || 'Unknown artist', album: o.album || '', dur: +o.dur || 0, lic: o.lic || '', ident: o.ident, file: o.file, size: +o.size || 0,
        src: `${IA}/download/${encodeURIComponent(o.ident)}/${enc(o.file)}`, art: `${IA}/services/img/${encodeURIComponent(o.ident)}`, free: true, cover: null, blob: null, fav: false, lyrics: '', added: 0, at: o.at || 0 };
      REG.set(o.id, s);
    }
    return s;
  };
  IDX.forEach(o => { if (o && isFm(o.id)) { mk(o).at = o.at || 0; dlSet.add(o.id); } });
  /* blobs come from the database once; until then a downloaded song streams like any other */
  const ready = (async () => {
    try {
      const rows = await dtx('readonly', o => o.getAll());
      const have = new Set();
      (rows || []).forEach(r => { const s = mk(r); s.blob = r.blob || null; s.cover = r.cover || null; s.at = r.at || s.at; have.add(r.id); dlSet.add(r.id); });
      /* the index follows the database (a download that never finished is dropped) */
      const fixed = [...have].map(id => slimIdx(REG.get(id)));
      dlSet.forEach(id => { if (!have.has(id)) dlSet.delete(id); });
      IDX = fixed; lsSet(LSI, IDX);
    } catch (e) { }
    /* a downloaded song restored as the current song before its file was read: switch it to the file */
    try { if (cur && cur.free && cur.blob && !String(au.src).startsWith('blob:') && qi >= 0 && au.paused) load(qi, false); } catch (e) { }
    if (view === 'free') paint();
  })();
  const _sp = window.spSong;
  window.spSong = id => isFm(id) ? REG.get(id) : (_sp ? _sp(id) : undefined);
  window.fmSong = id => REG.get(id);

  /* ---------- license words ---------- */
  const licName = u => {
    u = String(u || '').toLowerCase();
    if (!u) return '';
    if (u.includes('publicdomain/zero')) return 'CC0';
    if (u.includes('publicdomain')) return 'Public domain';
    const m = u.match(/licenses\/([a-z-]+)\/(\d(?:\.\d)?)/);
    return m ? 'CC ' + m[1].toUpperCase().replace('ND-NC', 'NC-ND') + ' ' + m[2] : 'CC';
  };
  const licUrl = u => String(u || '').replace(/^http:/, 'https:');

  /* ---------- Internet Archive ---------- */
  const F = { mode: ls(LSM, 'browse') === 'dl' ? 'dl' : 'browse', g: 'pop', q: '', page: 1, list: null, err: '', loading: false, more: true, req: 0, items: {}, prog: {}, est: null };
  const getJSON = async (u, ms = 12000) => {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(u, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(to); }
  };
  const cleanQ = q => String(q || '').replace(/[^\p{L}\p{N}' -]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  async function searchItems(g, q, page) {
    const gen = (GENRES.find(x => x[0] === g) || GENRES[0])[2];
    const cq = cleanQ(q);
    const query = [BASE, cq ? `(${cq})` : '', !cq && gen ? gen : ''].filter(Boolean).join(' AND ');
    const p = new URLSearchParams({ q: query, rows: cq ? '10' : '12', page: String(page), output: 'json' });
    ['identifier', 'title', 'creator', 'licenseurl'].forEach(f => p.append('fl[]', f));
    p.append('sort[]', 'downloads desc');
    const j = await getJSON(`${IA}/advancedsearch.php?${p}`);
    return (j && j.response && j.response.docs || []).filter(d => d.identifier && d.licenseurl);
  }
  const secs = v => { if (v == null) return 0; const s = String(v); if (s.includes(':')) return s.split(':').reduce((a, x) => a * 60 + (+x || 0), 0); return Math.round(+s || 0); };
  const first = v => Array.isArray(v) ? v[0] : v;
  const prettyName = n => n.replace(/^.*\//, '').replace(/\.mp3$/i, '').replace(/_/g, ' ').replace(/^\s*\d{1,3}\s*[-.)]?\s*/, '').replace(/\s+/g, ' ').trim();
  const cleanT = t => {
    let x = String(t).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    const m = x.match(/^.{1,60}? - \d{1,3} - (.+)$/); if (m) x = m[1];      /* "Artist - 01 - Song" */
    x = x.replace(/^\s*(\d{1,3}\s*[-.)]\s*)+/, '').replace(/^\d{1,2}\s+(?=\D)/, '').trim();
    return x || String(t);
  };
  async function itemTracks(doc) {
    if (F.items[doc.identifier]) return F.items[doc.identifier];
    const j = await getJSON(`${IA}/metadata/${encodeURIComponent(doc.identifier)}`, 15000);
    const md = (j && j.metadata) || {};
    const lic = md.licenseurl || doc.licenseurl;
    if (!lic || !/creativecommons\.org|publicdomain/i.test(lic) || j.is_dark || md['access-restricted-item']) return (F.items[doc.identifier] = []);
    let fs = (j.files || []).filter(f => /\.mp3$/i.test(f.name) && f.private !== 'true' && !/64Kbps/i.test(f.format || '') && !/_64kb\.mp3$/i.test(f.name));
    const orig = fs.filter(f => f.source === 'original');
    if (orig.length) fs = orig;
    const album = String(first(md.title) || doc.title || '').trim();
    const who = String(first(md.creator) || first(doc.creator) || '').trim();
    const out = fs.map(f => ({
      id: 'fm:' + doc.identifier + '/' + f.name, ident: doc.identifier, file: f.name,
      title: cleanT(String(f.title || prettyName(f.name)).trim() || prettyName(f.name)), artist: String(f.artist || f.creator || who || 'Unknown artist').trim(),
      album, dur: secs(f.length), size: +f.size || 0, lic, trk: parseInt(String(f.track || '').split('/')[0], 10) || 0
    })).filter(t => !t.dur || (t.dur >= 40 && t.dur <= 1500));
    out.sort((a, b) => (a.trk || 999) - (b.trk || 999) || a.file.localeCompare(b.file));
    return (F.items[doc.identifier] = out.slice(0, 30));
  }
  /* a few songs from each release, mixed, so one long album doesn't fill the page */
  async function fetchPage(g, q, page) {
    const docs = await searchItems(g, q, page);
    const per = q ? 6 : 3;
    const lists = await Promise.all(docs.map(d => itemTracks(d).catch(() => [])));
    const out = [];
    for (let r = 0; r < per; r++) lists.forEach(l => { if (l[r]) out.push(mk(l[r])); });
    return { songs: out, more: docs.length >= (q ? 10 : 12) };
  }
  async function refresh(append) {
    const id = ++F.req;
    F.loading = true; F.err = '';
    if (!append) { F.page = 1; F.list = null; }
    paintBody();
    try {
      const r = await fetchPage(F.g, F.q, F.page);
      if (id !== F.req) return;
      const seen = new Set((F.list || []).map(s => s.id));
      F.list = [...(append ? F.list || [] : []), ...r.songs.filter(s => !seen.has(s.id))];
      F.more = r.more;
    } catch (e) {
      if (id !== F.req) return;
      F.err = navigator.onLine === false ? 'offline' : String(e && e.message || e);
    } finally { if (id === F.req) F.loading = false; }
    paintBody();
  }

  /* ---------- look: the existing rows, chips, seg, search bar; nothing new on the glass ---------- */
  const st = document.createElement('style');
  st.textContent = `
.free .fseg{margin:2px 0 12px}
#view #fq{width:auto;height:100%;padding:0;border:0;border-radius:0;background:none;box-shadow:none;outline:0}
.free .fch{margin-top:2px}
.free .fnote{margin:4px 4px 6px;font-size:13px;line-height:18px;color:var(--lg-fg2,var(--md-on-surface-variant))}
.free .fnote a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.frow .rm{flex:1;min-width:0}
.frow .rm b,.frow .rm span{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.frow small.lic{display:inline-block;margin-right:6px;padding:0 5px;border-radius:5px;font-size:10px;line-height:15px;font-weight:700;letter-spacing:.02em;vertical-align:1px;color:var(--lg-fg2,var(--md-on-surface-variant));box-shadow:inset 0 0 0 1px var(--lg-hair,rgba(127,127,127,.35))}
.frow img{object-fit:cover;background:#3a3f4a}
.frow .ib.fdl.on{color:var(--lg-acc,var(--md-primary))}
.frow .fpc{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--lg-acc,var(--md-primary))}
.fstat{display:flex;align-items:center;gap:8px;margin:2px 4px 10px;font-size:13px;color:var(--lg-fg2,var(--md-on-surface-variant))}
.fstat span{flex:1}
.free .fmore{display:flex;justify-content:center;margin:14px 0 6px}
.free .fsk .row{pointer-events:none}
.free .fsq{width:52px;height:52px;border-radius:9px;flex:none;background:var(--lg-hair,rgba(255,255,255,.08))}
.free .fln{display:block;height:12px;width:58%;border-radius:6px;background:var(--lg-hair,rgba(255,255,255,.08))}
.free .fln.s{width:36%;height:10px;margin-top:8px}
`;
  document.head.appendChild(st);

  const esc2 = x => esc(String(x == null ? '' : x));
  const fmtD = d => d ? fmt(d) : '';
  const dlBtn = s => {
    const p = F.prog[s.id];
    if (p != null) return `<button class="ib fdl" data-a="fmcancel" aria-label="Downloading ${p}%, tap to cancel"><span class="fpc">${p}%</span></button>`;
    if (dlSet.has(s.id)) return `<button class="ib fdl on" data-a="fmdots" aria-label="Downloaded">${mi('fm_ok')}</button>`;
    return `<button class="ib fdl" data-a="fmdl" aria-label="Download ${esc2(s.title)}">${mi('fm_dl')}</button>`;
  };
  const row = (s, inDl) => `<div class="row frow${cur && cur.id === s.id ? ' now' : ''}" data-a="fmplay" data-id="${esc2(s.id)}"><img src="${esc2(s.cover ? cover(s) : s.art)}" alt="" loading="lazy" onerror="this.onerror=null;this.src=PH"><div class="rm"><b>${esc2(s.title)}</b><span><small class="lic" title="License">${esc2(licName(s.lic))}</small>${s.dur ? fmtD(s.dur) + ' &middot; ' : ''}${esc2(s.artist)}</span></div>${inDl ? `<button class="ib" data-a="fmdel" aria-label="Delete download">${mi('trash')}</button>` : dlBtn(s)}<button class="ib" data-a="fmdots" aria-label="More">${ic('dots')}</button></div>`;
  const skel = n => `<div class="lst fsk">${Array.from({ length: n }, () => '<div class="row"><span class="fsq"></span><div class="rm"><b class="fln"></b><span class="fln s"></span></div></div>').join('')}</div>`;
  const dlList = () => [...dlSet].map(id => REG.get(id)).filter(Boolean).sort((a, b) => (b.at || 0) - (a.at || 0));
  const usedBytes = () => dlList().reduce((a, s) => a + (s.blob ? s.blob.size : s.size || 0), 0);
  const gName = () => (GENRES.find(x => x[0] === F.g) || GENRES[0])[1];

  function bodyHTML() {
    if (F.mode === 'dl') {
      const L = dlList();
      if (!L.length) return `<p class="empty">No downloads yet.<br>Tap ${mi('fm_dl')} on a song in Browse to keep it on this phone. Downloaded songs play with no internet.</p>`;
      const est = F.est && F.est.quota ? ` · ${mb(F.est.quota - F.est.usage)} free` : '';
      return `<div class="fstat"><span>${L.length} song${L.length === 1 ? '' : 's'} · ${mb(usedBytes())}${est}</span></div>
<div class="lbar"><button class="btn pri" data-a="fmplayall">${mi('play_arrow', 1)}Play</button><button class="btn tonal" data-a="fmshuf">${mi('shuffle')}Shuffle</button></div>
<div class="lst">${L.map(s => row(s, true)).join('')}</div>`;
    }
    if (F.err) return F.err === 'offline'
      ? (dlSet.size ? `<h2 class="st">You're offline</h2><p class="fnote">Your downloaded songs still play.</p><div class="lst">${dlList().map(s => row(s, true)).join('')}</div>` : `<p class="empty">You're offline. Songs you download play with no internet.</p>`)
      : `<p class="empty">Can't reach the free music library right now.<br><button class="btn tonal rretry" data-a="fmretry">Try again</button></p>`;
    if (!F.list) return (F.q ? '' : `<h2 class="st">${esc2(gName())}</h2>`) + skel(8);
    if (!F.list.length) return `<p class="empty">${F.q ? `No free songs found for "${esc2(F.q)}". Try an artist, a genre or a mood.` : 'Nothing here right now.'}</p>`;
    return `<h2 class="st">${F.q ? 'Songs' : esc2(gName())}</h2><div class="lst">${F.list.map(s => row(s)).join('')}</div>` +
      (F.more ? `<div class="fmore"><button class="btn tonal" data-a="fmmore" ${F.loading ? 'disabled' : ''}>${F.loading ? 'Loading...' : 'Show more'}</button></div>` : '');
  }
  window.freeHTML = () => {
    const n = dlSet.size;
    const segH = `<div class="seg fseg" role="group" aria-label="Show">${[['browse', 'Browse'], ['dl', 'Downloaded' + (n ? ' · ' + n : '')]].map(([v, t]) => `<button data-a="fmmode" data-v="${v}" class="${F.mode === v ? 'on' : ''}" aria-pressed="${F.mode === v}">${F.mode === v ? mi('check') : ''}${t}</button>`).join('')}</div>`;
    const head = F.mode === 'dl' ? '' : `<label class="sbar in fsb"><span class="sic">${mi('search')}</span><input id="fq" type="search" placeholder="Search free songs and artists" autocomplete="off" enterkeyhint="search" value="${esc2(F.q)}"></label>
<div class="chips fch" role="group" aria-label="Genre">${GENRES.map(([k, t]) => `<button class="chip ${!F.q && F.g === k ? 'on' : ''}" data-a="fmg" data-v="${k}" aria-pressed="${!F.q && F.g === k}">${!F.q && F.g === k ? mi('check') : ''}${t}</button>`).join('')}</div>
<p class="fnote">Songs artists share for free under Creative Commons, from the <a href="https://archive.org/details/netlabels" target="_blank" rel="noopener">Internet Archive</a>. Download any of them to play offline.</p>`;
    if (F.mode === 'browse' && !F.list && !F.loading && !F.err) setTimeout(() => refresh(false), 0);
    if (F.mode === 'dl' && !F.est && navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { F.est = e; paintBody(); }).catch(() => { });
    return `<div class="free">${segH}${head}<div class="fbody">${bodyHTML()}</div></div>`;
  };
  function paintBody() {
    if (view !== 'free') return;
    const b = document.querySelector('#view .fbody');
    if (!b) return render();
    const y = $('#view').scrollTop;
    b.innerHTML = bodyHTML();
    $('#view').scrollTop = y;
  }
  function paint() { if (view !== 'free') return; const y = $('#view').scrollTop; render(); $('#view').scrollTop = y; }
  const paintRow = id => {
    if (view !== 'free') return;
    document.querySelectorAll(`#view .frow[data-id="${CSS.escape(id)}"] .fdl`).forEach(b => { const s = REG.get(id); if (s) b.outerHTML = dlBtn(s); });
  };

  /* ---------- download: the whole file into our own database ---------- */
  const ctls = {};
  async function download(s) {
    if (dlSet.has(s.id) || F.prog[s.id] != null) return;
    if (navigator.onLine === false) return toast("You're offline");
    F.prog[s.id] = 0; paintRow(s.id);
    const ctl = ctls[s.id] = new AbortController();
    try {
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
      const r = await fetch(s.src, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const total = +r.headers.get('content-length') || s.size || 0;
      let blob;
      if (r.body && r.body.getReader) {
        const rd = r.body.getReader(), parts = []; let got = 0, last = 0;
        for (; ;) {
          const { done, value } = await rd.read(); if (done) break;
          parts.push(value); got += value.length;
          const p = total ? Math.min(99, Math.floor(got / total * 100)) : 0;
          if (p !== last) { last = p; F.prog[s.id] = p; paintRow(s.id); }
        }
        blob = new Blob(parts, { type: 'audio/mpeg' });
      } else blob = new Blob([await r.blob()], { type: 'audio/mpeg' });
      if (blob.size < 20000) throw new Error('file too small');
      let cv = null;
      try { const c = await fetch(s.art, { signal: ctl.signal }); if (c.ok) { const b = await c.blob(); if (/^image\//.test(b.type) && b.size < 600000) cv = b; } } catch (e) { }
      const at = Date.now();
      await dtx('readwrite', o => o.put({ ...slimIdx(s), at, blob, cover: cv }));
      s.blob = blob; s.cover = cv; s.at = at; s.size = blob.size;
      dlSet.add(s.id); IDX = [...IDX.filter(x => x.id !== s.id), slimIdx(s)]; lsSet(LSI, IDX);
      F.est = null;
      toast('Downloaded ' + s.title);
    } catch (e) {
      if (!(e && e.name === 'AbortError')) toast(e && /quota/i.test(String(e.name || e.message)) ? 'Not enough space on this phone' : "Couldn't download " + s.title);
    } finally {
      delete F.prog[s.id]; delete ctls[s.id];
      if (F.mode === 'dl' || !document.querySelector(`#view .frow[data-id="${CSS.escape(s.id)}"]`)) paint(); else { paintRow(s.id); const sg = document.querySelector('#view .fseg'); if (sg) { const t = document.createElement('div'); t.innerHTML = freeHTML(); sg.replaceWith(t.querySelector('.fseg')); } }
    }
  }
  async function remove(id) {
    const s = REG.get(id); if (!s) return;
    try { await dtx('readwrite', o => o.delete(id)); } catch (e) { return toast("Couldn't delete it"); }
    dlSet.delete(id); IDX = IDX.filter(x => x.id !== id); lsSet(LSI, IDX);
    if (cur && cur.id === id && s.blob) { /* keep playing what's loaded; next time it streams */ }
    s.blob = null; if (s.cover) { try { dropCover(id); } catch (e) { } } s.cover = null; F.est = null;
    toast('Deleted ' + s.title);
    paint();
  }
  /* Android app: also put a copy in the phone's Downloads folder (the phone's music list then finds it too) */
  async function saveToPhone(s) {
    if (!(NN && NN.saveStart) || !s.blob) return;
    const name = (s.artist + ' - ' + s.title).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) + '.mp3';
    const id = NN.saveStart(name, 'audio/mpeg'); if (!id) return toast("Couldn't save it");
    let ok = true;
    try {
      const CH = 393216;
      for (let o = 0; o < s.blob.size && ok; o += CH) {
        const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(s.blob.slice(o, o + CH)); });
        ok = NN.saveChunk(id, b64);
      }
    } catch (e) { ok = false; }
    NN.saveEnd(id, ok);
  }

  /* ---------- player hooks ---------- */
  const _load = load;
  load = function (i, play = true) {
    const s = byId(queue[i]);
    if (s && s.free) {
      /* a stream from archive.org goes through the equalizer only in CORS mode; a downloaded song is a local blob */
      if (s.blob) au.removeAttribute('crossorigin'); else au.crossOrigin = 'anonymous';
    } else if (au.getAttribute('crossorigin') != null) au.removeAttribute('crossorigin');
    return _load.apply(this, arguments);
  };
  /* lock screen / notification artwork for free songs (the album's cover) */
  const _media = media; media = function () {
    _media.apply(this, arguments);
    if (!cur || !cur.free || !('mediaSession' in navigator)) return;
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: cur.title, artist: cur.artist, album: cur.album, artwork: [{ src: cur.cover ? cover(cur) : cur.art, sizes: '300x300', type: (cur.cover && cur.cover.type) || 'image/jpeg' }] }); } catch (e) { }
  };
  const _fav = A.fav; A.fav = (b, id, ...r) => { const s = id ? byId(id) : cur; if (s && s.free) return toast('Free songs live in Free music. Download one to keep it.'); return _fav(b, id, ...r); };
  ['edit', 'sdel', 'dhide', 'topl'].forEach(k => { const f = A[k]; if (f) A[k] = (b, id, ...r) => isFm(id) ? (toast(k === 'topl' ? 'Free songs can\'t go in playlists yet' : 'Not for free songs'), $('#menu').classList.add('hid')) : f(b, id, ...r); });
  const _dots = A.dots; A.dots = (b, id, ...r) => isFm(id) ? A.fmdots(b, id) : _dots(b, id, ...r);

  const listIds = b => { const l = b.closest('.lst'); return l ? [...l.querySelectorAll('.frow')].map(r => r.dataset.id) : [b.dataset.id]; };
  let qT = 0;
  document.addEventListener('input', e => { if (e.target.id === 'fq') { clearTimeout(qT); const v = e.target.value; qT = setTimeout(() => { if (F.q === v.trim()) return; F.q = v.trim(); keepInput(); }, 550); } });
  document.addEventListener('keydown', e => { if (e.target.id === 'fq' && e.key === 'Enter') { clearTimeout(qT); F.q = e.target.value.trim(); keepInput(); e.target.blur(); } });
  const keepInput = () => {
    const ch = document.querySelector('#view .fch');
    if (ch) { const t = document.createElement('div'); t.innerHTML = freeHTML(); ch.replaceWith(t.querySelector('.fch')); }
    refresh(false);
  };
  Object.assign(A, {
    fmplay: (b, id) => {
      const s = REG.get(id); if (!s) return;
      if (cur && cur.id === id) return A.toggle ? A.toggle() : null;
      const ids = listIds(b).filter(x => REG.get(x));
      playList(ids, id);
    },
    fmdl: (b, id) => { const s = REG.get(id); if (s) download(s); },
    fmcancel: (b, id) => { const c = ctls[id]; if (c) c.abort(); },
    fmdel: (b, id) => { const s = REG.get(id); if (s && confirm('Delete "' + s.title + '" from this phone?')) remove(id); },
    fmmode: b => { F.mode = b.dataset.v === 'dl' ? 'dl' : 'browse'; lsSet(LSM, F.mode); if (F.mode === 'browse' && F.err) { F.err = ''; F.list = null; } render(); $('#view').scrollTop = 0; },
    fmg: b => { F.g = b.dataset.v; F.q = ''; const i = $('#fq'); if (i) i.value = ''; F.list = null; render(); refresh(false); },
    fmmore: () => { if (F.loading) return; F.page++; refresh(true); },
    fmretry: () => refresh(false),
    fmplayall: () => { const L = dlList(); if (L.length) playList(L.map(s => s.id), L[0].id); },
    fmshuf: () => { const L = dlList().map(s => s.id); if (!L.length) return; S.shuf = true; try { save('S', S); applyUI(); } catch (e) { } playList(L, L[Math.floor(Math.random() * L.length)]); },
    fmdots: (b, id) => {
      const s = REG.get(id); if (!s) return;
      const rc = b.getBoundingClientRect(), m = $('#menu'), has = dlSet.has(id);
      const it = [['Play next', 'qnext', 'play_next'], ['Add to queue', 'qadd', 'queue_music'], ...(queue.includes(id) ? [['Remove from queue', 'qrmid', 'playlist_remove']] : []),
        ...(has ? [['Delete download', 'fmdel', 'trash']] : F.prog[id] != null ? [] : [['Download', 'fmdl', 'fm_dl']]),
        ...(has && NN && NN.saveStart ? [["Save a copy to the phone's Downloads", 'fmsave', 'upload']] : [])];
      m.innerHTML = `<div class="mh"><img src="${esc2(s.cover ? cover(s) : s.art)}" alt=""><div><b>${esc2(s.title)}</b><span>${esc2(s.artist)} · ${esc2(licName(s.lic))}</span></div></div>` + it.map(([t, a, ico]) => `<button data-a="${a}" data-id="${esc2(id)}" class="mx-${a}">${mi(ico)}<span>${t}</span></button>`).join('') +
        `<button data-a="fmopen" data-u="${esc2(licUrl(s.lic))}" data-id="${esc2(id)}">${mi('fm_out')}<span>License: ${esc2(licName(s.lic))}</span></button><button data-a="fmopen" data-u="${esc2(IA + '/details/' + encodeURIComponent(s.ident))}" data-id="${esc2(id)}">${mi('fm_out')}<span>Album page${s.album ? ': ' + esc2(s.album.slice(0, 40)) : ''}</span></button>`;
      m.classList.remove('hid');
      m.style.top = Math.max(8, Math.min(rc.bottom, innerHeight - m.offsetHeight - 8)) + 'px';
      m.style.left = Math.max(8, Math.min(rc.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px';
    },
    fmopen: b => { const u = b.dataset.u; if (u) window.open(u, '_blank', 'noopener'); },
    fmsave: (b, id) => { const s = REG.get(id); if (s) saveToPhone(s); }
  });
  /* the app goes online/offline: the Browse page tries again */
  addEventListener('online', () => { if (F.err) { F.err = ''; if (view === 'free') refresh(false); } });
  window.nortestFree = { REG, dlSet, F, ready, download, remove, licName, searchItems, itemTracks, mk };
})();
