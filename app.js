'use strict';

/* =========================================================
   Stockage 100% local — IndexedDB. Rien ne quitte l'appareil.
   ========================================================= */
const DB_NAME = 'tournage-db';
const DB_VERSION = 3;
let db;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('contacts')) {
        d.createObjectStore('contacts', { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains('notes')) {
        d.createObjectStore('notes', { keyPath: 'date' }); // date = 'YYYY-MM-DD'
      }
      if (!d.objectStoreNames.contains('trips')) {
        const store = d.createObjectStore('trips', { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!d.objectStoreNames.contains('daymeta')) {
        d.createObjectStore('daymeta', { keyPath: 'date' }); // date = 'YYYY-MM-DD'
      }
      if (!d.objectStoreNames.contains('expenses')) {
        const store = d.createObjectStore('expenses', { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!d.objectStoreNames.contains('checklist')) {
        d.createObjectStore('checklist', { keyPath: 'date' }); // date = 'YYYY-MM-DD'
      }
      if (!d.objectStoreNames.contains('places')) {
        d.createObjectStore('places', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}
function idbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function idbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function idbClear(storeName) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* =========================================================
   État en mémoire
   ========================================================= */
let contacts = [];
let notes = [];       // [{date, text}]
let trips = [];       // [{id, date, time, contactId, personName, fromAddress, toAddress, km, notes, status, doneAt, order}]
let dayMetas = [];    // [{date, location, startTime}]
let expenses = [];    // [{id, date, category, amount, note, photo}]
let checklists = [];  // [{date, essence, huile, pneus, proprete}]
let places = [];      // [{id, name, address, category}]
let activeFilter = 'Tous';
let activeFilterCast = 'Tous';
let searchQueryCast = '';
let searchQuery = '';
let editingContactId = null;
let editingTripId = null;
let currentNoteDate = todayStr();
let currentTripsDate = todayStr();

function todayStr(){
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0,10);
}
function uid(){
  return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

const CATEGORIES = ['Comédien','Réalisation','Production','Régie / Transport','Casting','Image','Décor','Costumes','HMC','Son','Électro / Machino','Cascades / SFX','Locations','Craft / Catering','Post-Production','Autre'];

const ICON_PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.5"/><path d="M4.5 20c.7-4 3.5-6.2 7.5-6.2s6.8 2.2 7.5 6.2"/></svg>';
const ICON_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.47 5.13 5.53.8-4 4.03.94 5.6L12 16.4l-4.94 2.66.94-5.6-4-4.03 5.53-.8L12 3.5z"/></svg>';
const ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5h3.2l1.3 4-2 1.4a11.5 11.5 0 0 0 5.6 5.6l1.4-2 4 1.3V18a1.5 1.5 0 0 1-1.6 1.5C10.6 19 5 13.4 4.5 6.6 4.4 5.5 5 4.5 5 4.5z"/></svg>';
const ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4.5 7l7.5 6 7.5-6"/></svg>';
const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.7-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.3-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>';
const ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 1 3.2 6.4L4 19.5l1.1-3A7.96 7.96 0 0 1 4 12z"/></svg>';

/* =========================================================
   Init
   ========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  await openDB();
  contacts = await idbGetAll('contacts');
  notes = await idbGetAll('notes');
  trips = await idbGetAll('trips');
  dayMetas = await idbGetAll('daymeta');
  expenses = await idbGetAll('expenses');
  checklists = await idbGetAll('checklist');
  places = await idbGetAll('places');

  renderChips();
  renderContacts();
  renderChipsCast();
  renderCastList();
  initNotesView();
  initTripsView();
  initExpensesView();
  bindEvents();
  bindTabs();
  bindModal();
  bindTripModal();
  bindSettings();
  bindCallSheet();
  bindContactDetail();
  bindPlaces();
  renderPlacesList();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' })
      .then(reg => reg.update().catch(()=>{}))
      .catch(()=>{});
    let reloadedForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    });
  }
});

/* =========================================================
   Onglets
   ========================================================= */
let currentView = 'contacts';

function bindTabs(){
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function switchView(view){
  currentView = view;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.hidden = true);
  document.getElementById('view-' + view).hidden = false;
  document.getElementById('fab').hidden = !(view === 'contacts' || view === 'cast' || view === 'trips' || view === 'expenses');
  const titles = { contacts: 'Crew List', cast: 'Comédiens', trips: 'Trajets', expenses: 'Notes de frais', notes: 'Notes du jour', settings: 'Réglages' };
  document.getElementById('topbarTitle').textContent = titles[view];
  if (view === 'trips') {
    document.getElementById('tripDateInput').value = currentTripsDate;
    renderTripsView();
  }
  if (view === 'expenses') {
    document.getElementById('expenseDateInput').value = currentTripsDate;
    renderExpensesView();
  }
}

/* =========================================================
   Liste des contacts (Crew List + Comédiens)
   ========================================================= */
const CREW_CATEGORIES = CATEGORIES.filter(c => c !== 'Comédien');

function renderChips(){
  const row = document.getElementById('chipRow');
  const cats = ['Tous', 'Favoris', ...CREW_CATEGORIES];
  row.innerHTML = '';
  cats.forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (cat === activeFilter ? ' active' : '');
    chip.textContent = cat;
    chip.addEventListener('click', () => {
      activeFilter = cat;
      renderChips();
      renderContacts();
    });
    row.appendChild(chip);
  });
}

function renderChipsCast(){
  const row = document.getElementById('chipRowCast');
  const cats = ['Tous', 'Favoris'];
  row.innerHTML = '';
  cats.forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (cat === activeFilterCast ? ' active' : '');
    chip.textContent = cat;
    chip.addEventListener('click', () => {
      activeFilterCast = cat;
      renderChipsCast();
      renderCastList();
    });
    row.appendChild(chip);
  });
}

function searchMatch(c, q){
  return (c.name || '').toLowerCase().includes(q) ||
    (c.character || '').toLowerCase().includes(q) ||
    (c.category || '').toLowerCase().includes(q) ||
    (c.phone || '').toLowerCase().includes(q) ||
    (c.notes || '').toLowerCase().includes(q);
}

function sortContacts(list){
  return list.sort((a, b) => {
    if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1;
    return (a.name || '').localeCompare(b.name || '', 'fr');
  });
}

function filteredContacts(){
  let list = contacts.filter(c => c.category !== 'Comédien');
  if (activeFilter === 'Favoris') {
    list = list.filter(c => c.favorite);
  } else if (activeFilter !== 'Tous') {
    list = list.filter(c => c.category === activeFilter);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(c => searchMatch(c, q));
  }
  return sortContacts(list);
}

function filteredCast(){
  let list = contacts.filter(c => c.category === 'Comédien');
  if (activeFilterCast === 'Favoris') {
    list = list.filter(c => c.favorite);
  }
  if (searchQueryCast.trim()) {
    const q = searchQueryCast.trim().toLowerCase();
    list = list.filter(c => searchMatch(c, q));
  }
  return sortContacts(list);
}

function buildContactCard(c){
  const card = document.createElement('div');
  card.className = 'contact-card';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (c.photo) {
    const img = document.createElement('img');
    img.src = c.photo;
    avatar.appendChild(img);
  } else {
    avatar.innerHTML = c.category === 'Comédien' ? ICON_STAR : ICON_PERSON;
  }

  const main = document.createElement('div');
  main.className = 'contact-main';
  const nameRow = document.createElement('div');
  nameRow.className = 'contact-name-row';
  const nameEl = document.createElement('span');
  nameEl.className = 'contact-name';
  nameEl.textContent = c.name;
  nameRow.appendChild(nameEl);
  if (c.favorite) {
    const star = document.createElement('span');
    star.className = 'contact-star';
    star.textContent = '⭐';
    nameRow.appendChild(star);
  }
  main.appendChild(nameRow);

  const sub = document.createElement('div');
  sub.className = 'contact-sub';
  if (c.category === 'Comédien' && c.character) {
    sub.textContent = c.character;
  } else {
    const jobTitle = c.notes ? c.notes.split(' — ')[0] : '';
    sub.textContent = jobTitle && c.phone ? `${jobTitle} · ${c.phone}` : (jobTitle || c.phone || '');
  }
  main.appendChild(sub);

  const tag = document.createElement('div');
  tag.className = 'contact-tag';
  tag.textContent = c.category || '';
  main.appendChild(tag);

  main.addEventListener('click', () => openContactDetail(c.id));

  const callBtn = document.createElement('button');
  callBtn.type = 'button';
  callBtn.className = 'call-btn' + (c.phone ? ' enabled' : '');
  callBtn.innerHTML = ICON_PHONE;
  callBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (c.phone) openCallSheet(c.name, c.phone);
  });

  card.appendChild(avatar);
  card.appendChild(main);
  card.appendChild(callBtn);
  return card;
}

/* ---- Feuille de choix Appel / WhatsApp ---- */
function phoneToWhatsAppDigits(phone){
  let digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return '33' + digits.slice(1);
  return digits;
}

function openCallSheet(name, phone){
  document.getElementById('callSheetName').textContent = name;
  document.getElementById('callSheetPhone').textContent = phone;
  document.getElementById('callSheetCallBtn').href = 'tel:' + phone.replace(/\s+/g, '');
  document.getElementById('callSheetWhatsAppBtn').href = 'https://wa.me/' + phoneToWhatsAppDigits(phone);
  document.getElementById('callSheet').hidden = false;
}

function closeCallSheet(){
  document.getElementById('callSheet').hidden = true;
}

function bindCallSheet(){
  document.getElementById('callSheet').addEventListener('click', e => {
    if (e.target.id === 'callSheet') closeCallSheet();
  });
  document.getElementById('callSheetCancelBtn').addEventListener('click', closeCallSheet);
  document.getElementById('callSheetCallBtn').addEventListener('click', closeCallSheet);
  document.getElementById('callSheetWhatsAppBtn').addEventListener('click', closeCallSheet);
}

function renderContacts(){
  const listEl = document.getElementById('contactList');
  const emptyEl = document.getElementById('emptyContacts');
  const list = filteredContacts();
  const totalCrew = contacts.filter(c => c.category !== 'Comédien').length;

  listEl.innerHTML = '';

  if (totalCrew === 0) {
    listEl.hidden = true;
    emptyEl.hidden = false;
    return;
  }
  listEl.hidden = false;
  emptyEl.hidden = true;

  if (list.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-sub';
    p.style.textAlign = 'center';
    p.style.padding = '30px 0';
    p.textContent = 'Aucun contact ne correspond.';
    listEl.appendChild(p);
    return;
  }

  list.forEach(c => listEl.appendChild(buildContactCard(c)));
}

function renderCastList(){
  const listEl = document.getElementById('contactListCast');
  const emptyEl = document.getElementById('emptyContactsCast');
  const list = filteredCast();
  const totalCast = contacts.filter(c => c.category === 'Comédien').length;

  listEl.innerHTML = '';

  if (totalCast === 0) {
    listEl.hidden = true;
    emptyEl.hidden = false;
    return;
  }
  listEl.hidden = false;
  emptyEl.hidden = true;

  if (list.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-sub';
    p.style.textAlign = 'center';
    p.style.padding = '30px 0';
    p.textContent = 'Aucun comédien ne correspond.';
    listEl.appendChild(p);
    return;
  }

  list.forEach(c => listEl.appendChild(buildContactCard(c)));
}

function bindEvents(){
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderContacts();
  });
  document.getElementById('searchInputCast').addEventListener('input', e => {
    searchQueryCast = e.target.value;
    renderCastList();
  });
  document.getElementById('fab').addEventListener('click', () => {
    if (currentView === 'trips') openTripModal(null);
    else if (currentView === 'expenses') openExpenseModal(null);
    else if (currentView === 'cast') openContactModal(null, 'Comédien');
    else openContactModal(null, 'Production');
  });
}

/* =========================================================
   Modal contact
   ========================================================= */
let currentPhotoDataUrl = null;

function bindModal(){
  document.getElementById('closeModalBtn').addEventListener('click', closeContactModal);
  document.getElementById('contactModal').addEventListener('click', e => {
    if (e.target.id === 'contactModal') closeContactModal();
  });

  document.getElementById('fieldCategory').addEventListener('change', updateCategoryFieldsVisibility);

  document.getElementById('photoInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    currentPhotoDataUrl = await resizeImageToDataUrl(file, 240);
    updatePhotoPreview();
  });
  document.getElementById('removePhotoBtn').addEventListener('click', () => {
    currentPhotoDataUrl = null;
    updatePhotoPreview();
  });

  document.getElementById('deleteContactBtn').addEventListener('click', async () => {
    if (!editingContactId) return;
    if (!confirm('Supprimer ce contact ?')) return;
    await idbDelete('contacts', editingContactId);
    contacts = contacts.filter(c => c.id !== editingContactId);
    closeContactModal();
    renderContacts();
    renderCastList();
  });

  document.getElementById('contactForm').addEventListener('submit', async e => {
    e.preventDefault();
    await saveContactFromForm();
  });
}

function updatePhotoPreview(){
  const preview = document.getElementById('photoPreview');
  const removeBtn = document.getElementById('removePhotoBtn');
  if (currentPhotoDataUrl) {
    preview.innerHTML = `<img src="${currentPhotoDataUrl}">`;
    removeBtn.hidden = false;
  } else {
    preview.innerHTML = ICON_PERSON;
    removeBtn.hidden = true;
  }
}

function resizeImageToDataUrl(file, maxSize){
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function updateCategoryFieldsVisibility(){
  const cat = document.getElementById('fieldCategory').value;
  const isComedien = cat === 'Comédien';
  document.getElementById('comedienFields').hidden = !isComedien;
  document.getElementById('genericNotesWrap').hidden = isComedien;
}

/* ---- Fiche détail (lecture seule) ---- */
function escapeHtml(str){
  return (str || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function extractEmail(text){
  const m = (text || '').match(/[^\s—]+@[^\s—]+\.[^\s—]+/);
  return m ? m[0].replace(/[.,;]+$/, '') : null;
}

let detailContactId = null;

function bindContactDetail(){
  document.getElementById('closeDetailBtn').addEventListener('click', closeContactDetail);
  document.getElementById('contactDetailModal').addEventListener('click', e => {
    if (e.target.id === 'contactDetailModal') closeContactDetail();
  });
  document.getElementById('editFromDetailBtn').addEventListener('click', () => {
    const id = detailContactId;
    closeContactDetail();
    openContactModal(id);
  });
}

function openContactDetail(id){
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  detailContactId = id;

  const email = extractEmail(c.notes);
  const jobTitle = (!c.character && c.notes) ? c.notes.split(' — ')[0] : '';
  const notesWithoutEmail = (c.notes || '')
    .split(' — ')
    .filter(part => part !== email && part !== jobTitle)
    .join(' — ');

  const body = document.getElementById('detailBody');
  let html = '';

  html += '<div class="detail-header">';
  html += '<div class="detail-avatar">' + (c.photo ? `<img src="${c.photo}">` : (c.category === 'Comédien' ? ICON_STAR : ICON_PERSON)) + '</div>';
  html += '<div>';
  html += `<div class="detail-name">${escapeHtml(c.name)}${c.favorite ? '<span class="contact-star">⭐</span>' : ''}</div>`;
  if (c.character) html += `<div class="detail-sub">${escapeHtml(c.character)}</div>`;
  else if (jobTitle) html += `<div class="detail-sub">${escapeHtml(jobTitle)}</div>`;
  html += `<div class="detail-tag">${escapeHtml(c.category || '')}</div>`;
  html += '</div></div>';

  if (c.phone || email) {
    html += '<div class="detail-actions">';
    if (c.phone) {
      html += `<button type="button" class="detail-action" id="detailCallAction">${ICON_PHONE}Appeler</button>`;
      html += `<a class="detail-action" href="https://wa.me/${phoneToWhatsAppDigits(c.phone)}" target="_blank" rel="noopener">${ICON_CHAT}WhatsApp</a>`;
    }
    if (email) {
      html += `<a class="detail-action" href="mailto:${email}">${ICON_MAIL}Email</a>`;
    }
    html += '</div>';
  }

  const rows = [];
  if (c.phone) rows.push(['Téléphone', escapeHtml(c.phone)]);
  if (email) rows.push(['Email', `<a href="mailto:${email}">${escapeHtml(email)}</a>`]);
  if (rows.length) {
    html += '<div class="detail-section">' + rows.map(([label, value]) =>
      `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></div>`
    ).join('') + '</div>';
  }

  if (c.category === 'Comédien') {
    const castRows = [];
    if (c.dressing) castRows.push(['Loge', escapeHtml(c.dressing)]);
    if (c.callTime) castRows.push(['Convocation', escapeHtml(c.callTime)]);
    if (c.pickupTime) castRows.push(['Prise en charge', escapeHtml(c.pickupTime)]);
    if (castRows.length) {
      html += '<div class="detail-section">' + castRows.map(([label, value]) =>
        `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></div>`
      ).join('') + '</div>';
    }
    if (c.pickupAddress) {
      html += '<div class="detail-section-title">Adresse de prise en charge</div>';
      html += `<div class="detail-section"><a class="detail-action" style="width:100%;flex-direction:row;justify-content:flex-start" href="https://maps.google.com/?q=${encodeURIComponent(c.pickupAddress)}" target="_blank" rel="noopener">${ICON_PIN}<span style="margin-left:8px">${escapeHtml(c.pickupAddress)}</span></a></div>`;
    }
  }

  if (notesWithoutEmail.trim()) {
    html += '<div class="detail-section-title">Notes</div>';
    html += `<div class="detail-notes">${escapeHtml(notesWithoutEmail)}</div>`;
  }

  body.innerHTML = html;
  const callAction = document.getElementById('detailCallAction');
  if (callAction) callAction.addEventListener('click', () => openCallSheet(c.name, c.phone));

  document.getElementById('contactDetailModal').hidden = false;
}

function closeContactDetail(){
  document.getElementById('contactDetailModal').hidden = true;
  detailContactId = null;
}

function openContactModal(id, defaultCategory){
  editingContactId = id;
  const form = document.getElementById('contactForm');
  form.reset();
  currentPhotoDataUrl = null;

  const modal = document.getElementById('contactModal');
  const title = document.getElementById('modalTitle');
  const deleteBtn = document.getElementById('deleteContactBtn');

  if (id) {
    const c = contacts.find(x => x.id === id);
    title.textContent = 'Modifier le contact';
    deleteBtn.hidden = false;
    document.getElementById('fieldName').value = c.name || '';
    document.getElementById('fieldPhone').value = c.phone || '';
    document.getElementById('fieldCategory').value = c.category || 'Comédien';
    document.getElementById('fieldFavorite').checked = !!c.favorite;
    document.getElementById('fieldCharacter').value = c.character || '';
    document.getElementById('fieldDressing').value = c.dressing || '';
    document.getElementById('fieldCallTime').value = c.callTime || '';
    document.getElementById('fieldPickupAddress').value = c.pickupAddress || '';
    document.getElementById('fieldPickupTime').value = c.pickupTime || '';
    document.getElementById('fieldNotes').value = c.notes || '';
    document.getElementById('fieldNotesGeneric').value = c.notes || '';
    currentPhotoDataUrl = c.photo || null;
  } else {
    title.textContent = 'Nouveau contact';
    deleteBtn.hidden = true;
    document.getElementById('fieldCategory').value = defaultCategory || 'Comédien';
  }
  updatePhotoPreview();
  updateCategoryFieldsVisibility();
  modal.hidden = false;
}

function closeContactModal(){
  document.getElementById('contactModal').hidden = true;
  editingContactId = null;
}

async function saveContactFromForm(){
  const cat = document.getElementById('fieldCategory').value;
  const isComedien = cat === 'Comédien';
  const contact = {
    id: editingContactId || uid(),
    name: document.getElementById('fieldName').value.trim(),
    phone: document.getElementById('fieldPhone').value.trim(),
    category: cat,
    favorite: document.getElementById('fieldFavorite').checked,
    photo: currentPhotoDataUrl,
    character: isComedien ? document.getElementById('fieldCharacter').value.trim() : '',
    dressing: isComedien ? document.getElementById('fieldDressing').value.trim() : '',
    callTime: isComedien ? document.getElementById('fieldCallTime').value : '',
    pickupAddress: isComedien ? document.getElementById('fieldPickupAddress').value.trim() : '',
    pickupTime: isComedien ? document.getElementById('fieldPickupTime').value : '',
    notes: isComedien
      ? document.getElementById('fieldNotes').value.trim()
      : document.getElementById('fieldNotesGeneric').value.trim(),
  };
  if (!contact.name) return;

  await idbPut('contacts', contact);
  const idx = contacts.findIndex(c => c.id === contact.id);
  if (idx >= 0) contacts[idx] = contact; else contacts.push(contact);

  closeContactModal();
  renderContacts();
  renderCastList();
}

/* =========================================================
   Notes du jour
   ========================================================= */
let noteSaveTimer = null;

function initNotesView(){
  const dateInput = document.getElementById('noteDateInput');
  dateInput.value = currentNoteDate;
  dateInput.addEventListener('change', () => {
    currentNoteDate = dateInput.value;
    loadNoteIntoEditor();
    renderNoteHistory();
  });

  document.getElementById('todayBtn').addEventListener('click', () => {
    currentNoteDate = todayStr();
    dateInput.value = currentNoteDate;
    loadNoteIntoEditor();
    renderNoteHistory();
  });

  document.getElementById('noteText').addEventListener('input', () => {
    clearTimeout(noteSaveTimer);
    const indicator = document.getElementById('noteSavedIndicator');
    indicator.textContent = '…';
    noteSaveTimer = setTimeout(saveCurrentNote, 500);
  });

  loadNoteIntoEditor();
  renderNoteHistory();
}

function loadNoteIntoEditor(){
  const n = notes.find(n => n.date === currentNoteDate);
  document.getElementById('noteText').value = n ? n.text : '';
  document.getElementById('noteSavedIndicator').textContent = n ? 'Enregistré' : '';
}

async function saveCurrentNote(){
  const text = document.getElementById('noteText').value;
  const indicator = document.getElementById('noteSavedIndicator');

  if (!text.trim()) {
    await idbDelete('notes', currentNoteDate);
    notes = notes.filter(n => n.date !== currentNoteDate);
    indicator.textContent = '';
    renderNoteHistory();
    return;
  }

  const entry = { date: currentNoteDate, text };
  await idbPut('notes', entry);
  const idx = notes.findIndex(n => n.date === currentNoteDate);
  if (idx >= 0) notes[idx] = entry; else notes.push(entry);
  indicator.textContent = 'Enregistré';
  renderNoteHistory();
}

function renderNoteHistory(){
  const list = document.getElementById('noteHistoryList');
  list.innerHTML = '';
  const sorted = notes.slice().sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-sub';
    p.textContent = 'Aucune note enregistrée pour l\'instant.';
    list.appendChild(p);
    return;
  }

  sorted.forEach(n => {
    const item = document.createElement('div');
    item.className = 'note-history-item' + (n.date === currentNoteDate ? ' selected' : '');
    const dateSpan = document.createElement('span');
    dateSpan.className = 'note-history-date';
    dateSpan.textContent = formatDateFr(n.date);
    const previewSpan = document.createElement('span');
    previewSpan.className = 'note-history-preview';
    previewSpan.textContent = n.text.slice(0, 40);
    item.appendChild(dateSpan);
    item.appendChild(previewSpan);
    item.addEventListener('click', () => {
      currentNoteDate = n.date;
      document.getElementById('noteDateInput').value = n.date;
      loadNoteIntoEditor();
      renderNoteHistory();
    });
    list.appendChild(item);
  });
}

function formatDateFr(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* =========================================================
   Trajets du jour
   ========================================================= */
let dayMetaSaveTimer = null;

function initTripsView(){
  const dateInput = document.getElementById('tripDateInput');
  dateInput.value = currentTripsDate;
  dateInput.addEventListener('change', () => {
    currentTripsDate = dateInput.value;
    renderTripsView();
  });

  document.getElementById('tripTodayBtn').addEventListener('click', () => {
    currentTripsDate = todayStr();
    dateInput.value = currentTripsDate;
    renderTripsView();
  });

  document.getElementById('dayMetaLocation').addEventListener('input', scheduleDayMetaSave);
  document.getElementById('dayMetaStartTime').addEventListener('change', scheduleDayMetaSave);

  document.getElementById('showHistoryBtn').addEventListener('click', () => {
    document.getElementById('view-trips').hidden = true;
    document.getElementById('view-trips-history').hidden = false;
    document.getElementById('fab').hidden = true;
    document.getElementById('topbarTitle').textContent = 'Historique des trajets';
    renderTripHistory();
  });
  document.getElementById('backFromHistoryBtn').addEventListener('click', () => {
    document.getElementById('view-trips-history').hidden = true;
    document.getElementById('view-trips').hidden = false;
    document.getElementById('fab').hidden = false;
    currentView = 'trips';
    document.getElementById('topbarTitle').textContent = 'Trajets';
  });

  bindChecklist();
  renderTripsView();
}

/* ---- Checklist véhicule ---- */
function getChecklist(date){
  return checklists.find(c => c.date === date) || { date, essence: false, huile: false, pneus: false, proprete: false };
}

function bindChecklist(){
  document.querySelectorAll('.checklist-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const entry = { ...getChecklist(currentTripsDate) };
      entry[key] = !entry[key];
      await idbPut('checklist', entry);
      const idx = checklists.findIndex(c => c.date === currentTripsDate);
      if (idx >= 0) checklists[idx] = entry; else checklists.push(entry);
      renderChecklist();
    });
  });
}

function renderChecklist(){
  const entry = getChecklist(currentTripsDate);
  document.querySelectorAll('.checklist-item').forEach(btn => {
    btn.classList.toggle('active', !!entry[btn.dataset.key]);
  });
}

function getDayMeta(date){
  return dayMetas.find(m => m.date === date) || { date, location: '', startTime: '' };
}

function scheduleDayMetaSave(){
  clearTimeout(dayMetaSaveTimer);
  dayMetaSaveTimer = setTimeout(saveDayMeta, 500);
}

async function saveDayMeta(){
  const location = document.getElementById('dayMetaLocation').value.trim();
  const startTime = document.getElementById('dayMetaStartTime').value;
  const entry = { date: currentTripsDate, location, startTime };

  if (!location && !startTime) {
    await idbDelete('daymeta', currentTripsDate);
    dayMetas = dayMetas.filter(m => m.date !== currentTripsDate);
    return;
  }
  await idbPut('daymeta', entry);
  const idx = dayMetas.findIndex(m => m.date === currentTripsDate);
  if (idx >= 0) dayMetas[idx] = entry; else dayMetas.push(entry);
}

function tripsForDate(date){
  return trips
    .filter(t => t.date === date)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function renderTripsView(){
  const dateInput = document.getElementById('tripDateInput');
  if (dateInput.value !== currentTripsDate) dateInput.value = currentTripsDate;

  const meta = getDayMeta(currentTripsDate);
  document.getElementById('dayMetaLocation').value = meta.location || '';
  document.getElementById('dayMetaStartTime').value = meta.startTime || '';
  renderChecklist();

  const list = tripsForDate(currentTripsDate);
  const listEl = document.getElementById('tripList');
  const emptyEl = document.getElementById('emptyTrips');
  listEl.innerHTML = '';

  if (list.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  const nextPendingId = list.find(t => t.status !== 'done')?.id;

  list.forEach(t => {
    const card = document.createElement('div');
    card.className = 'trip-card' + (t.id === nextPendingId ? ' next-trip' : '') + (t.status === 'done' ? ' done' : '');
    card.dataset.tripId = t.id;

    const handle = document.createElement('button');
    handle.className = 'drag-handle';
    handle.type = 'button';
    handle.textContent = '⠿';
    attachDragHandlers(handle, t.id);

    const main = document.createElement('div');
    main.className = 'trip-main';

    const timeRow = document.createElement('div');
    timeRow.className = 'trip-time-row';
    const timeEl = document.createElement('span');
    timeEl.className = 'trip-time';
    timeEl.textContent = t.time || '--:--';
    timeRow.appendChild(timeEl);
    if (t.id === nextPendingId) {
      const badge = document.createElement('span');
      badge.className = 'next-badge';
      badge.textContent = 'Prochain';
      timeRow.appendChild(badge);
    }
    main.appendChild(timeRow);

    const personEl = document.createElement('div');
    personEl.className = 'trip-person';
    personEl.textContent = t.personName || '(sans nom)';
    main.appendChild(personEl);

    if (t.fromAddress || t.toAddress) {
      const routeEl = document.createElement('div');
      routeEl.className = 'trip-route';
      routeEl.textContent = `${t.fromAddress || '?'} → ${t.toAddress || '?'}`;
      main.appendChild(routeEl);
    }

    if (t.km) {
      const kmEl = document.createElement('div');
      kmEl.className = 'trip-km';
      kmEl.textContent = `${t.km} km`;
      main.appendChild(kmEl);
    }

    main.addEventListener('click', () => openTripModal(t.id));

    const statusBtn = document.createElement('button');
    statusBtn.type = 'button';
    statusBtn.className = 'trip-status-btn' + (t.status === 'done' ? ' done' : '');
    statusBtn.textContent = t.status === 'done' ? '✓' : '○';
    statusBtn.title = t.status === 'done' ? 'Marquer à faire' : 'Valider ce trajet';
    statusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTripStatus(t.id);
    });

    card.appendChild(handle);
    card.appendChild(main);
    card.appendChild(statusBtn);
    listEl.appendChild(card);
  });
}

async function toggleTripStatus(id){
  const t = trips.find(x => x.id === id);
  if (!t) return;
  t.status = t.status === 'done' ? 'pending' : 'done';
  t.doneAt = t.status === 'done' ? new Date().toISOString() : null;
  await idbPut('trips', t);
  renderTripsView();
}

/* ---- Réordonnancement par glisser-déposer (pointer events) ---- */
function attachDragHandlers(handleEl, tripId){
  handleEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const listEl = document.getElementById('tripList');
    const rowEl = listEl.querySelector(`[data-trip-id="${tripId}"]`);
    if (!rowEl) return;
    const rows = Array.from(listEl.querySelectorAll('.trip-card'));
    const startY = e.clientY;

    rowEl.classList.add('dragging');
    rowEl.style.position = 'relative';
    rowEl.style.zIndex = '10';
    try { handleEl.setPointerCapture(e.pointerId); } catch (err) {}

    function onMove(ev){
      const deltaY = ev.clientY - startY;
      rowEl.style.transform = `translateY(${deltaY}px)`;
    }

    function onUp(ev){
      handleEl.removeEventListener('pointermove', onMove);
      handleEl.removeEventListener('pointerup', onUp);
      handleEl.removeEventListener('pointercancel', onUp);
      try { handleEl.releasePointerCapture(e.pointerId); } catch (err) {}
      rowEl.classList.remove('dragging');
      rowEl.style.transform = '';
      rowEl.style.zIndex = '';

      const finalY = ev.clientY;
      const others = rows.filter(r => r !== rowEl);
      let targetIndex = rows.length - 1;
      for (let i = 0; i < others.length; i++) {
        const r = others[i].getBoundingClientRect();
        const center = r.top + r.height / 2;
        if (finalY < center) {
          targetIndex = rows.indexOf(others[i]);
          break;
        }
      }
      reorderTrip(tripId, targetIndex);
    }

    handleEl.addEventListener('pointermove', onMove);
    handleEl.addEventListener('pointerup', onUp);
    handleEl.addEventListener('pointercancel', onUp);
  });
}

async function reorderTrip(tripId, targetIndex){
  const list = tripsForDate(currentTripsDate);
  const fromIndex = list.findIndex(t => t.id === tripId);
  if (fromIndex === -1 || fromIndex === targetIndex) return;
  const [item] = list.splice(fromIndex, 1);
  list.splice(targetIndex, 0, item);
  for (let i = 0; i < list.length; i++) {
    list[i].order = i;
    await idbPut('trips', list[i]);
    const idx = trips.findIndex(t => t.id === list[i].id);
    if (idx >= 0) trips[idx] = list[i];
  }
  renderTripsView();
}

/* ---- Modale trajet ---- */
function bindTripModal(){
  document.getElementById('closeTripModalBtn').addEventListener('click', closeTripModal);
  document.getElementById('tripModal').addEventListener('click', e => {
    if (e.target.id === 'tripModal') closeTripModal();
  });

  document.getElementById('tripFieldContact').addEventListener('change', onTripContactChange);

  document.getElementById('deleteTripBtn').addEventListener('click', async () => {
    if (!editingTripId) return;
    if (!confirm('Supprimer ce trajet ?')) return;
    await idbDelete('trips', editingTripId);
    trips = trips.filter(t => t.id !== editingTripId);
    closeTripModal();
    renderTripsView();
  });

  document.getElementById('tripForm').addEventListener('submit', async e => {
    e.preventDefault();
    await saveTripFromForm();
  });
}

function onTripContactChange(){
  const select = document.getElementById('tripFieldContact');
  const freeNameWrap = document.getElementById('tripFreeNameWrap');
  const contactId = select.value;
  freeNameWrap.hidden = !!contactId;

  if (!contactId) return;
  const c = contacts.find(x => x.id === contactId);
  if (!c) return;

  const fromField = document.getElementById('tripFieldFrom');
  const timeField = document.getElementById('tripFieldTime');
  if (!fromField.value && c.pickupAddress) fromField.value = c.pickupAddress;
  if (!timeField.value && c.pickupTime) timeField.value = c.pickupTime;
}

function populateTripContactSelect(selectedContactId){
  const select = document.getElementById('tripFieldContact');
  select.innerHTML = '<option value="">— Personne libre (saisie manuelle) —</option>';
  contacts.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.category})`;
    select.appendChild(opt);
  });
  select.value = selectedContactId || '';
}

function openTripModal(id){
  editingTripId = id;
  const form = document.getElementById('tripForm');
  form.reset();

  const modal = document.getElementById('tripModal');
  const title = document.getElementById('tripModalTitle');
  const deleteBtn = document.getElementById('deleteTripBtn');

  if (id) {
    const t = trips.find(x => x.id === id);
    title.textContent = 'Modifier le trajet';
    deleteBtn.hidden = false;
    populateTripContactSelect(t.contactId);
    document.getElementById('tripFieldTime').value = t.time || '';
    document.getElementById('tripFieldFreeName').value = t.contactId ? '' : (t.personName || '');
    document.getElementById('tripFieldFrom').value = t.fromAddress || '';
    document.getElementById('tripFieldTo').value = t.toAddress || '';
    document.getElementById('tripFieldKm').value = t.km || '';
    document.getElementById('tripFieldNotes').value = t.notes || '';
    document.getElementById('tripFreeNameWrap').hidden = !!t.contactId;
  } else {
    title.textContent = 'Nouveau trajet';
    deleteBtn.hidden = true;
    populateTripContactSelect('');
    document.getElementById('tripFreeNameWrap').hidden = false;
    const meta = getDayMeta(currentTripsDate);
    if (meta.location) document.getElementById('tripFieldTo').value = meta.location;
  }
  modal.hidden = false;
}

function closeTripModal(){
  document.getElementById('tripModal').hidden = true;
  editingTripId = null;
}

async function saveTripFromForm(){
  const contactId = document.getElementById('tripFieldContact').value;
  const contact = contactId ? contacts.find(c => c.id === contactId) : null;
  const freeName = document.getElementById('tripFieldFreeName').value.trim();
  const personName = contact ? contact.name : freeName;
  if (!personName) {
    alert('Indique un nom (choisis un contact ou saisis un nom libre).');
    return;
  }

  const existing = editingTripId ? trips.find(t => t.id === editingTripId) : null;
  const dayList = tripsForDate(currentTripsDate);
  const order = existing ? existing.order : dayList.length;

  const trip = {
    id: editingTripId || uid(),
    date: currentTripsDate,
    time: document.getElementById('tripFieldTime').value,
    contactId: contactId || null,
    personName,
    fromAddress: document.getElementById('tripFieldFrom').value.trim(),
    toAddress: document.getElementById('tripFieldTo').value.trim(),
    km: document.getElementById('tripFieldKm').value ? parseFloat(document.getElementById('tripFieldKm').value) : null,
    notes: document.getElementById('tripFieldNotes').value.trim(),
    status: existing ? existing.status : 'pending',
    doneAt: existing ? existing.doneAt : null,
    order,
  };

  await idbPut('trips', trip);
  const idx = trips.findIndex(t => t.id === trip.id);
  if (idx >= 0) trips[idx] = trip; else trips.push(trip);

  closeTripModal();
  renderTripsView();
}

/* ---- Historique des trajets validés ---- */
function renderTripHistory(){
  const listEl = document.getElementById('tripHistoryList');
  const emptyEl = document.getElementById('emptyHistory');
  const totalEl = document.getElementById('historyTotalKm');
  listEl.innerHTML = '';

  const done = trips
    .filter(t => t.status === 'done')
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));

  if (done.length === 0) {
    emptyEl.hidden = false;
    totalEl.textContent = '';
    return;
  }
  emptyEl.hidden = true;

  const totalKm = done.reduce((sum, t) => sum + (t.km || 0), 0);
  totalEl.textContent = totalKm > 0 ? `${totalKm.toFixed(1)} km au total` : '';

  done.forEach(t => {
    const item = document.createElement('div');
    item.className = 'trip-history-item';

    const dateEl = document.createElement('div');
    dateEl.className = 'trip-history-date';
    dateEl.textContent = `${formatDateFr(t.date)}${t.time ? ' · ' + t.time : ''}`;
    item.appendChild(dateEl);

    const routeEl = document.createElement('div');
    routeEl.className = 'trip-history-route';
    routeEl.textContent = (t.fromAddress || t.toAddress) ? `${t.fromAddress || '?'} → ${t.toAddress || '?'}` : t.personName;
    item.appendChild(routeEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'trip-history-meta';
    const metaParts = [t.personName];
    if (t.km) metaParts.push(`${t.km} km`);
    metaEl.textContent = metaParts.join(' · ');
    item.appendChild(metaEl);

    listEl.appendChild(item);
  });
}

/* =========================================================
   Notes de frais
   ========================================================= */
let editingExpenseId = null;
let currentExpensePhotoDataUrl = null;

function initExpensesView(){
  const dateInput = document.getElementById('expenseDateInput');
  dateInput.value = currentTripsDate;
  dateInput.addEventListener('change', () => {
    currentTripsDate = dateInput.value;
    document.getElementById('tripDateInput').value = currentTripsDate;
    renderExpensesView();
  });

  document.getElementById('expenseTodayBtn').addEventListener('click', () => {
    currentTripsDate = todayStr();
    dateInput.value = currentTripsDate;
    document.getElementById('tripDateInput').value = currentTripsDate;
    renderExpensesView();
  });

  document.getElementById('showExpenseHistoryBtn').addEventListener('click', () => {
    document.getElementById('view-expenses').hidden = true;
    document.getElementById('view-expense-history').hidden = false;
    document.getElementById('fab').hidden = true;
    document.getElementById('topbarTitle').textContent = 'Historique des frais';
    renderExpenseHistory();
  });
  document.getElementById('backFromExpenseHistoryBtn').addEventListener('click', () => {
    document.getElementById('view-expense-history').hidden = true;
    document.getElementById('view-expenses').hidden = false;
    document.getElementById('fab').hidden = false;
    currentView = 'expenses';
    document.getElementById('topbarTitle').textContent = 'Notes de frais';
  });

  bindExpenseModal();
}

function expensesForDate(date){
  return expenses.filter(e => e.date === date).sort((a, b) => (b.id || '').localeCompare(a.id || ''));
}

function renderExpensesView(){
  const list = expensesForDate(currentTripsDate);
  const listEl = document.getElementById('expenseList');
  const emptyEl = document.getElementById('emptyExpenses');
  listEl.innerHTML = '';

  if (list.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  list.forEach(e => listEl.appendChild(buildExpenseCard(e)));
}

function buildExpenseCard(e){
  const card = document.createElement('div');
  card.className = 'expense-card';

  const thumb = document.createElement('div');
  thumb.className = 'expense-thumb';
  if (e.photo) {
    const img = document.createElement('img');
    img.src = e.photo;
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"/><path d="M14 3.5v4h4"/><path d="M8 12.5h8M8 16h5.5"/></svg>';
  }

  const main = document.createElement('div');
  main.className = 'expense-main';
  const cat = document.createElement('div');
  cat.className = 'expense-category';
  cat.textContent = e.category;
  main.appendChild(cat);
  if (e.note) {
    const note = document.createElement('div');
    note.className = 'expense-note';
    note.textContent = e.note;
    main.appendChild(note);
  }

  const amount = document.createElement('div');
  amount.className = 'expense-amount';
  amount.textContent = e.amount ? `${e.amount.toFixed(2)} €` : '';

  card.appendChild(thumb);
  card.appendChild(main);
  card.appendChild(amount);
  card.addEventListener('click', () => openExpenseModal(e.id));
  return card;
}

function bindExpenseModal(){
  document.getElementById('closeExpenseModalBtn').addEventListener('click', closeExpenseModal);
  document.getElementById('expenseModal').addEventListener('click', e => {
    if (e.target.id === 'expenseModal') closeExpenseModal();
  });

  document.getElementById('expensePhotoInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    currentExpensePhotoDataUrl = await resizeImageToDataUrl(file, 500);
    updateExpensePhotoPreview();
  });
  document.getElementById('removeExpensePhotoBtn').addEventListener('click', () => {
    currentExpensePhotoDataUrl = null;
    updateExpensePhotoPreview();
  });

  document.getElementById('deleteExpenseBtn').addEventListener('click', async () => {
    if (!editingExpenseId) return;
    if (!confirm('Supprimer cette dépense ?')) return;
    await idbDelete('expenses', editingExpenseId);
    expenses = expenses.filter(e => e.id !== editingExpenseId);
    closeExpenseModal();
    renderExpensesView();
  });

  document.getElementById('expenseForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    await saveExpenseFromForm();
  });
}

function updateExpensePhotoPreview(){
  const preview = document.getElementById('expensePhotoPreview');
  const removeBtn = document.getElementById('removeExpensePhotoBtn');
  if (currentExpensePhotoDataUrl) {
    preview.innerHTML = `<img src="${currentExpensePhotoDataUrl}">`;
    removeBtn.hidden = false;
  } else {
    preview.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"/><path d="M14 3.5v4h4"/><path d="M8 12.5h8M8 16h5.5"/></svg>';
    removeBtn.hidden = true;
  }
}

function openExpenseModal(id){
  editingExpenseId = id;
  const form = document.getElementById('expenseForm');
  form.reset();
  currentExpensePhotoDataUrl = null;

  const title = document.getElementById('expenseModalTitle');
  const deleteBtn = document.getElementById('deleteExpenseBtn');

  if (id) {
    const e = expenses.find(x => x.id === id);
    title.textContent = 'Modifier la dépense';
    deleteBtn.hidden = false;
    document.getElementById('expenseFieldCategory').value = e.category || 'Autre';
    document.getElementById('expenseFieldAmount').value = e.amount || '';
    document.getElementById('expenseFieldNote').value = e.note || '';
    currentExpensePhotoDataUrl = e.photo || null;
  } else {
    title.textContent = 'Nouvelle dépense';
    deleteBtn.hidden = true;
  }
  updateExpensePhotoPreview();
  document.getElementById('expenseModal').hidden = false;
}

function closeExpenseModal(){
  document.getElementById('expenseModal').hidden = true;
  editingExpenseId = null;
}

async function saveExpenseFromForm(){
  const amountRaw = document.getElementById('expenseFieldAmount').value;
  const expense = {
    id: editingExpenseId || uid(),
    date: currentTripsDate,
    category: document.getElementById('expenseFieldCategory').value,
    amount: amountRaw ? parseFloat(amountRaw) : 0,
    note: document.getElementById('expenseFieldNote').value.trim(),
    photo: currentExpensePhotoDataUrl,
  };

  await idbPut('expenses', expense);
  const idx = expenses.findIndex(e => e.id === expense.id);
  if (idx >= 0) expenses[idx] = expense; else expenses.push(expense);

  closeExpenseModal();
  renderExpensesView();
}

function renderExpenseHistory(){
  const listEl = document.getElementById('expenseHistoryList');
  const emptyEl = document.getElementById('emptyExpenseHistory');
  const totalEl = document.getElementById('expenseHistoryTotal');
  listEl.innerHTML = '';

  const sorted = expenses.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.id || '').localeCompare(a.id || ''));

  if (sorted.length === 0) {
    emptyEl.hidden = false;
    totalEl.textContent = '';
    return;
  }
  emptyEl.hidden = true;

  const total = sorted.reduce((sum, e) => sum + (e.amount || 0), 0);
  totalEl.textContent = total > 0 ? `${total.toFixed(2)} € au total` : '';

  sorted.forEach(e => {
    const item = document.createElement('div');
    item.className = 'trip-history-item';

    const dateEl = document.createElement('div');
    dateEl.className = 'trip-history-date';
    dateEl.textContent = formatDateFr(e.date);
    item.appendChild(dateEl);

    const routeEl = document.createElement('div');
    routeEl.className = 'trip-history-route';
    routeEl.textContent = `${e.category} — ${e.amount ? e.amount.toFixed(2) + ' €' : '0 €'}`;
    item.appendChild(routeEl);

    if (e.note) {
      const metaEl = document.createElement('div');
      metaEl.className = 'trip-history-meta';
      metaEl.textContent = e.note;
      item.appendChild(metaEl);
    }

    listEl.appendChild(item);
  });
}

/* =========================================================
   Lieux fréquents
   ========================================================= */
let editingPlaceId = null;
let activePlacePickerTarget = null;

function bindPlaces(){
  document.getElementById('addPlaceBtn').addEventListener('click', () => openPlaceModal(null));
  document.getElementById('closePlaceModalBtn').addEventListener('click', closePlaceModal);
  document.getElementById('placeModal').addEventListener('click', e => {
    if (e.target.id === 'placeModal') closePlaceModal();
  });
  document.getElementById('deletePlaceBtn').addEventListener('click', async () => {
    if (!editingPlaceId) return;
    if (!confirm('Supprimer ce lieu ?')) return;
    await idbDelete('places', editingPlaceId);
    places = places.filter(p => p.id !== editingPlaceId);
    closePlaceModal();
    renderPlacesList();
  });
  document.getElementById('placeForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    await savePlaceFromForm();
  });

  document.querySelectorAll('.field-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => openPlacePicker(btn.dataset.target));
  });
  document.getElementById('placePickerCancelBtn').addEventListener('click', closePlacePicker);
  document.getElementById('placePickerModal').addEventListener('click', e => {
    if (e.target.id === 'placePickerModal') closePlacePicker();
  });
}

function renderPlacesList(){
  const listEl = document.getElementById('placesList');
  listEl.innerHTML = '';
  if (places.length === 0) return;

  places.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')).forEach(p => {
    const row = document.createElement('div');
    row.className = 'place-row';

    const main = document.createElement('div');
    main.className = 'place-row-main';
    const name = document.createElement('div');
    name.className = 'place-row-name';
    name.textContent = p.name;
    const addr = document.createElement('div');
    addr.className = 'place-row-address';
    addr.textContent = p.address;
    main.appendChild(name);
    main.appendChild(addr);

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'place-row-edit';
    edit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l.9-3.9L16.6 4.4a1.5 1.5 0 0 1 2.1 0l1 1a1.5 1.5 0 0 1 0 2.1L8 19.2 4 20z"/><path d="M14.5 6.5l3 3"/></svg>';

    row.appendChild(main);
    row.appendChild(edit);
    row.addEventListener('click', () => openPlaceModal(p.id));
    listEl.appendChild(row);
  });
}

function openPlaceModal(id){
  editingPlaceId = id;
  const form = document.getElementById('placeForm');
  form.reset();
  const title = document.getElementById('placeModalTitle');
  const deleteBtn = document.getElementById('deletePlaceBtn');

  if (id) {
    const p = places.find(x => x.id === id);
    title.textContent = 'Modifier le lieu';
    deleteBtn.hidden = false;
    document.getElementById('placeFieldName').value = p.name || '';
    document.getElementById('placeFieldAddress').value = p.address || '';
  } else {
    title.textContent = 'Nouveau lieu';
    deleteBtn.hidden = true;
  }
  document.getElementById('placeModal').hidden = false;
}

function closePlaceModal(){
  document.getElementById('placeModal').hidden = true;
  editingPlaceId = null;
}

async function savePlaceFromForm(){
  const name = document.getElementById('placeFieldName').value.trim();
  const address = document.getElementById('placeFieldAddress').value.trim();
  if (!name || !address) return;

  const place = { id: editingPlaceId || uid(), name, address };
  await idbPut('places', place);
  const idx = places.findIndex(p => p.id === place.id);
  if (idx >= 0) places[idx] = place; else places.push(place);

  closePlaceModal();
  renderPlacesList();
}

function openPlacePicker(targetId){
  if (places.length === 0) {
    alert("Aucun lieu enregistré pour l'instant. Ajoute-en un depuis Réglages → Lieux fréquents.");
    return;
  }
  activePlacePickerTarget = targetId;
  const listEl = document.getElementById('placePickerList');
  listEl.innerHTML = '';
  places.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')).forEach(p => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'place-picker-item';
    item.innerHTML = `<div class="place-picker-name">${escapeHtml(p.name)}</div><div class="place-picker-address">${escapeHtml(p.address)}</div>`;
    item.addEventListener('click', () => {
      document.getElementById(activePlacePickerTarget).value = p.address;
      closePlacePicker();
    });
    listEl.appendChild(item);
  });
  document.getElementById('placePickerModal').hidden = false;
}

function closePlacePicker(){
  document.getElementById('placePickerModal').hidden = true;
  activePlacePickerTarget = null;
}

/* =========================================================
   Réglages : export / import / effacement
   ========================================================= */
function bindSettings(){
  document.getElementById('exportBtn').addEventListener('click', exportBackup);
  document.getElementById('importInput').addEventListener('change', importBackup);
  document.getElementById('wipeBtn').addEventListener('click', wipeAllData);
  document.getElementById('exportRecapBtn').addEventListener('click', exportRecap);
}

function exportBackup(){
  const payload = {
    exportedAt: new Date().toISOString(),
    contacts,
    notes,
    trips,
    dayMetas,
    expenses,
    checklists,
    places,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tournage-sauvegarde-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function importBackup(e){
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.contacts) || !Array.isArray(data.notes)) {
      throw new Error('format invalide');
    }
    const tripsData = Array.isArray(data.trips) ? data.trips : [];
    const dayMetasData = Array.isArray(data.dayMetas) ? data.dayMetas : [];
    const expensesData = Array.isArray(data.expenses) ? data.expenses : [];
    const checklistsData = Array.isArray(data.checklists) ? data.checklists : [];
    const placesData = Array.isArray(data.places) ? data.places : [];
    let msg = `Importer ${data.contacts.length} contact(s) et ${data.notes.length} note(s)`;
    if (tripsData.length) msg += ` et ${tripsData.length} trajet(s)`;
    if (expensesData.length) msg += ` et ${expensesData.length} dépense(s)`;
    msg += ' ? Cela fusionnera avec les données existantes.';
    if (!confirm(msg)) {
      e.target.value = '';
      return;
    }
    for (const c of data.contacts) await idbPut('contacts', c);
    for (const n of data.notes) await idbPut('notes', n);
    for (const t of tripsData) await idbPut('trips', t);
    for (const m of dayMetasData) await idbPut('daymeta', m);
    for (const ex of expensesData) await idbPut('expenses', ex);
    for (const cl of checklistsData) await idbPut('checklist', cl);
    for (const pl of placesData) await idbPut('places', pl);
    contacts = await idbGetAll('contacts');
    notes = await idbGetAll('notes');
    trips = await idbGetAll('trips');
    dayMetas = await idbGetAll('daymeta');
    expenses = await idbGetAll('expenses');
    checklists = await idbGetAll('checklist');
    places = await idbGetAll('places');
    renderContacts();
    renderCastList();
    renderNoteHistory();
    renderTripsView();
    renderPlacesList();
    alert('Import réussi.');
  } catch (err) {
    alert('Le fichier de sauvegarde est invalide.');
  }
  e.target.value = '';
}

async function wipeAllData(){
  if (!confirm('Effacer définitivement tous les contacts, notes, trajets, frais et lieux de cet appareil ? Cette action est irréversible.')) return;
  if (!confirm('Dernière confirmation : tout supprimer ?')) return;
  await idbClear('contacts');
  await idbClear('notes');
  await idbClear('trips');
  await idbClear('daymeta');
  await idbClear('expenses');
  await idbClear('checklist');
  await idbClear('places');
  contacts = [];
  notes = [];
  trips = [];
  dayMetas = [];
  expenses = [];
  checklists = [];
  places = [];
  renderContacts();
  renderCastList();
  loadNoteIntoEditor();
  renderNoteHistory();
  renderTripsView();
  renderPlacesList();
  alert('Toutes les données ont été effacées.');
}

/* =========================================================
   Export récapitulatif (PDF via impression)
   ========================================================= */
function buildPrintRecap(){
  const doneTrips = trips
    .filter(t => t.status === 'done')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  const sortedExpenses = expenses.slice().sort((a, b) => a.date.localeCompare(b.date));

  const totalKm = doneTrips.reduce((sum, t) => sum + (t.km || 0), 0);
  const totalExpenses = sortedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  let html = '<h1>Récapitulatif de tournage</h1>';
  html += `<div class="recap-sub">Généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>`;

  html += '<h2>Trajets validés</h2>';
  if (doneTrips.length === 0) {
    html += '<p class="recap-empty">Aucun trajet validé.</p>';
  } else {
    html += '<table><thead><tr><th>Date</th><th>Heure</th><th>Personne</th><th>Trajet</th><th>Km</th></tr></thead><tbody>';
    doneTrips.forEach(t => {
      html += `<tr><td>${escapeHtml(formatDateFr(t.date))}</td><td>${escapeHtml(t.time || '')}</td><td>${escapeHtml(t.personName || '')}</td><td>${escapeHtml(t.fromAddress || '?')} → ${escapeHtml(t.toAddress || '?')}</td><td>${t.km || ''}</td></tr>`;
    });
    html += '</tbody></table>';
    html += `<div class="recap-total">Total : ${totalKm.toFixed(1)} km</div>`;
  }

  html += '<h2>Notes de frais</h2>';
  if (sortedExpenses.length === 0) {
    html += '<p class="recap-empty">Aucune dépense enregistrée.</p>';
  } else {
    html += '<table><thead><tr><th>Date</th><th>Catégorie</th><th>Note</th><th>Montant</th></tr></thead><tbody>';
    sortedExpenses.forEach(e => {
      html += `<tr><td>${escapeHtml(formatDateFr(e.date))}</td><td>${escapeHtml(e.category || '')}</td><td>${escapeHtml(e.note || '')}</td><td>${(e.amount || 0).toFixed(2)} €</td></tr>`;
    });
    html += '</tbody></table>';
    html += `<div class="recap-total">Total : ${totalExpenses.toFixed(2)} €</div>`;
  }

  document.getElementById('printRecap').innerHTML = html;
}

function exportRecap(){
  buildPrintRecap();
  window.print();
}
