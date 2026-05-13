/* ============================================================
   FAMILY TREE APP — script.js
   Interactive Genealogy Application
   Uses: D3.js v7, jsPDF
   ============================================================ */

'use strict';

/* ──────────────────────────────────────────────────────────────
   1. STATE
────────────────────────────────────────────────────────────── */
const State = {
  families: {},            // { id: { name, members:{id:member}, rootId } }
  activeFamilyId: null,
  selectedMemberId: null,
  filterMode: 'all',       // all | alive | deceased
  undoStack: [],
  redoStack: [],
  zoom: null,
  svg: null,
  gMain: null,
  simulation: null,
  dragTarget: null,
  ctxTarget: null,
};

/* ──────────────────────────────────────────────────────────────
   2. HELPERS
────────────────────────────────────────────────────────────── */
const uid = () => 'id_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clone = o => JSON.parse(JSON.stringify(o));
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='40' fill='%23312e81'/%3E%3Ccircle cx='40' cy='28' r='16' fill='%237c3aed'/%3E%3Cellipse cx='40' cy='68' rx='24' ry='18' fill='%237c3aed'/%3E%3C/svg%3E";

function calcAge(dob, dod) {
  if (!dob) return null;
  const end = dod ? new Date(dod) : new Date();
  const start = new Date(dob);
  let age = end.getFullYear() - start.getFullYear();
  const m = end.getMonth() - start.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < start.getDate())) age--;
  return age;
}

function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}); }
  catch { return d; }
}

function daysUntilBirthday(dob) {
  if (!dob) return Infinity;
  const now = new Date();
  const bd = new Date(dob);
  const next = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return Math.round((next - now) / 86400000);
}

function getGenderGrad(gender) {
  return gender === 'Female' ? 'url(#grad-female)' : gender === 'Other' ? 'url(#grad-other)' : 'url(#grad-male)';
}

function getMemberById(id) {
  const f = State.families[State.activeFamilyId];
  return f ? f.members[id] : null;
}

function activeFamily() {
  return State.families[State.activeFamilyId] || null;
}

function saveState() {
  try { localStorage.setItem('familyTreeData', JSON.stringify({ families: State.families, activeFamilyId: State.activeFamilyId })); } catch(e){}
}

function loadState() {
  try {
    const raw = localStorage.getItem('familyTreeData');
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(State, data);
    return true;
  } catch(e) { return false; }
}

/* ──────────────────────────────────────────────────────────────
   3. UNDO / REDO
────────────────────────────────────────────────────────────── */
function pushUndo() {
  State.undoStack.push(clone({ families: State.families, activeFamilyId: State.activeFamilyId }));
  if (State.undoStack.length > 50) State.undoStack.shift();
  State.redoStack = [];
  updateUndoRedoBtns();
}

function undo() {
  if (!State.undoStack.length) return;
  State.redoStack.push(clone({ families: State.families, activeFamilyId: State.activeFamilyId }));
  const prev = State.undoStack.pop();
  Object.assign(State, prev);
  saveState(); renderAll(); updateUndoRedoBtns();
  toast('Undone', 'info');
}

function redo() {
  if (!State.redoStack.length) return;
  State.undoStack.push(clone({ families: State.families, activeFamilyId: State.activeFamilyId }));
  const next = State.redoStack.pop();
  Object.assign(State, next);
  saveState(); renderAll(); updateUndoRedoBtns();
  toast('Redone', 'info');
}

function updateUndoRedoBtns() {
  $('btn-undo').disabled = !State.undoStack.length;
  $('btn-redo').disabled = !State.redoStack.length;
}

/* ──────────────────────────────────────────────────────────────
   4. TOAST
────────────────────────────────────────────────────────────── */
function toast(msg, type='success', dur=3000) {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="t-icon">${icons[type]||'💬'}</span><span>${esc(msg)}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => { el.classList.add('removing'); setTimeout(() => el.remove(), 300); }, dur);
}

/* ──────────────────────────────────────────────────────────────
   5. FAMILY MANAGEMENT
────────────────────────────────────────────────────────────── */
function createFamily(name) {
  const id = uid();
  State.families[id] = { name: name || 'My Family', members: {}, rootId: null };
  State.activeFamilyId = id;
  saveState(); renderAll();
  toast(`Family "${name}" created`, 'success');
  return id;
}

function renameFamily(id, name) {
  if (!State.families[id]) return;
  pushUndo();
  State.families[id].name = name;
  saveState(); renderFamilySelect(); renderAll();
  toast('Family renamed', 'info');
}

function deleteFamily(id) {
  if (!State.families[id]) return;
  pushUndo();
  delete State.families[id];
  const keys = Object.keys(State.families);
  State.activeFamilyId = keys.length ? keys[0] : null;
  if (!State.activeFamilyId) createFamily('My Family');
  else { saveState(); renderAll(); }
  toast('Family deleted', 'warning');
}

function switchFamily(id) {
  State.activeFamilyId = id;
  State.selectedMemberId = null;
  saveState(); renderAll();
}

function renderFamilySelect() {
  const sel = $('family-select');
  sel.innerHTML = '';
  Object.entries(State.families).forEach(([id, f]) => {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = f.name;
    if (id === State.activeFamilyId) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* ──────────────────────────────────────────────────────────────
   6. MEMBER CRUD
────────────────────────────────────────────────────────────── */
function addMember(data) {
  const fam = activeFamily(); if (!fam) return null;
  pushUndo();
  const id = uid();
  fam.members[id] = {
    id, name: data.name || 'Unknown',
    dob: data.dob||'', dod: data.dod||'',
    gender: data.gender||'Male',
    photo: data.photo || DEFAULT_AVATAR,
    spouseId: data.spouseId||'',
    marriageDate: data.marriageDate||'',
    notes: data.notes||'',
    country: data.country||'', state: data.state||'', city: data.city||'',
    parentId: data.parentId||'',
    parentId2: data.parentId2||'',
    isAdopted: !!data.isAdopted,
    biologicalParentId: data.biologicalParentId||'',
    biologicalParentId2: data.biologicalParentId2||'',
    generation: data.generation ?? 0,
    x: data.x ?? 400, y: data.y ?? 300,
  };
  if (!fam.rootId) fam.rootId = id;
  saveState(); renderAll();
  toast(`${data.name} added`, 'success');
  return id;
}

function editMember(id, data) {
  const m = getMemberById(id); if (!m) return;
  pushUndo();
  Object.assign(m, data);
  saveState(); renderAll();
  toast(`${m.name} updated`, 'info');
}

function deleteMember(id) {
  const fam = activeFamily(); if (!fam) return;
  const m = fam.members[id]; if (!m) return;
  if (!confirm(`Delete ${m.name} from the family tree?`)) return;
  pushUndo();
  // Remove references
  Object.values(fam.members).forEach(mem => {
    if (mem.spouseId === id) mem.spouseId = '';
    if (mem.parentId === id) mem.parentId = '';
    if (mem.parentId2 === id) mem.parentId2 = '';
    if (mem.biologicalParentId === id) mem.biologicalParentId = '';
    if (mem.biologicalParentId2 === id) mem.biologicalParentId2 = '';
  });
  delete fam.members[id];
  if (fam.rootId === id) {
    const keys = Object.keys(fam.members);
    fam.rootId = keys.length ? keys[0] : null;
  }
  if (State.selectedMemberId === id) State.selectedMemberId = null;
  saveState(); renderAll();
  toast(`Member deleted`, 'warning');
}

/* ──────────────────────────────────────────────────────────────
   7. TREE LAYOUT  (hierarchical top-down)
────────────────────────────────────────────────────────────── */
const NODE_W = 160, NODE_H = 90, H_GAP = 50, V_GAP = 130;

function buildTreeData() {
  const fam = activeFamily();
  if (!fam) return { nodes:[], links:[] };

  const members = Object.values(fam.members);
  if (!members.length) return { nodes:[], links:[] };

  // Assign generations
  const gen = {};
  function assignGen(id, g, visited=new Set()) {
    if (!id || visited.has(id)) return;
    visited.add(id);
    if (gen[id] === undefined || gen[id] > g) gen[id] = g;
    const children = members.filter(m => m.parentId === id || m.parentId2 === id);
    children.forEach(c => assignGen(c.id, g+1, new Set(visited)));
  }
  if (fam.rootId) assignGen(fam.rootId, 0);
  members.forEach(m => { if (gen[m.id] === undefined) gen[m.id] = m.generation||0; });

  // Group by generation
  const byGen = {};
  members.forEach(m => {
    const g = gen[m.id] ?? 0;
    if (!byGen[g]) byGen[g] = [];
    byGen[g].push(m);
  });

  // Position nodes
  const positioned = {};
  Object.keys(byGen).sort((a,b)=>+a-+b).forEach(g => {
    const row = byGen[g];
    const rowWidth = row.length * (NODE_W + H_GAP) - H_GAP;
    row.forEach((m, i) => {
      // Try to center under parent
      let x = i * (NODE_W + H_GAP) - rowWidth/2 + NODE_W/2;
      const parent = m.parentId ? positioned[m.parentId] : null;
      if (parent && row.length === 1) x = parent.x;
      positioned[m.id] = { x, y: +g * (NODE_H + V_GAP) };
    });
  });

  // Better parent-centered positioning
  function centerUnderParents() {
    for (let pass=0; pass<3; pass++) {
      Object.keys(byGen).sort((a,b)=>+a-+b).forEach(g => {
        const row = byGen[g];
        row.forEach(m => {
          const parents = members.filter(p => p.id === m.parentId || p.id === m.parentId2);
          if (parents.length && parents.every(p => positioned[p.id])) {
            const avgX = parents.reduce((s,p) => s + (positioned[p.id]?.x||0),0) / parents.length;
            // Only nudge, don't fully override to avoid collisions
            positioned[m.id].x = positioned[m.id].x * 0.4 + avgX * 0.6;
          }
        });
        // Resolve overlaps
        row.sort((a,b) => (positioned[a.id]?.x||0) - (positioned[b.id]?.x||0));
        for (let i=1; i<row.length; i++) {
          const prev = positioned[row[i-1].id];
          const curr = positioned[row[i].id];
          if (curr.x - prev.x < NODE_W + H_GAP) curr.x = prev.x + NODE_W + H_GAP;
        }
      });
    }
  }
  centerUnderParents();

  const nodes = members.map(m => ({
    ...m,
    x: positioned[m.id]?.x ?? m.x ?? 0,
    y: positioned[m.id]?.y ?? m.y ?? 0,
    gen: gen[m.id] ?? 0,
  }));

  const links = [];
  members.forEach(m => {
    [m.parentId, m.parentId2].forEach((pid, idx) => {
      if (!pid) return;
      const par = fam.members[pid];
      if (!par) return;
      links.push({ source: pid, target: m.id, type: m.isAdopted ? 'adopted' : 'parent', idx });
    });
    if (m.biologicalParentId) links.push({ source: m.biologicalParentId, target: m.id, type:'biological' });
    if (m.biologicalParentId2) links.push({ source: m.biologicalParentId2, target: m.id, type:'biological' });
    if (m.spouseId && m.spouseId > m.id) {
      const sp = fam.members[m.spouseId];
      if (sp) links.push({ source: m.id, target: m.spouseId, type:'spouse' });
    }
  });

  return { nodes, links };
}

/* ──────────────────────────────────────────────────────────────
   8. D3 TREE RENDER
────────────────────────────────────────────────────────────── */
function initSVG() {
  const container = $('chart-area');
  d3.select('#tree-svg').remove();

  const svg = d3.select(container).append('svg')
    .attr('id','tree-svg')
    .attr('width','100%').attr('height','100%')
    .style('background','transparent');

  // Defs: gradients, filters
  const defs = svg.append('defs');

  // Male gradient
  const gm = defs.append('linearGradient').attr('id','grad-male').attr('x1','0%').attr('y1','0%').attr('x2','100%').attr('y2','100%');
  gm.append('stop').attr('offset','0%').attr('stop-color','#1e3a6e');
  gm.append('stop').attr('offset','100%').attr('stop-color','#1d4ed8').attr('stop-opacity','0.6');

  // Female gradient
  const gf = defs.append('linearGradient').attr('id','grad-female').attr('x1','0%').attr('y1','0%').attr('x2','100%').attr('y2','100%');
  gf.append('stop').attr('offset','0%').attr('stop-color','#5f1e4a');
  gf.append('stop').attr('offset','100%').attr('stop-color','#be185d').attr('stop-opacity','0.6');

  // Other gradient
  const go = defs.append('linearGradient').attr('id','grad-other').attr('x1','0%').attr('y1','0%').attr('x2','100%').attr('y2','100%');
  go.append('stop').attr('offset','0%').attr('stop-color','#1a3a2a');
  go.append('stop').attr('offset','100%').attr('stop-color','#059669').attr('stop-opacity','0.6');

  // Glow filter
  const fl = defs.append('filter').attr('id','glow').attr('x','-30%').attr('y','-30%').attr('width','160%').attr('height','160%');
  fl.append('feGaussianBlur').attr('stdDeviation','4').attr('result','blur');
  const feMerge = fl.append('feMerge');
  feMerge.append('feMergeNode').attr('in','blur');
  feMerge.append('feMergeNode').attr('in','SourceGraphic');

  // Drop shadow
  const ds = defs.append('filter').attr('id','shadow');
  ds.append('feDropShadow').attr('dx','0').attr('dy','4').attr('stdDeviation','6').attr('flood-color','rgba(0,0,0,0.5)');

  // clipPath for avatar
  defs.append('clipPath').attr('id','avatar-clip').append('circle').attr('r','18');

  const gMain = svg.append('g').attr('id','g-main');

  // Zoom behaviour
  const zoom = d3.zoom()
    .scaleExtent([0.1, 3])
    .on('zoom', e => gMain.attr('transform', e.transform));

  svg.call(zoom);
  svg.on('contextmenu', e => e.preventDefault());
  svg.on('click', e => { if (e.target === svg.node()) hideCtxMenu(); });

  State.svg = svg;
  State.gMain = gMain;
  State.zoom = zoom;
}

function centerTree() {
  const fam = activeFamily();
  if (!fam || !Object.keys(fam.members).length) return;
  const container = $('chart-area');
  const W = container.clientWidth, H = container.clientHeight;
  // Center on root
  State.svg.transition().duration(600)
    .call(State.zoom.transform, d3.zoomIdentity.translate(W/2, H/5).scale(0.85));
}

function renderTree() {
  if (!State.svg) initSVG();
  const g = State.gMain;
  const fam = activeFamily();
  if (!fam) { g.selectAll('*').remove(); showWelcome(); return; }
  hideWelcome();

  const { nodes, links } = buildTreeData();

  // Filter
  const visibleIds = new Set(nodes
    .filter(n => {
      if (State.filterMode === 'alive') return !n.dod;
      if (State.filterMode === 'deceased') return !!n.dod;
      return true;
    }).map(n => n.id));

  const visNodes = nodes.filter(n => visibleIds.has(n.id));
  const visLinks = links.filter(l => visibleIds.has(l.source) && visibleIds.has(l.target));

  const nodeMap = {};
  visNodes.forEach(n => nodeMap[n.id] = n);

  // ── LINKS ──
  const linkSel = g.selectAll('.link-group').data(visLinks, d => `${d.source}-${d.target}-${d.type}`);
  linkSel.exit().transition().duration(300).style('opacity',0).remove();

  const linkEnter = linkSel.enter().append('g').attr('class','link-group').style('opacity',0);
  linkEnter.append('path')
    .attr('class', d => d.type === 'spouse' ? 'link link-spouse' : d.type === 'adopted' ? 'link link-adopted' : d.type === 'biological' ? 'link link-biological' : 'link')
    .attr('d', d => calcLinkPath(d, nodeMap));

  const linkMerge = linkEnter.merge(linkSel);
  linkMerge.transition().duration(500).style('opacity',1)
    .select('path').attr('d', d => calcLinkPath(d, nodeMap));

  // ── NODES ──
  const nodeSel = g.selectAll('.node-group').data(visNodes, d => d.id);
  nodeSel.exit().transition().duration(300).style('opacity',0).attr('transform', d=>`translate(${d.x},${d.y}) scale(0)`).remove();

  const nodeEnter = nodeSel.enter().append('g')
    .attr('class','node-group')
    .attr('transform', d => `translate(${d.x},${d.y}) scale(0)`)
    .style('opacity',0)
    .on('click', (e,d) => { e.stopPropagation(); selectMember(d.id); hideCtxMenu(); })
    .on('dblclick', (e,d) => { e.stopPropagation(); openDetailPanel(d.id); })
    .on('contextmenu', (e,d) => { e.preventDefault(); e.stopPropagation(); showCtxMenu(e, d.id); })
    .on('mouseover', (e,d) => showTooltip(e,d))
    .on('mousemove', e => moveTooltip(e))
    .on('mouseout', () => hideTooltip())
    .call(d3.drag()
      .on('start', dragStart)
      .on('drag', dragging)
      .on('end', dragEnd)
    );

  // Card rect
  nodeEnter.append('rect')
    .attr('class','node-card')
    .attr('x', -NODE_W/2).attr('y', -NODE_H/2)
    .attr('width', NODE_W).attr('height', NODE_H)
    .attr('rx',14).attr('ry',14)
    .attr('fill', d => getGenderGrad(d.gender))
    .attr('stroke', d => d.id === State.selectedMemberId ? '#7c3aed' : 'rgba(255,255,255,0.12)')
    .attr('stroke-width', d => d.id === State.selectedMemberId ? 2.5 : 1)
    .attr('filter','url(#shadow)');

  // Root ring
  nodeEnter.filter(d => d.id === fam.rootId)
    .append('rect')
    .attr('class','node-root-ring')
    .attr('x', -NODE_W/2-4).attr('y', -NODE_H/2-4)
    .attr('width', NODE_W+8).attr('height', NODE_H+8)
    .attr('rx',18).attr('ry',18)
    .attr('fill','none').attr('stroke','rgba(124,58,237,0.5)');

  // Avatar circle bg
  nodeEnter.append('circle').attr('cx', -NODE_W/2+26).attr('cy',0).attr('r',22)
    .attr('fill','rgba(0,0,0,0.3)');

  // Avatar image
  nodeEnter.append('image')
    .attr('x', -NODE_W/2+4).attr('y',-22)
    .attr('width',44).attr('height',44)
    .attr('clip-path','none')
    .attr('href', d => d.photo||DEFAULT_AVATAR)
    .attr('preserveAspectRatio','xMidYMid slice')
    .style('border-radius','50%')
    .each(function(d){
      const el = d3.select(this);
      const clipId = 'clip-'+d.id;
      // add clip
      State.svg.select('defs').append('clipPath').attr('id',clipId)
        .append('circle').attr('cx',-NODE_W/2+26).attr('cy',0).attr('r',22);
      el.attr('clip-path',`url(#${clipId})`);
    });

  // Gender icon
  nodeEnter.append('text')
    .attr('x', -NODE_W/2+26).attr('y', 28)
    .attr('text-anchor','middle').attr('font-size','10')
    .attr('fill', d => d.gender==='Female'?'#f9a8d4':d.gender==='Other'?'#86efac':'#93c5fd')
    .text(d => d.gender==='Female'?'♀':d.gender==='Other'?'⚧':'♂');

  // Name text
  nodeEnter.append('text')
    .attr('class','node-name')
    .attr('x', -NODE_W/2+58).attr('y',-14)
    .attr('font-size','11.5').attr('font-weight','700').attr('fill','#f1f5f9')
    .each(function(d){
      const el = d3.select(this);
      const words = d.name.split(' ');
      if (words.length > 2) {
        el.text(words.slice(0,2).join(' '));
        el.append('tspan').attr('x',-NODE_W/2+58).attr('dy','14').attr('font-size','10').attr('fill','#94a3b8').text(words.slice(2).join(' '));
      } else el.text(d.name);
    });

  // DOB / Age
  nodeEnter.append('text')
    .attr('x', -NODE_W/2+58).attr('y',4)
    .attr('font-size','9.5').attr('fill','#94a3b8')
    .text(d => {
      if (!d.dob) return '';
      const age = calcAge(d.dob, d.dod);
      return d.dod ? `† ${formatDate(d.dod)}` : (age !== null ? `Age ${age}` : '');
    });

  // Location
  nodeEnter.append('text')
    .attr('x', -NODE_W/2+58).attr('y',17)
    .attr('font-size','9').attr('fill','#64748b')
    .text(d => d.city ? `📍${d.city}` : (d.country ? `📍${d.country}` : ''));

  // Generation badge
  nodeEnter.append('rect')
    .attr('x', NODE_W/2-28).attr('y', -NODE_H/2+6)
    .attr('width',22).attr('height',14).attr('rx',4)
    .attr('fill','rgba(124,58,237,0.4)');
  nodeEnter.append('text')
    .attr('x', NODE_W/2-17).attr('y', -NODE_H/2+17)
    .attr('font-size','8').attr('font-weight','700')
    .attr('fill','#c4b5fd').attr('text-anchor','middle')
    .text(d => `G${d.gen+1}`);

  // Deceased indicator
  nodeEnter.filter(d => !!d.dod)
    .append('text').attr('x', NODE_W/2-10).attr('y', NODE_H/2-8)
    .attr('font-size','12').attr('fill','rgba(255,255,255,0.4)')
    .attr('text-anchor','end').text('✝');

  // Adopted indicator
  nodeEnter.filter(d => !!d.isAdopted)
    .append('text').attr('x', -NODE_W/2+6).attr('y', NODE_H/2-8)
    .attr('font-size','9').attr('fill','#67e8f9')
    .text('Adpt');

  const nodeMerge = nodeEnter.merge(nodeSel);

  nodeMerge.transition().duration(500)
    .attr('transform', d => `translate(${d.x},${d.y}) scale(1)`)
    .style('opacity',1);

  // Update stroke for selected
  nodeMerge.select('.node-card')
    .attr('stroke', d => d.id === State.selectedMemberId ? '#7c3aed' : 'rgba(255,255,255,0.12)')
    .attr('stroke-width', d => d.id === State.selectedMemberId ? 2.5 : 1);
}

function calcLinkPath(d, nodeMap) {
  const s = nodeMap[d.source], t = nodeMap[d.target];
  if (!s || !t) return '';
  if (d.type === 'spouse') {
    // horizontal line between spouses
    const mx = (s.x + t.x) / 2;
    return `M${s.x},${s.y} C${mx},${s.y} ${mx},${t.y} ${t.x},${t.y}`;
  }
  // parent-child: elbow connector
  const sy = s.y + NODE_H/2, ty = t.y - NODE_H/2;
  const my = (sy + ty) / 2;
  return `M${s.x},${sy} C${s.x},${my} ${t.x},${my} ${t.x},${ty}`;
}

function dragStart(e, d) { State.dragTarget = d.id; hideTooltip(); }
function dragging(e, d) {
  const fam = activeFamily(); if (!fam) return;
  const m = fam.members[d.id]; if (!m) return;
  m.x = e.x; m.y = e.y;
  d.x = e.x; d.y = e.y;
  renderTree();
}
function dragEnd(e, d) { State.dragTarget = null; saveState(); }

/* ──────────────────────────────────────────────────────────────
   9. TOOLTIP
────────────────────────────────────────────────────────────── */
function showTooltip(e, d) {
  const tt = $('tooltip');
  const age = calcAge(d.dob, d.dod);
  tt.innerHTML = `
    <h4>${esc(d.name)}</h4>
    <p>🗓 ${d.dob ? formatDate(d.dob) : '—'}</p>
    ${d.dod ? `<p>✝ ${formatDate(d.dod)}</p>` : ''}
    ${age !== null ? `<p>Age: ${age}</p>` : ''}
    ${d.city||d.country ? `<p>📍 ${esc([d.city,d.state,d.country].filter(Boolean).join(', '))}</p>` : ''}
    <p style="color:var(--accent2);margin-top:4px;font-size:.7rem">Click to select • Dbl-click for details</p>
  `;
  tt.classList.add('visible');
  moveTooltip(e);
}
function moveTooltip(e) {
  const tt = $('tooltip');
  tt.style.left = (e.clientX+14)+'px';
  tt.style.top = (e.clientY-10)+'px';
}
function hideTooltip() { $('tooltip').classList.remove('visible'); }

/* ──────────────────────────────────────────────────────────────
   10. CONTEXT MENU
────────────────────────────────────────────────────────────── */
function showCtxMenu(e, id) {
  hideCtxMenu();
  const m = getMemberById(id); if (!m) return;
  State.ctxTarget = id;
  const menu = $('ctx-menu');
  menu.innerHTML = `
    <div class="ctx-item" onclick="openDetailPanel('${id}')">👁 View Details</div>
    <div class="ctx-item" onclick="openEditModal('${id}')">✏️ Edit Member</div>
    <div class="ctx-item" onclick="openAddModal('${id}')">➕ Add Child</div>
    <div class="ctx-item" onclick="openAddSpouseModal('${id}')">💍 Add Spouse</div>
    <div class="ctx-item" onclick="openMiniChart('${id}')">🌳 View Sub-Tree</div>
    <div class="ctx-item" onclick="openRelationFinder('${id}')">🔗 Find Relationship</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item danger" onclick="deleteMember('${id}')">🗑 Delete Member</div>
  `;
  menu.style.left = Math.min(e.clientX, window.innerWidth-180)+'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight-260)+'px';
  menu.style.display = 'block';
}
function hideCtxMenu() { $('ctx-menu').style.display='none'; State.ctxTarget=null; }

/* ──────────────────────────────────────────────────────────────
   11. SELECT MEMBER
────────────────────────────────────────────────────────────── */
function selectMember(id) {
  State.selectedMemberId = id;
  renderSidebarList();
  renderTree();
  // Highlight in sidebar
  $$('.member-list-item').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
}

/* ──────────────────────────────────────────────────────────────
   12. MEMBER DETAIL PANEL
────────────────────────────────────────────────────────────── */
function openDetailPanel(id) {
  const fam = activeFamily(); if (!fam) return;
  const m = fam.members[id]; if (!m) return;
  selectMember(id);

  const panel = $('detail-panel');
  const age = calcAge(m.dob, m.dod);
  const isDeceased = !!m.dod;
  const spouseName = m.spouseId && fam.members[m.spouseId] ? fam.members[m.spouseId].name : '';

  // Children
  const children = Object.values(fam.members).filter(c => c.parentId===id || c.parentId2===id);
  // Siblings
  const siblings = m.parentId ? Object.values(fam.members).filter(s => s.id!==id && (s.parentId===m.parentId||s.parentId2===m.parentId)) : [];

  // Timeline
  const events = [];
  if (m.dob) events.push({ year: m.dob.slice(0,4), text: `Born in ${m.city||m.country||'unknown'}` });
  if (m.marriageDate && spouseName) events.push({ year: m.marriageDate.slice(0,4), text: `Married ${esc(spouseName)}` });
  if (m.dod) events.push({ year: m.dod.slice(0,4), text: 'Passed away' });

  const genGrad = m.gender==='Female'?'linear-gradient(135deg,#5f1e4a,#be185d44)':m.gender==='Other'?'linear-gradient(135deg,#1a3a2a,#05966944)':'linear-gradient(135deg,#1e3a6e,#1d4ed844)';

  panel.querySelector('.detail-box').innerHTML = `
    <div class="detail-hero" style="background:${genGrad}">
      <div class="detail-hero-bg" style="background-image:url('${m.photo||DEFAULT_AVATAR}')"></div>
      <div class="detail-hero-content">
        <img class="detail-avatar" src="${m.photo||DEFAULT_AVATAR}" alt="${esc(m.name)}" onerror="this.src='${DEFAULT_AVATAR}'">
        <div>
          <div class="detail-name">${esc(m.name)}</div>
          <div class="detail-dates">
            ${m.dob?`🎂 ${formatDate(m.dob)}`:''}
            ${m.dod?` — ✝ ${formatDate(m.dod)}`:''}
            ${age!==null?`(${age} ${isDeceased?'yrs old at death':'years old'})`:''}
          </div>
          <div class="detail-badges">
            <span class="badge badge-${m.gender.toLowerCase()}">${m.gender}</span>
            <span class="badge badge-${isDeceased?'deceased':'alive'}">${isDeceased?'Deceased':'Living'}</span>
            ${m.isAdopted?'<span class="badge badge-adopted">Adopted</span>':''}
            <span class="badge" style="background:rgba(124,58,237,0.3);color:#c4b5fd">Gen ${m.gen!==undefined?m.gen+1:'?'}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="detail-body">
      <div class="detail-section">
        <div class="detail-section-title">📋 Personal Info</div>
        <div class="detail-grid">
          ${m.dob?`<div class="detail-field"><div class="detail-field-label">Date of Birth</div><div class="detail-field-value">${formatDate(m.dob)}</div></div>`:''}
          ${m.dod?`<div class="detail-field"><div class="detail-field-label">Date of Death</div><div class="detail-field-value">${formatDate(m.dod)}</div></div>`:''}
          ${m.city||m.country?`<div class="detail-field"><div class="detail-field-label">Location</div><div class="detail-field-value">${esc([m.city,m.state,m.country].filter(Boolean).join(', '))}</div></div>`:''}
          ${spouseName?`<div class="detail-field"><div class="detail-field-label">Spouse</div><div class="detail-field-value" style="cursor:pointer;color:var(--accent2)" onclick="openDetailPanel('${m.spouseId}')">${esc(spouseName)}</div></div>`:''}
          ${m.marriageDate?`<div class="detail-field"><div class="detail-field-label">Marriage Date</div><div class="detail-field-value">${formatDate(m.marriageDate)}</div></div>`:''}
          ${m.isAdopted && m.biologicalParentId && fam.members[m.biologicalParentId]?`<div class="detail-field"><div class="detail-field-label">Bio Parent</div><div class="detail-field-value" style="cursor:pointer;color:var(--accent2)" onclick="openDetailPanel('${m.biologicalParentId}')">${esc(fam.members[m.biologicalParentId].name)}</div></div>`:''}
        </div>
      </div>
      ${children.length?`
      <div class="detail-section">
        <div class="detail-section-title">👶 Children (${children.length})</div>
        <div class="relations-list">
          ${children.map(c=>`<div class="relation-chip" onclick="openDetailPanel('${c.id}')"><img src="${c.photo||DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}'" alt="${esc(c.name)}"><div><div>${esc(c.name)}</div><span>${c.gender}</span></div></div>`).join('')}
        </div>
      </div>`:''}
      ${siblings.length?`
      <div class="detail-section">
        <div class="detail-section-title">👥 Siblings (${siblings.length})</div>
        <div class="relations-list">
          ${siblings.map(s=>`<div class="relation-chip" onclick="openDetailPanel('${s.id}')"><img src="${s.photo||DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}'" alt="${esc(s.name)}"><div><div>${esc(s.name)}</div><span>${s.gender}</span></div></div>`).join('')}
        </div>
      </div>`:''}
      ${m.notes?`
      <div class="detail-section">
        <div class="detail-section-title">📝 Biography / Notes</div>
        <div class="biography-text">${esc(m.notes).replace(/\n/g,'<br>')}</div>
      </div>`:''}
      ${events.length?`
      <div class="detail-section">
        <div class="detail-section-title">📅 Timeline</div>
        <div class="timeline">
          ${events.map(ev=>`<div class="timeline-item"><div class="timeline-year">${ev.year}</div><div class="timeline-text">${ev.text}</div></div>`).join('')}
        </div>
      </div>`:''}
    </div>
    <div class="detail-footer">
      <button class="btn btn-primary btn-sm" onclick="openEditModal('${id}')">✏️ Edit</button>
      <button class="btn btn-info btn-sm" onclick="openMiniChart('${id}')">🌳 Sub-Tree</button>
      <button class="btn btn-secondary btn-sm" onclick="openAddModal('${id}')">➕ Add Child</button>
      <button class="btn btn-warning btn-sm" onclick="openRelationFinder('${id}')">🔗 Relations</button>
      <button class="btn btn-danger btn-sm" onclick="deleteMember('${id}');closeDetailPanel()">🗑 Delete</button>
      <button class="btn btn-secondary btn-sm" onclick="closeDetailPanel()" style="margin-left:auto">✕ Close</button>
    </div>
  `;
  panel.classList.add('open');
}
function closeDetailPanel() { $('detail-panel').classList.remove('open'); }

/* ──────────────────────────────────────────────────────────────
   13. ADD / EDIT MEMBER MODAL
────────────────────────────────────────────────────────────── */
let _editingId = null;
let _parentIdForNew = null;
let _spouseTargetId = null;

function openAddModal(parentId='') {
  _editingId = null;
  _parentIdForNew = parentId || '';
  _spouseTargetId = null;
  const fam = activeFamily();
  const memberOptions = fam ? Object.values(fam.members).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('') : '';
  const parentMember = parentId && fam ? fam.members[parentId] : null;

  showMemberModal({
    title: parentId ? `➕ Add Child of ${parentMember?.name||''}` : '➕ Add Family Member',
    data: {},
    memberOptions,
    parentId,
  });
}

function openAddSpouseModal(targetId) {
  _editingId = null;
  _parentIdForNew = '';
  _spouseTargetId = targetId;
  const fam = activeFamily();
  const m = fam?.members[targetId];
  const memberOptions = fam ? Object.values(fam.members).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('') : '';
  showMemberModal({
    title: `💍 Add Spouse of ${m?.name||''}`,
    data: { spouseId: targetId },
    memberOptions,
    parentId: '',
  });
}

function openEditModal(id) {
  const m = getMemberById(id); if (!m) return;
  _editingId = id;
  _parentIdForNew = '';
  _spouseTargetId = null;
  const fam = activeFamily();
  const memberOptions = fam ? Object.values(fam.members).filter(mb=>mb.id!==id).map(mb=>`<option value="${mb.id}" ${mb.id===m.spouseId?'selected':''}>${esc(mb.name)}</option>`).join('') : '';
  showMemberModal({ title:'✏️ Edit Member', data:m, memberOptions, parentId: m.parentId||'' });
}

function showMemberModal({ title, data, memberOptions, parentId }) {
  const fam = activeFamily();
  const allMembers = fam ? Object.values(fam.members) : [];
  const parentOptions = allMembers.map(m=>`<option value="${m.id}" ${m.id===data.parentId||m.id===parentId?'selected':''}>${esc(m.name)}</option>`).join('');
  const parent2Options = allMembers.map(m=>`<option value="${m.id}" ${m.id===data.parentId2?'selected':''}>${esc(m.name)}</option>`).join('');
  const bioParentOptions = allMembers.map(m=>`<option value="${m.id}" ${m.id===data.biologicalParentId?'selected':''}>${esc(m.name)}</option>`).join('');
  const bioPar2Options = allMembers.map(m=>`<option value="${m.id}" ${m.id===data.biologicalParentId2?'selected':''}>${esc(m.name)}</option>`).join('');

  const modal = $('member-modal');
  $('member-modal-title').textContent = title;
  $('member-modal-body').innerHTML = `
    <div class="avatar-upload">
      <img id="avatar-preview-img" class="avatar-preview" src="${data.photo||DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}'" alt="Photo">
      <div class="avatar-btn-wrap">
        <button class="btn btn-secondary btn-sm" onclick="$('avatar-file-input').click()">📷 Upload Photo</button>
        <input type="file" id="avatar-file-input" accept="image/*" style="display:none" onchange="handleAvatarUpload(this)">
        <span class="avatar-note">JPG, PNG, GIF max 2MB</span>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Full Name *</label>
        <input class="form-input" id="fm-name" value="${esc(data.name||'')}" placeholder="Full name" required>
      </div>
      <div class="form-group">
        <label class="form-label">Gender</label>
        <select class="form-select" id="fm-gender">
          <option value="Male" ${data.gender==='Male'||!data.gender?'selected':''}>Male</option>
          <option value="Female" ${data.gender==='Female'?'selected':''}>Female</option>
          <option value="Other" ${data.gender==='Other'?'selected':''}>Other</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Date of Birth</label>
        <input class="form-input" type="date" id="fm-dob" value="${data.dob||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Date of Death (if applicable)</label>
        <input class="form-input" type="date" id="fm-dod" value="${data.dod||''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Country</label>
        <input class="form-input" id="fm-country" value="${esc(data.country||'')}" placeholder="Country">
      </div>
      <div class="form-group">
        <label class="form-label">State / Province</label>
        <input class="form-input" id="fm-state" value="${esc(data.state||'')}" placeholder="State">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">City</label>
      <input class="form-input" id="fm-city" value="${esc(data.city||'')}" placeholder="City">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Parent 1</label>
        <select class="form-select" id="fm-parent">
          <option value="">— None —</option>
          ${parentOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Parent 2</label>
        <select class="form-select" id="fm-parent2">
          <option value="">— None —</option>
          ${parent2Options}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Spouse</label>
        <select class="form-select" id="fm-spouse">
          <option value="">— None —</option>
          ${memberOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Marriage Date</label>
        <input class="form-input" type="date" id="fm-marriage" value="${data.marriageDate||''}">
      </div>
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="fm-adopted" ${data.isAdopted?'checked':''} onchange="toggleAdoptionSection(this.checked)" style="width:16px;height:16px;accent-color:var(--accent2)">
        <span class="form-label" style="margin:0">This person is adopted</span>
      </label>
    </div>
    <div id="adoption-section" class="adoption-section ${data.isAdopted?'':'hidden'}">
      <h4>🧬 Biological Parents</h4>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Biological Parent 1</label>
          <select class="form-select" id="fm-bio-parent">
            <option value="">— None —</option>
            ${bioParentOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Biological Parent 2</label>
          <select class="form-select" id="fm-bio-parent2">
            <option value="">— None —</option>
            ${bioPar2Options}
          </select>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Biography / Notes</label>
      <textarea class="form-textarea" id="fm-notes" rows="3" placeholder="Life story, achievements, notes...">${esc(data.notes||'')}</textarea>
    </div>
  `;

  // If spouse target pre-select
  if (_spouseTargetId) {
    const sel = $('fm-spouse');
    if (sel) sel.value = _spouseTargetId;
  }

  openModal('member-modal');
}

function toggleAdoptionSection(show) {
  $('adoption-section').classList.toggle('hidden', !show);
}

function handleAvatarUpload(input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 3*1024*1024) { toast('Image too large (max 3MB)','error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    $('avatar-preview-img').src = e.target.result;
    $('avatar-preview-img').dataset.newSrc = e.target.result;
  };
  reader.readAsDataURL(file);
}

function saveMemberModal() {
  const name = $('fm-name')?.value?.trim();
  if (!name) { toast('Name is required','error'); return; }

  const avatarImg = $('avatar-preview-img');
  const photo = avatarImg?.dataset?.newSrc || avatarImg?.src || DEFAULT_AVATAR;

  const data = {
    name,
    gender: $('fm-gender')?.value||'Male',
    dob: $('fm-dob')?.value||'',
    dod: $('fm-dod')?.value||'',
    country: $('fm-country')?.value||'',
    state: $('fm-state')?.value||'',
    city: $('fm-city')?.value||'',
    parentId: $('fm-parent')?.value||_parentIdForNew||'',
    parentId2: $('fm-parent2')?.value||'',
    spouseId: $('fm-spouse')?.value||'',
    marriageDate: $('fm-marriage')?.value||'',
    isAdopted: $('fm-adopted')?.checked||false,
    biologicalParentId: $('fm-bio-parent')?.value||'',
    biologicalParentId2: $('fm-bio-parent2')?.value||'',
    notes: $('fm-notes')?.value||'',
    photo: photo.startsWith('data:') || photo.startsWith('http') ? photo : DEFAULT_AVATAR,
  };

  if (_editingId) {
    editMember(_editingId, data);
    // Sync spouse
    const fam = activeFamily();
    if (fam && data.spouseId && fam.members[data.spouseId]) {
      fam.members[data.spouseId].spouseId = _editingId;
    }
  } else {
    const newId = addMember(data);
    // Sync spouse both ways
    const fam = activeFamily();
    if (newId && fam && data.spouseId && fam.members[data.spouseId]) {
      fam.members[data.spouseId].spouseId = newId;
    }
    // If adding spouse for someone
    if (_spouseTargetId && fam && fam.members[_spouseTargetId]) {
      fam.members[_spouseTargetId].spouseId = newId;
      if (data.marriageDate) fam.members[_spouseTargetId].marriageDate = data.marriageDate;
    }
  }
  closeModal('member-modal');
  saveState(); renderAll();
}

/* ──────────────────────────────────────────────────────────────
   14. FAMILY MANAGER MODAL
────────────────────────────────────────────────────────────── */
function openFamilyModal() {
  const modal = $('family-modal');
  renderFamilyModalList();
  openModal('family-modal');
}

function renderFamilyModalList() {
  const list = $('family-modal-list');
  list.innerHTML = Object.entries(State.families).map(([id,f])=>`
    <div class="member-list-item" style="margin-bottom:6px">
      <span style="font-size:1.2rem">🏠</span>
      <div class="mli-info flex-1">
        <div class="mli-name">${esc(f.name)}</div>
        <div class="mli-sub">${Object.keys(f.members).length} members</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn-icon" onclick="promptRenameFamily('${id}')" title="Rename">✏️</button>
        <button class="btn-icon" onclick="switchFamily('${id}');closeModal('family-modal')" title="Switch" style="background:rgba(16,185,129,0.2)">✓</button>
        <button class="btn-icon" style="color:var(--danger)" onclick="deleteFamily('${id}')" title="Delete">🗑</button>
      </div>
    </div>
  `).join('') || '<p style="color:var(--text2);text-align:center;padding:20px">No families yet</p>';
}

function promptRenameFamily(id) {
  const f = State.families[id]; if (!f) return;
  const name = prompt('New family name:', f.name);
  if (name && name.trim()) { renameFamily(id, name.trim()); renderFamilyModalList(); }
}

function createNewFamilyFromModal() {
  const name = $('new-family-name')?.value?.trim() || 'New Family';
  createFamily(name);
  $('new-family-name').value = '';
  renderFamilyModalList();
  renderFamilySelect();
  closeModal('family-modal');
}

/* ──────────────────────────────────────────────────────────────
   15. RELATIONSHIP FINDER
────────────────────────────────────────────────────────────── */
function openRelationFinder(preSelectId='') {
  const modal = $('relation-modal');
  const fam = activeFamily();
  const opts = fam ? Object.values(fam.members).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('') : '';
  $('rel-person1').innerHTML = `<option value="">— Select —</option>${opts}`;
  $('rel-person2').innerHTML = `<option value="">— Select —</option>${opts}`;
  if (preSelectId) $('rel-person1').value = preSelectId;
  $('rel-result').textContent = 'Select two members and click Find Relationship.';
  openModal('relation-modal');
}

function findRelationship() {
  const id1 = $('rel-person1').value, id2 = $('rel-person2').value;
  if (!id1 || !id2) { $('rel-result').textContent = 'Please select both members.'; return; }
  if (id1 === id2) { $('rel-result').textContent = 'Same person selected!'; return; }
  const fam = activeFamily(); if (!fam) return;

  // BFS to find path
  function getAncestors(id) {
    const anc = new Map(); // id -> generation distance
    const queue = [[id, 0]];
    const visited = new Set();
    while (queue.length) {
      const [cur, d] = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur); anc.set(cur, d);
      const m = fam.members[cur];
      if (!m) continue;
      if (m.parentId) queue.push([m.parentId, d+1]);
      if (m.parentId2) queue.push([m.parentId2, d+1]);
    }
    return anc;
  }

  const anc1 = getAncestors(id1);
  const anc2 = getAncestors(id2);

  // Direct parent/child?
  const m1 = fam.members[id1], m2 = fam.members[id2];

  if (m1.spouseId===id2||m2.spouseId===id1) {
    $('rel-result').textContent = `💍 ${m1.name} and ${m2.name} are spouses.`; return;
  }
  if (m1.parentId===id2||m1.parentId2===id2) {
    $('rel-result').textContent = `👨‍👧 ${m2.name} is a parent of ${m1.name}.`; return;
  }
  if (m2.parentId===id1||m2.parentId2===id1) {
    $('rel-result').textContent = `👨‍👧 ${m1.name} is a parent of ${m2.name}.`; return;
  }

  // Find LCA
  let lca = null, d1=Infinity, d2=Infinity;
  for (const [a, da] of anc1) {
    if (anc2.has(a)) {
      const db = anc2.get(a);
      if (da+db < d1+d2) { lca=a; d1=da; d2=db; }
    }
  }

  if (!lca) {
    $('rel-result').textContent = `No known relationship found between ${m1.name} and ${m2.name}.`;
    return;
  }

  const lcaName = fam.members[lca]?.name || 'common ancestor';
  let rel = '';
  if (d1===0) rel = `${m1.name} is an ancestor of ${m2.name} (${d2} generation${d2>1?'s':''} up)`;
  else if (d2===0) rel = `${m2.name} is an ancestor of ${m1.name} (${d1} generation${d1>1?'s':''} up)`;
  else if (d1===1&&d2===1) rel = `${m1.name} and ${m2.name} are siblings (common parent: ${lcaName})`;
  else if (d1===1&&d2===2) rel = `${m1.name} is an uncle/aunt of ${m2.name}`;
  else if (d1===2&&d2===1) rel = `${m2.name} is an uncle/aunt of ${m1.name}`;
  else if (d1===2&&d2===2) rel = `${m1.name} and ${m2.name} are first cousins (common grandparent: ${lcaName})`;
  else if (d1===3&&d2===3) rel = `${m1.name} and ${m2.name} are second cousins`;
  else {
    const removedTimes = Math.abs(d1-d2);
    const cousinLevel = Math.min(d1,d2)-1;
    if (cousinLevel>0) rel = `${m1.name} and ${m2.name} are ${cousinLevel===1?'first':cousinLevel===2?'second':'third'} cousins${removedTimes>0?` ${removedTimes}x removed`:''} (common ancestor: ${lcaName})`;
    else rel = `${m1.name} and ${m2.name} are related through ${lcaName} (${d1} and ${d2} generations apart)`;
  }
  $('rel-result').textContent = '🔗 ' + rel;
}

/* ──────────────────────────────────────────────────────────────
   16. MINI CHART (sub-tree)
────────────────────────────────────────────────────────────── */
function openMiniChart(rootId) {
  const fam = activeFamily(); if (!fam) return;
  const root = fam.members[rootId]; if (!root) return;

  const overlay = $('mini-chart-overlay');
  $('mini-chart-title').textContent = `🌳 ${root.name}'s Family Tree`;
  overlay.classList.add('open');

  // Gather descendants
  function getDescendants(id, visited=new Set()) {
    if (visited.has(id)) return visited;
    visited.add(id);
    const children = Object.values(fam.members).filter(m=>m.parentId===id||m.parentId2===id);
    children.forEach(c=>getDescendants(c.id, visited));
    return visited;
  }
  const ids = getDescendants(rootId);
  if (root.spouseId && fam.members[root.spouseId]) ids.add(root.spouseId);

  const miniMembers = [...ids].map(id=>fam.members[id]).filter(Boolean);
  renderMiniChart(miniMembers, rootId);
}

function renderMiniChart(members, rootId) {
  d3.select('#mini-chart-svg').selectAll('*').remove();
  const svgEl = $('mini-chart-svg');
  const W = svgEl.clientWidth||800, H = svgEl.clientHeight||500;

  const svg = d3.select('#mini-chart-svg');
  const g = svg.append('g');

  const zoom = d3.zoom().scaleExtent([0.2,3]).on('zoom',e=>g.attr('transform',e.transform));
  svg.call(zoom);

  // Simple layout
  const genMap = {};
  function assignG(id, gn, vis=new Set()) {
    if (vis.has(id)) return; vis.add(id);
    genMap[id] = gn;
    members.filter(m=>m.parentId===id||m.parentId2===id).forEach(c=>assignG(c.id,gn+1,vis));
  }
  assignG(rootId, 0);
  members.forEach(m=>{ if(genMap[m.id]===undefined) genMap[m.id]=0; });

  const byG = {};
  members.forEach(m=>{ const g=genMap[m.id]??0; if(!byG[g])byG[g]=[]; byG[g].push(m); });

  const nw=130,nh=70,hg=30,vg=100;
  const pos={};
  Object.keys(byG).sort((a,b)=>+a-+b).forEach(gn=>{
    const row=byG[gn];
    const rw=row.length*(nw+hg)-hg;
    row.forEach((m,i)=>{ pos[m.id]={x:i*(nw+hg)-rw/2+nw/2,y:+gn*(nh+vg)}; });
  });

  // Links
  members.forEach(m=>{
    [m.parentId,m.parentId2].forEach(pid=>{
      if(!pid||!pos[pid]||!pos[m.id]) return;
      const s=pos[pid],t=pos[m.id];
      const my=(s.y+nh/2+t.y-nh/2)/2;
      g.append('path').attr('fill','none').attr('stroke','rgba(255,255,255,0.2)').attr('stroke-width',1.5)
        .attr('d',`M${s.x},${s.y+nh/2} C${s.x},${my} ${t.x},${my} ${t.x},${t.y-nh/2}`);
    });
  });

  // Nodes
  const nodes = g.selectAll('.mn').data(members).enter().append('g')
    .attr('transform',m=>`translate(${pos[m.id]?.x??0},${pos[m.id]?.y??0})`)
    .style('cursor','pointer')
    .on('click',(_,m)=>{ closeMiniChart(); openDetailPanel(m.id); });

  nodes.append('rect')
    .attr('x',-nw/2).attr('y',-nh/2).attr('width',nw).attr('height',nh).attr('rx',10)
    .attr('fill',m=>getGenderGrad(m.gender)).attr('stroke',m=>m.id===rootId?'#7c3aed':'rgba(255,255,255,0.1)').attr('stroke-width',m=>m.id===rootId?2:1);

  nodes.append('image').attr('x',-nw/2+6).attr('y',-18).attr('width',36).attr('height',36)
    .attr('href',m=>m.photo||DEFAULT_AVATAR).attr('clip-path','none');

  nodes.append('text').attr('x',-nw/2+50).attr('y',-6).attr('font-size','10').attr('font-weight','700').attr('fill','#f1f5f9')
    .text(m=>m.name.length>14?m.name.slice(0,13)+'…':m.name);
  nodes.append('text').attr('x',-nw/2+50).attr('y',8).attr('font-size','8.5').attr('fill','#94a3b8')
    .text(m=>m.dob?`b. ${m.dob.slice(0,4)}`:'');

  svg.transition().call(zoom.transform, d3.zoomIdentity.translate(W/2, H/6).scale(0.9));
}

function closeMiniChart() { $('mini-chart-overlay').classList.remove('open'); }

/* ──────────────────────────────────────────────────────────────
   17. SEARCH
────────────────────────────────────────────────────────────── */
let _searchTimer = null;
function handleSearch(query) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(()=>{
    const q = query.trim().toLowerCase();
    const results = $('search-results');
    if (!q) { results.innerHTML=''; results.style.display='none'; return; }
    const fam = activeFamily(); if (!fam) return;
    const matches = Object.values(fam.members).filter(m=>{
      const loc = [m.city,m.state,m.country].join(' ').toLowerCase();
      return m.name.toLowerCase().includes(q) || loc.includes(q);
    }).slice(0,8);
    if (!matches.length) { results.innerHTML='<div style="padding:12px;color:var(--text2);font-size:.8rem;text-align:center">No results</div>'; results.style.display='block'; return; }
    results.innerHTML = matches.map(m=>`
      <div class="search-item" onclick="selectMember('${m.id}');$('search-results').style.display='none';$('search-input').value='${esc(m.name)}'">
        <img class="search-item-avatar" src="${m.photo||DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}'" alt="${esc(m.name)}">
        <div class="search-item-info">
          <div style="font-weight:600;font-size:.83rem">${esc(m.name)}</div>
          <div style="font-size:.7rem;color:var(--text2)">${m.gender} ${m.dob?'· b.'+m.dob.slice(0,4):''} ${m.city?'· '+m.city:''}</div>
        </div>
      </div>
    `).join('');
    results.style.display='block';
  }, 200);
}

/* ──────────────────────────────────────────────────────────────
   18. SIDEBAR
────────────────────────────────────────────────────────────── */
function renderSidebarList() {
  const fam = activeFamily();
  const listEl = $('member-list-container');
  if (!fam || !Object.keys(fam.members).length) {
    listEl.innerHTML='<p style="color:var(--text2);font-size:.8rem;text-align:center;padding:20px">No members yet.<br>Add the first member!</p>';
    return;
  }
  const filter = $('sidebar-filter')?.value?.toLowerCase()||'';
  let members = Object.values(fam.members);
  if (filter) members = members.filter(m=>m.name.toLowerCase().includes(filter)||[m.city,m.state,m.country].join(' ').toLowerCase().includes(filter));
  members.sort((a,b)=>a.name.localeCompare(b.name));

  listEl.innerHTML = members.map(m=>`
    <div class="member-list-item ${m.id===State.selectedMemberId?'selected':''}" data-id="${m.id}"
      onclick="selectMember('${m.id}')" ondblclick="openDetailPanel('${m.id}')">
      <img class="mli-avatar" src="${m.photo||DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}'" alt="${esc(m.name)}">
      <div class="mli-info">
        <div class="mli-name">${esc(m.name)}</div>
        <div class="mli-sub">${m.gender} ${m.dob?'· b.'+m.dob.slice(0,4):''} ${m.dod?'· ✝'+m.dod.slice(0,4):''}</div>
      </div>
      <span class="mli-gen">G${(m.generation??0)+1}</span>
    </div>
  `).join('');
}

function renderStats() {
  const fam = activeFamily();
  const statsEl = $('stats-container');
  if (!fam) { statsEl.innerHTML=''; return; }
  const members = Object.values(fam.members);
  const alive = members.filter(m=>!m.dod).length;
  const gens = members.length ? Math.max(...members.map(m=>m.generation??0))+1 : 0;
  const upcomingBdays = members.filter(m=>m.dob && !m.dod).map(m=>({name:m.name,days:daysUntilBirthday(m.dob),dob:m.dob}))
    .filter(x=>x.days<=30).sort((a,b)=>a.days-b.days).slice(0,5);

  statsEl.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-val">${members.length}</div><div class="stat-lbl">Total Members</div></div>
      <div class="stat-card"><div class="stat-val">${alive}</div><div class="stat-lbl">Living</div></div>
      <div class="stat-card"><div class="stat-val">${gens}</div><div class="stat-lbl">Generations</div></div>
      <div class="stat-card"><div class="stat-val">${members.length-alive}</div><div class="stat-lbl">Deceased</div></div>
    </div>
    ${upcomingBdays.length?`
    <div style="margin-top:10px">
      <div class="detail-section-title" style="font-size:.7rem;margin-bottom:8px">🎂 Upcoming Birthdays</div>
      ${upcomingBdays.map(x=>`
        <div class="upcoming-item">
          <span class="day-badge">${x.days===0?'Today':x.days+'d'}</span>
          <span>${esc(x.name)}</span>
          <span style="color:var(--text2);margin-left:auto;font-size:.7rem">${formatDate(x.dob).split(',')[0]}</span>
        </div>
      `).join('')}
    </div>`:''}
  `;
}

/* ──────────────────────────────────────────────────────────────
   19. IMPORT / EXPORT
────────────────────────────────────────────────────────────── */
function openExportModal() { openModal('export-modal'); }

function exportJSON() {
  const data = { families: State.families, activeFamilyId: State.activeFamilyId, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  downloadBlob(blob, 'family-tree.json');
  toast('JSON exported!','success');
}

function importJSON() {
  const input = document.createElement('input');
  input.type='file'; input.accept='.json';
  input.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.families) throw new Error('Invalid format');
        pushUndo();
        State.families = data.families;
        State.activeFamilyId = data.activeFamilyId || Object.keys(data.families)[0];
        saveState(); renderAll();
        toast('Family tree imported!','success');
        closeModal('export-modal');
      } catch(err) { toast('Invalid JSON file','error'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportPNG() {
  const svgEl = document.querySelector('#tree-svg');
  if (!svgEl) { toast('No tree to export','error'); return; }
  try {
    const clone = svgEl.cloneNode(true);
    clone.style.background='#0d0d1a';
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);
    const blob = new Blob([svgStr],{type:'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(svgEl.clientWidth,1200);
      canvas.height = Math.max(svgEl.clientHeight,800);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle='#0d0d1a'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      canvas.toBlob(b=>{ downloadBlob(b,'family-tree.png'); toast('PNG exported!','success'); URL.revokeObjectURL(url); });
    };
    img.onerror = ()=>{ toast('Could not render PNG. Try PDF instead.','error'); URL.revokeObjectURL(url); };
    img.src = url;
  } catch(e) { toast('PNG export failed','error'); }
}

function exportPDF() {
  if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    toast('jsPDF not loaded','error'); return;
  }
  const fam = activeFamily(); if (!fam) return;
  const { jsPDF: JPDFClass } = window.jspdf || { jsPDF: window.jsPDF };
  const doc = new JPDFClass({ orientation:'landscape', unit:'mm', format:'a4' });
  const W=297, H=210;

  doc.setFillColor(13,13,26);
  doc.rect(0,0,W,H,'F');
  doc.setTextColor(241,245,249);
  doc.setFontSize(20);
  doc.text(fam.name + ' — Family Tree', W/2, 18, {align:'center'});
  doc.setFontSize(9);
  doc.setTextColor(148,163,184);
  doc.text('Generated: '+new Date().toLocaleDateString(), W/2, 25, {align:'center'});

  const members = Object.values(fam.members);
  const cols = Math.ceil(Math.sqrt(members.length));
  const cardW=45, cardH=28, hGap=6, vGap=8;
  const startX=10, startY=35;

  members.forEach((m,i) => {
    const col=i%cols, row=Math.floor(i/cols);
    const x=startX+col*(cardW+hGap);
    const y=startY+row*(cardH+vGap);
    if (y+cardH > H-10) return;

    // Card background
    const isF=m.gender==='Female', isO=m.gender==='Other';
    doc.setFillColor(isF?95:isO?26:30, isF?30:isO?58:58, isF?74:isO?26:110);
    doc.roundedRect(x,y,cardW,cardH,3,3,'F');
    doc.setDrawColor(255,255,255,30);
    doc.roundedRect(x,y,cardW,cardH,3,3,'S');

    // Name
    doc.setTextColor(241,245,249);
    doc.setFontSize(7);
    doc.setFont(undefined,'bold');
    const displayName=m.name.length>18?m.name.slice(0,17)+'…':m.name;
    doc.text(displayName,x+4,y+8);

    // Details
    doc.setFont(undefined,'normal');
    doc.setTextColor(148,163,184);
    doc.setFontSize(5.5);
    if (m.dob) doc.text(`b. ${m.dob.slice(0,4)}`,x+4,y+13);
    if (m.dod) doc.text(`† ${m.dod.slice(0,4)}`,x+4,y+17);
    const loc=[m.city,m.country].filter(Boolean).join(', ');
    if (loc) doc.text(loc.slice(0,22),x+4,y+21);
    doc.setTextColor(100,100,200);
    doc.text(m.gender,x+cardW-4,y+8,{align:'right'});
  });

  doc.save('family-tree.pdf');
  toast('PDF exported!','success');
}

function saveForGitHub() {
  const fam = activeFamily(); if (!fam) return;
  const data = JSON.stringify({ families: State.families, activeFamilyId: State.activeFamilyId });
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fam.name)} — Family Tree</title>
<meta name="description" content="Interactive Family Tree">
<script>
window.__FAMILY_DATA__ = ${data};
localStorage.setItem('familyTreeData', JSON.stringify(window.__FAMILY_DATA__));
window.location.href = 'index.html';
<\/script>
</head><body style="background:#0d0d1a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">
<div><h1 style="color:#7c3aed">Loading Family Tree…</h1><p>Redirecting to app…</p></div>
</body></html>`;
  downloadBlob(new Blob([html],{type:'text/html'}), 'family-data-loader.html');
  toast('GitHub-ready HTML generated! Upload this file alongside index.html','success',5000);
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}

/* ──────────────────────────────────────────────────────────────
   20. MODAL HELPERS
────────────────────────────────────────────────────────────── */
function openModal(id) {
  const el=$(id); if(!el) return;
  el.classList.add('open');
  el.addEventListener('click', e=>{ if(e.target===el) closeModal(id); }, {once:true});
}
function closeModal(id) { const el=$(id); if(el) el.classList.remove('open'); }

/* ──────────────────────────────────────────────────────────────
   21. WELCOME / HIDE WELCOME
────────────────────────────────────────────────────────────── */
function showWelcome() { $('welcome-screen').style.display='flex'; }
function hideWelcome() { $('welcome-screen').style.display='none'; }

/* ──────────────────────────────────────────────────────────────
   22. RENDER ALL
────────────────────────────────────────────────────────────── */
function renderAll() {
  renderFamilySelect();
  renderSidebarList();
  renderStats();
  renderTree();
}

/* ──────────────────────────────────────────────────────────────
   23. BACKGROUND PARTICLES
────────────────────────────────────────────────────────────── */
function initParticles() {
  const canvas = $('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W,H,particles=[];
  function resize(){ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; }
  resize(); window.addEventListener('resize',resize);
  for(let i=0;i<60;i++) particles.push({
    x:Math.random()*1920,y:Math.random()*1080,
    vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,
    r:Math.random()*2+1,a:Math.random()
  });
  function animate(){
    ctx.clearRect(0,0,W,H);
    particles.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=W; if(p.x>W)p.x=0;
      if(p.y<0)p.y=H; if(p.y>H)p.y=0;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(124,58,237,${p.a*0.4})`;
      ctx.fill();
    });
    requestAnimationFrame(animate);
  }
  animate();
}

/* ──────────────────────────────────────────────────────────────
   24. SIDEBAR TABS
────────────────────────────────────────────────────────────── */
function switchSidebarTab(tab) {
  $$('.sidebar-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  $('tab-members').style.display = tab==='members'?'block':'none';
  $('tab-stats').style.display = tab==='stats'?'block':'none';
}

/* ──────────────────────────────────────────────────────────────
   25. ZOOM CONTROLS
────────────────────────────────────────────────────────────── */
function zoomIn() { State.svg?.transition().duration(300).call(State.zoom.scaleBy,1.3); }
function zoomOut() { State.svg?.transition().duration(300).call(State.zoom.scaleBy,0.77); }
function zoomReset() { centerTree(); }
function zoomFit() {
  const fam=activeFamily(); if(!fam) return;
  const container=$('chart-area');
  const W=container.clientWidth,H=container.clientHeight;
  State.svg?.transition().duration(600).call(State.zoom.transform,d3.zoomIdentity.translate(W/2,H/6).scale(0.7));
}

/* ──────────────────────────────────────────────────────────────
   26. FILTER
────────────────────────────────────────────────────────────── */
function setFilter(mode) {
  State.filterMode=mode;
  $$('.filter-chip').forEach(el=>el.classList.toggle('active',el.dataset.filter===mode));
  renderTree();
}

/* ──────────────────────────────────────────────────────────────
   27. SAMPLE DATA
────────────────────────────────────────────────────────────── */
function loadSampleData() {
  if (!confirm('Load sample family data? This will add to the current family.')) return;
  const fam=activeFamily(); if (!fam) return;
  pushUndo();
  const gp1=uid(),gp2=uid(),gm1=uid(),gm2=uid(),p1=uid(),p2=uid(),c1=uid(),c2=uid(),c3=uid(),sp=uid();
  const now=Date.now().toString(36);
  const members={
    [gp1]:{id:gp1,name:'William Anderson',gender:'Male',dob:'1940-03-15',dod:'2010-07-22',photo:DEFAULT_AVATAR,spouseId:gm1,marriageDate:'1963-06-10',parentId:'',parentId2:'',country:'United States',state:'California',city:'Los Angeles',notes:'Founder of the Anderson family. Served in the military.',generation:0,x:0,y:0,isAdopted:false,biologicalParentId:'',biologicalParentId2:''},
    [gm1]:{id:gm1,name:'Eleanor Anderson',gender:'Female',dob:'1942-08-20',dod:'',photo:DEFAULT_AVATAR,spouseId:gp1,marriageDate:'1963-06-10',parentId:'',parentId2:'',country:'United States',state:'California',city:'Los Angeles',notes:'Loving grandmother and excellent cook.',generation:0,x:0,y:0,isAdopted:false,biologicalParentId:'',biologicalParentId2:''},
    [gp2]:{id:gp2,name:'Robert Johnson',gender:'Male',dob:'1938-11-05',dod:'2015-02-14',photo:DEFAULT_AVATAR,spouseId:gm2,marriageDate:'1961-09-03',parentId:'',parentId2:'',country:'United States',state:'New York',city:'Brooklyn',notes:'A kind man who loved woodworking.',generation:0,x:0,y:0,isAdopted:false,biologicalParentId:'',biologicalParentId2:''},
    [gm2]:{id:gm2,name:'Margaret Johnson',gender:'Female',dob:'1940-04-12',dod:'',photo:DEFAULT_AVATAR,spouseId:gp2,marriageDate:'1961-09-03',parentId:'',parentId2:'',country:'United States',state:'New York',city:'Brooklyn',notes:'Teacher and community leader.',generation:0,x:0,y:0,isAdopted:false,biologicalParentId:'',biologicalParentId2:''},
    [p1]:{id:p1,name:'James Anderson',gender:'Male',dob:'1965-05-22',dod:'',photo:DEFAULT_AVATAR,spouseId:p2,marriageDate:'1990-08-15',parentId:gp1,parentId2:gm1,country:'United States',state:'Texas',city:'Austin',notes:'Software engineer and family man.',generation:1,x:0,y:0,isAdopted:false,biologicalParentId:'',biologicalParentId2:''},
    [p2]:{id:p2,name:'Sarah Anderson',gender:'Female',dob:'1968-01-30',dod:'',photo:DEFAULT_AVATAR,spouseId:p1,marriageDate:'1990-08-15',parentId:gp2,parentId2:gm2,country:'United States',state:'Texas',city:'Austin',notes:'Doctor and volunteer.',generation:1,x:0,y:0,isAdopted:false,biologicalParentId:'',biologicalParentId2:''},
    [sp]:{id:sp,name:'Emily Chen',gender:'Female',dob:'1995-09-14',dod:'',photo:DEFAULT_AVATAR,spouseId:c1,marriageDate:'2020-05-10',parentId:'',parentId2:'',country:'China',state:'',city:'Shanghai',notes:'Married into the family in 2020.',generation:2,x:0,y:0,isAdopted:false,biologicalParentId:'',biologicalParentId2:''},
    [c1]:{id:c1,name:'Michael Anderson',gender:'Male',dob:'1992-11-08',dod:'',photo:DEFAULT_AVATAR,spouseId:sp,marriageDate:'2020-05-10',parentId:p1,parentId2:p2,country:'United States',state:'California',city:'San Francisco',notes:'Eldest child, works in finance.',generation:2,x:0,y:0,isAdopted:false,biologicalParentId:'',biologicalParentId2:''},
    [c2]:{id:c2,name:'Olivia Anderson',gender:'Female',dob:'1994-03-25',dod:'',photo:DEFAULT_AVATAR,spouseId:'',marriageDate:'',parentId:p1,parentId2:p2,country:'United States',state:'New York',city:'Manhattan',notes:'Artist and designer.',generation:2,x:0,y:0,isAdopted:false,biologicalParentId:'',biologicalParentId2:''},
    [c3]:{id:c3,name:'Lucas Anderson',gender:'Male',dob:'1998-07-11',dod:'',photo:DEFAULT_AVATAR,spouseId:'',marriageDate:'',parentId:p1,parentId2:p2,country:'United States',state:'Texas',city:'Austin',notes:'Adopted at age 2. Loves music.',generation:2,x:0,y:0,isAdopted:true,biologicalParentId:'',biologicalParentId2:''},
  };
  Object.assign(fam.members, members);
  if (!fam.rootId) fam.rootId = gp1;
  saveState(); renderAll();
  toast('Sample family data loaded!','success');
}

/* ──────────────────────────────────────────────────────────────
   28. SIDEBAR TOGGLE
────────────────────────────────────────────────────────────── */
function toggleSidebar() {
  $('sidebar').classList.toggle('collapsed');
}

/* ──────────────────────────────────────────────────────────────
   29. INIT
────────────────────────────────────────────────────────────── */
function init() {
  // Hide loading
  setTimeout(()=>{
    const ls=$('loading-screen');
    ls.style.opacity='0';
    setTimeout(()=>ls.style.display='none',500);
  },1200);

  // Load or create default family
  if (!loadState() || !Object.keys(State.families).length) {
    createFamily('My Family');
  }
  if (!State.activeFamilyId || !State.families[State.activeFamilyId]) {
    State.activeFamilyId = Object.keys(State.families)[0];
  }

  initSVG();
  initParticles();
  renderAll();
  setTimeout(centerTree, 600);

  // Event listeners
  $('search-input').addEventListener('input', e=>handleSearch(e.target.value));
  document.addEventListener('click',e=>{
    if (!$('search-results').contains(e.target) && e.target!==$('search-input')) {
      $('search-results').style.display='none';
    }
    if (!$('ctx-menu').contains(e.target)) hideCtxMenu();
  });

  $('family-select').addEventListener('change', e=>switchFamily(e.target.value));
  $('sidebar-filter').addEventListener('input', ()=>renderSidebarList());

  // Keyboard shortcuts
  document.addEventListener('keydown', e=>{
    if (e.ctrlKey||e.metaKey) {
      if (e.key==='z'&&!e.shiftKey){e.preventDefault();undo();}
      if ((e.key==='y')||(e.key==='z'&&e.shiftKey)){e.preventDefault();redo();}
      if (e.key==='n'){e.preventDefault();openAddModal();}
      if (e.key==='f'){e.preventDefault();$('search-input').focus();}
    }
    if (e.key==='Escape'){closeDetailPanel();hideCtxMenu();closeMiniChart();}
  });

  updateUndoRedoBtns();
}

document.addEventListener('DOMContentLoaded', init);
