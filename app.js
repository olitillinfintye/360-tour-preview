(async function () {
  const $ = s => document.querySelector(s);
  const TOURS = { dembi: 'tour.json', wushwush: 'wushwush/tour.json', bebeka: 'bebeka/tour.json', bluenile: 'bluenile/tour.json', jimma: 'jimma/tour.json' };
  let KEY = new URLSearchParams(location.search).get('tour');
  if (!TOURS[KEY]) KEY = 'dembi';
  const LS_KEY = KEY === 'dembi' ? 'dembiTour.v2' : 'tour.' + KEY + '.v1';
  const ICON = {
    link: '<svg viewBox="0 0 24 24"><path d="M12 3l8 9h-5v9H9v-9H4z"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="6" r="2"/><path d="M10 10h4v11h-4z"/></svg>',
    image: '<svg viewBox="0 0 24 24"><path d="M3 5h18v14H3zM5 7v8l4-4 3 3 3-4 4 5V7z"/></svg>',
  };
  const TCOL = { link: 'var(--acc)', info: 'var(--info)', image: 'var(--img)', menu: 'var(--menu)' };

  const base = await (await fetch(TOURS[KEY], { cache: 'no-store' })).json();
  let tour = base, edited = false;
  try { const s = localStorage.getItem(LS_KEY); if (s) { tour = JSON.parse(s); edited = true; } } catch (e) { }
  tour.settings = Object.assign({ hfov: 100, rotSpeed: 2.5 }, tour.settings);
  const BASE = tour.base || '';
  document.title = tour.title + ' (Preview)';
  $('#brandName').textContent = tour.title;
  const byId = {}; let uid = 1;
  tour.nodes.forEach(n => { byId[n.id] = n; n.hotspots.forEach(h => h._uid = 'h' + uid++); });

  const uToYaw = u => { let y = (u - 0.5) * 360; return y > 180 ? y - 360 : y < -180 ? y + 360 : y; };
  const vToPitch = v => (0.5 - v) * 180;
  const yawToU = y => { let u = y / 360 + 0.5; u = ((u % 1) + 1) % 1; return +u.toFixed(3); };
  const pitchToV = p => +Math.min(1, Math.max(0, 0.5 - p / 180)).toFixed(3);
  const zoneOf = id => tour.zones.find(z => z.id === byId[id].zone);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hsLabel = h => h.label ? h.label : h.type === 'link' ? (byId[h.target] ? byId[h.target].name : h.target) : h.type === 'menu' ? 'Menu' : h.title;

  let editing = false, selected = null, guided = null;

  // ---------- pannellum ----------
  const makeHs = h => ({
    id: h._uid, pitch: vToPitch(h.v), yaw: uToYaw(h.u), cssClass: 'hs hs-' + h.type,
    createTooltipFunc: renderHs, createTooltipArgs: h, clickHandlerFunc: onHsClick, clickHandlerArgs: h,
  });
  function renderHs(div, h) {
    if (h.type === 'menu') {
      const m = tour.menu;
      div.innerHTML = `<div class="wmenu"><div class="t">${esc(m.title)}</div><div class="s">${esc(m.subtitle)}</div><div class="g">` +
        tour.zones.map(z => `<div class="b" data-go="${z.target}"><img src="${BASE}thumbs/${z.target}.jpg" alt="" onerror="if(!this.dataset.r){this.dataset.r=1;this.src=this.src+'?r'}"><span>${esc(z.name)}</span></div>`).join('') +
        `</div><div class="f">Point the controller ray at an area and pull the trigger</div></div>`;
    } else {
      div.innerHTML = `<div class="ring">${ICON[h.type]}</div><div class="lbl">${esc(hsLabel(h))}</div>`;
    }
    div.classList.toggle('sel', h === selected);
    h._div = div;
  }
  const cfg = {
    default: { firstScene: tour.start, sceneFadeDuration: 800, autoLoad: true, hfov: tour.settings.hfov, compass: false, showZoomCtrl: true, showFullscreenCtrl: true, friction: 0.25 },
    scenes: {},
  };
  tour.nodes.forEach(n => cfg.scenes[n.id] = { type: 'equirectangular', panorama: BASE + 'panos/' + n.id + '.jpg', pitch: 0, yaw: uToYaw(n.entryU), hotSpots: n.hotspots.map(makeHs) });
  const viewer = pannellum.viewer('pano', cfg);
  const cur = () => viewer.getScene();

  function rebuild() {
    const id = cur(); if (!id) return;
    (viewer.getConfig().hotSpots || []).map(h => h.id).forEach(hid => viewer.removeHotSpot(hid));
    byId[id].hotspots.forEach(h => viewer.addHotSpot(makeHs(h), id));
  }
  function go(id) {
    const n = byId[id]; if (!n) return;
    closePopup();
    cfg.scenes[id].hotSpots = n.hotspots.map(makeHs);
    cfg.scenes[id].yaw = uToYaw(n.entryU);
    if (cur() === id) { rebuild(); viewer.lookAt(0, uToYaw(n.entryU), tour.settings.hfov, 700); return; }
    viewer.loadScene(id, 0, uToYaw(n.entryU), tour.settings.hfov);
  }
  viewer.on('scenechange', id => { selected = null; updateHud(id); });
  let pendingView = null;
  try { const v = sessionStorage.getItem('importView.' + KEY); if (v) { pendingView = JSON.parse(v); sessionStorage.removeItem('importView.' + KEY); } } catch (e) { }
  viewer.on('load', () => {
    if (pendingView) { const v = pendingView; pendingView = null; if (v.scene && v.scene !== cur() && byId[v.scene]) { viewer.loadScene(v.scene, v.pitch, v.yaw, v.hfov); return; } viewer.lookAt(v.pitch, v.yaw, v.hfov, 0); } updateHud(cur()); if (editing) renderEdit(); });

  function onHsClick(e, h) {
    e.stopPropagation();
    if (editing) { select(h); return; }
    if (h.type === 'menu') { const b = e.target.closest('[data-go]'); if (b) { stopGuided(); go(b.dataset.go); } return; }
    if (h.type === 'link') { stopGuided(); go(h.target); } else openPopup(h);
  }

  function updateHud(id) {
    if (!id) return;
    const n = byId[id], z = zoneOf(id);
    $('#locName').textContent = n.name;
    $('#zoneName').textContent = z.name;
    $('#zoneDot').style.background = z.color;
    $('#editedBadge').hidden = !edited;
  }

  // ---------- popup ----------
  function openPopup(h) {
    $('#popT').textContent = h.title || '';
    $('#popB').textContent = h.text || '';
    const img = $('#popI');
    if (h.type === 'image' && h.image) { img.src = h.image; img.style.display = 'block'; } else img.style.display = 'none';
    $('#popup').classList.add('open');
  }
  function closePopup() { $('#popup').classList.remove('open'); }
  $('#popX').onclick = closePopup;

  // ---------- guided tour (C360 AutoTour) ----------
  function startGuided() {
    setEdit(false);
    guided = { i: 0, t: 0, paused: false, last: performance.now() };
    go(tour.guided[0]); viewer.startAutoRotate(-tour.settings.rotSpeed);
    $('#guide').classList.add('on'); $('#bGuide').classList.add('on'); tickGuided();
  }
  function stopGuided() {
    if (!guided) return; guided = null; viewer.stopAutoRotate();
    $('#guide').classList.remove('on'); $('#bGuide').classList.remove('on');
  }
  function nextGuided() {
    guided.i = (guided.i + 1) % tour.guided.length; guided.t = 0;
    go(tour.guided[guided.i]); viewer.startAutoRotate(-tour.settings.rotSpeed);
  }
  function tickGuided() {
    if (!guided) return;
    const now = performance.now(), dt = (now - guided.last) / 1000; guided.last = now;
    if (!guided.paused && viewer.isLoaded()) guided.t += dt;
    const dur = tour.guidedSeconds || 12;
    $('#gBar').style.width = Math.min(100, guided.t / dur * 100) + '%';
    $('#gStep').textContent = `${guided.i + 1}/${tour.guided.length} · ${byId[tour.guided[guided.i]].name}`;
    if (guided.t >= dur) nextGuided();
    requestAnimationFrame(tickGuided);
  }
  $('#bGuide').onclick = () => guided ? stopGuided() : startGuided();
  $('#gStop').onclick = stopGuided;
  $('#gNext').onclick = () => guided && nextGuided();
  $('#gPause').onclick = () => { if (!guided) return; guided.paused = !guided.paused; $('#gPause').textContent = guided.paused ? '▶' : '❚❚'; guided.paused ? viewer.stopAutoRotate() : viewer.startAutoRotate(-tour.settings.rotSpeed); };

  // ---------- edit mode ----------
  function setEdit(on) {
    editing = on; select(null);
    $('#edit').classList.toggle('on', on); $('#bEdit').classList.toggle('on', on);
    if (on) { stopGuided(); closePopup(); renderEdit(); }
  }
  function select(h) {
    selected = h;
    const n = cur() && byId[cur()];
    if (n) n.hotspots.forEach(x => x._div && x._div.classList.toggle('sel', x === h));
    if (editing) renderEdit();
  }
  const exportTour = () => JSON.parse(JSON.stringify(tour, (k, v) => k.startsWith('_') ? undefined : v));
  function persist() {
    edited = true; $('#editedBadge').hidden = false;
    localStorage.setItem(LS_KEY, JSON.stringify(exportTour()));
  }
  function renderEdit() {
    const id = cur(); if (!id) return; const n = byId[id];
    $('#eNode').textContent = `${n.name} (${id})`;
    $('#eEntry').textContent = n.entryU.toFixed(3);
    $('#eJump').innerHTML = tour.zones.map(z => `<optgroup label="${esc(z.name)}">` + z.nodes.map(nid => `<option value="${nid}" ${nid === id ? 'selected' : ''}>${esc(byId[nid].name)}</option>`).join('') + '</optgroup>').join('');
    $('#hsl').innerHTML = n.hotspots.map((h, i) => `<div class="it ${h === selected ? 'sel' : ''}" data-i="${i}"><span class="ty" style="background:${TCOL[h.type]}">${h.type}</span>${esc((h.type === 'link' ? '→ ' : '') + hsLabel(h))}<span class="uv">${h.u.toFixed(2)}, ${h.v.toFixed(2)}</span></div>`).join('');
    const opts = tour.nodes.filter(x => x.id !== id).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!selected) {
      $('#eSel').innerHTML = '';
    } else if (selected.type === 'menu') {
      $('#eSel').innerHTML = `<div class="row"><b>Selected menu</b> (click the panorama to move it)</div>`;
    } else if (selected.type === 'link') {
      $('#eSel').innerHTML = `<div class="row"><b>Selected link</b> (click the panorama to move it)</div><div class="row"><select id="sTarget">${opts.map(o => `<option value="${o.id}" ${o.id === selected.target ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select><button id="sDel">🗑 Delete</button></div>`;
    } else {
      $('#eSel').innerHTML = `<div class="row"><b>Selected ${selected.type}</b> (click the panorama to move it)</div><input id="sTitle" value="${esc(selected.title || '')}" placeholder="Title"><textarea id="sText" rows="4" placeholder="Text">${esc(selected.text || '')}</textarea><div class="row"><button id="sDel">🗑 Delete</button></div>`;
    }
    $('#eTarget').innerHTML = opts.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
    const st = $('#sTarget'); if (st) st.onchange = () => { selected.target = st.value; persist(); const s = selected; rebuild(); select(s); };
    const sti = $('#sTitle'); if (sti) { sti.oninput = () => { selected.title = sti.value; persist(); }; sti.onchange = () => { const s = selected; rebuild(); select(s); }; }
    const stx = $('#sText'); if (stx) stx.oninput = () => { selected.text = stx.value; persist(); };
    const sd = $('#sDel'); if (sd) sd.onclick = () => { n.hotspots.splice(n.hotspots.indexOf(selected), 1); selected = null; persist(); rebuild(); renderEdit(); };
  }
  $('#eJump').onchange = e => go(e.target.value);
  $('#hsl').addEventListener('click', e => { const it = e.target.closest('.it'); if (!it) return; const h = byId[cur()].hotspots[+it.dataset.i]; select(h); viewer.lookAt(vToPitch(h.v), uToYaw(h.u), undefined, 500); });
  function addHs(h) {
    const n = byId[cur()];
    h.u = yawToU(viewer.getYaw()); h.v = pitchToV(viewer.getPitch()); h._uid = 'h' + uid++;
    n.hotspots.push(h); persist(); rebuild(); select(h);
  }
  $('#eAddLink').onclick = () => addHs({ type: 'link', target: $('#eTarget').value });
  $('#eAddInfo').onclick = () => addHs({ type: 'info', title: 'New info point', text: 'Describe this spot.' });
  $('#eAddImg').onclick = () => addHs({ type: 'image', title: 'Resort Map', image: 'map.png', text: 'Overview of every area in this tour.' });
  $('#eSetEntry').onclick = () => { const n = byId[cur()]; n.entryU = yawToU(viewer.getYaw()); cfg.scenes[n.id].yaw = uToYaw(n.entryU); persist(); renderEdit(); toast('Entry view set'); };
  $('#bEdit').onclick = () => setEdit(!editing);

  // click (not drag) on the panorama moves the selected hotspot
  const pano = $('#pano'); let down = null;
  pano.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; }, true);
  pano.addEventListener('pointerup', e => {
    if (!editing || !selected || !down || e.target.closest('.hs') || e.target.closest('.pnlm-controls-container')) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const [p, y] = viewer.mouseEventToCoords(e);
    selected.u = yawToU(y); selected.v = pitchToV(p);
    persist(); const s = selected; rebuild(); select(s);
  }, true);
  pano.addEventListener('mousemove', e => {
    if (!editing || !viewer.isLoaded()) return;
    const [p, y] = viewer.mouseEventToCoords(e);
    $('#cursor').textContent = `cursor u,v: ${yawToU(y).toFixed(3)}, ${pitchToV(p).toFixed(3)}`;
  });

  $('#eSave').onclick = async () => {
    try {
      const r = await fetch('save?tour=' + KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exportTour(), null, 1) });
      toast(r.ok ? 'Saved: I will use this layout for Unity' : 'Save failed: ' + r.status);
    } catch (err) { toast('Save failed: ' + err); }
  };
  $('#eDl').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(exportTour(), null, 1)], { type: 'application/json' }));
    a.download = KEY === 'dembi' ? 'tour.json' : 'tour.' + KEY + '.json'; a.click();
  };
  // settings inputs
  $('#sSecs').value = tour.guidedSeconds || 12; $('#sRot').value = tour.settings.rotSpeed; $('#sFov').value = tour.settings.hfov;
  $('#sSecs').onchange = e => { tour.guidedSeconds = Math.max(3, +e.target.value || 12); persist(); };
  $('#sRot').onchange = e => { tour.settings.rotSpeed = +e.target.value || 0; persist(); if (guided && !guided.paused) viewer.startAutoRotate(-tour.settings.rotSpeed); };
  $('#sFov').onchange = e => { tour.settings.hfov = Math.min(120, Math.max(50, +e.target.value || 100)); persist(); viewer.setHfov(tour.settings.hfov, 300); };

  // scene export / import (tour data + settings + current view)
  $('#eExp').onclick = () => {
    const pkg = { format: 'tour-scene', version: 1, tour: KEY, exportedAt: new Date().toISOString(),
      view: { scene: cur(), yaw: viewer.getYaw(), pitch: viewer.getPitch(), hfov: viewer.getHfov() }, data: exportTour() };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(pkg, null, 1)], { type: 'application/json' }));
    a.download = KEY + '-scene.json'; a.click(); toast('Scene exported');
  };
  $('#eImp').onclick = () => $('#eFile').click();
  $('#eFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const pkg = JSON.parse(await f.text());
      if (pkg.format !== 'tour-scene' || !pkg.data) throw new Error('not a scene export file');
      if (pkg.tour !== KEY) throw new Error('this file is for tour "' + pkg.tour + '", not "' + KEY + '"');
      const d = pkg.data;
      if (!Array.isArray(d.nodes) || !Array.isArray(d.zones) || !d.start) throw new Error('tour data is incomplete');
      const ids = new Set(d.nodes.map(n => n.id));
      if (!d.nodes.every(n => ids.has(n.id) && Array.isArray(n.hotspots))) throw new Error('invalid locations');
      if (!ids.has(d.start)) throw new Error('start location is missing');
      if (!confirm('Replace the current edits with "' + f.name + '"?')) return;
      localStorage.setItem(LS_KEY, JSON.stringify(d));
      if (pkg.view) sessionStorage.setItem('importView.' + KEY, JSON.stringify(pkg.view));
      location.reload();
    } catch (err) { toast('Import failed: ' + err.message); }
  };
  $('#eReset').onclick = () => { if (!confirm('Discard all hotspot edits?')) return; localStorage.removeItem(LS_KEY); location.reload(); };

  // ---------- misc ----------
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => t.style.display = 'none', 2200); }
  const count = f => tour.nodes.reduce((a, n) => a + n.hotspots.filter(f).length, 0);
  $('#stats').innerHTML = [[tour.nodes.length, 'locations'], [tour.zones.length, 'menu areas'], [count(h => h.type === 'link'), 'navigation hotspots'],
    [count(h => h.type === 'info' || h.type === 'image'), 'info / map points'], [tour.guided.length, 'guided tour stops']]
    .map(([v, l]) => `<div><b>${v}</b>${l}</div>`).join('');
  $('#bAbout').onclick = () => $('#about').classList.add('open');
  $('#aClose').onclick = () => $('#about').classList.remove('open');
  $('#about').addEventListener('click', e => { if (e.target.id === 'about') $('#about').classList.remove('open'); });
  if (KEY === 'dembi' && !new URLSearchParams(location.search).has('nointro')) $('#about').classList.add('open');
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { closePopup(); $('#about').classList.remove('open'); }
    else if (k === 'g') guided ? stopGuided() : startGuided();
    else if (k === 'e') setEdit(!editing);
  });
  window.__tour = { viewer, tour, byId, go };
})();
