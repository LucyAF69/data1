/*! Naam Japa Counter 1.1.1 */
(function () {
	'use strict';

	var root = document.querySelector('[data-njc-root]');
	if (!root || root.getAttribute('data-njc-ready')) { return; }
	root.setAttribute('data-njc-ready', '1');

	var KEY = 'njc_v1';
	var TARGETS = [11, 21, 54, 108, 216, 540, 1008];
	var PRESETS = [
		{ name: 'Radha', native: '\u0930\u093e\u0927\u093e' },
		{ name: 'Ram', native: '\u0930\u093e\u092e' },
		{ name: 'Krishna', native: '\u0915\u0943\u0937\u094d\u0923' },
		{ name: 'Hari Bol', native: '\u0939\u0930\u093f \u092c\u094b\u0932' },
		{ name: 'Hare Krishna', native: '\u0939\u0930\u0947 \u0915\u0943\u0937\u094d\u0923' },
		{ name: 'Om Namah Shivaya', native: '\u0950 \u0928\u092e\u0903 \u0936\u093f\u0935\u093e\u092f' },
		{ name: 'Durga', native: '\u0926\u0941\u0930\u094d\u0917\u093e' },
		{ name: 'Hanuman', native: '\u0939\u0928\u0941\u092e\u093e\u0928' }
	];
	var DEFAULT_NAME = 'Naam Jap';
	var DEFAULT_NATIVE = '\u0928\u093e\u092e \u091c\u092a';
	var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
	var SVGNS = 'http://www.w3.org/2000/svg';
	var nf;
	try { nf = new Intl.NumberFormat('en-IN'); } catch (e) { nf = { format: function (n) { return String(n); } }; }

	var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
	var canAnimate = !reduceMotion && typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';

	/* ------------------------------------------------------------ helpers */

	function pad(n) { return n < 10 ? '0' + n : String(n); }

	function dayKey(d) {
		d = d || new Date();
		return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
	}

	function uid() {
		return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	}

	function toInt(v, min, max, fallback) {
		v = parseInt(v, 10);
		if (isNaN(v)) { return fallback; }
		return Math.min(max, Math.max(min, v));
	}

	function cleanName(s) {
		return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, 40);
	}

	// padded, lower-case, punctuation-free text so whole words can be matched with indexOf
	function normText(s) {
		return ' ' + String(s == null ? '' : s).toLowerCase().replace(/[\s\-_.,!?:;()\[\]{}"'\/\\|]+/g, ' ').replace(/^\s+|\s+$/g, '') + ' ';
	}

	function nativeFor(name) {
		var n = String(name).toLowerCase();
		if (n === DEFAULT_NAME.toLowerCase()) { return DEFAULT_NATIVE; }
		for (var i = 0; i < PRESETS.length; i++) {
			if (PRESETS[i].name.toLowerCase() === n) { return PRESETS[i].native; }
		}
		return '';
	}

	function labelOf(m) { return m.native || m.name; }

	/* -------------------------------------------------------------- state */

	function newMantra(name, target) {
		return { id: uid(), name: name, native: nativeFor(name), target: target || 108, count: 0, rounds: 0, total: 0, days: {}, undo: [] };
	}

	function defaultPrefs() {
		return { sound: true, volume: 80, vibrate: true, wake: false, dark: true, discreet: false };
	}

	function freshState() {
		var m = newMantra(DEFAULT_NAME, 108);
		return { v: 1, active: m.id, prefs: defaultPrefs(), mantras: [m] };
	}

	// Accepts anything (saved data, imported file) and returns a safe, clean state or null.
	function sanitize(d) {
		if (!d || typeof d !== 'object' || !Array.isArray(d.mantras) || !d.mantras.length) { return null; }
		var seen = {};
		var list = [];
		d.mantras.slice(0, 50).forEach(function (m) {
			if (!m || typeof m !== 'object') { return; }
			var id = (typeof m.id === 'string' && /^[\w-]{1,40}$/.test(m.id) && !seen[m.id]) ? m.id : uid();
			seen[id] = 1;
			var target = toInt(m.target, 1, 100000, 108);
			var days = {};
			if (m.days && typeof m.days === 'object') {
				Object.keys(m.days).slice(0, 5000).forEach(function (k) {
					if (DAY_RE.test(k)) {
						var n = toInt(m.days[k], 0, 100000000, 0);
						if (n > 0) { days[k] = n; }
					}
				});
			}
			var undo = Array.isArray(m.undo) ? m.undo.filter(function (k) { return typeof k === 'string' && DAY_RE.test(k); }).slice(-50) : [];
			var name = cleanName(m.name) || DEFAULT_NAME;
			list.push({
				id: id,
				name: name,
				native: cleanName(m.native) || nativeFor(name),
				target: target,
				count: toInt(m.count, 0, target - 1, 0),
				rounds: toInt(m.rounds, 0, 1000000000, 0),
				total: toInt(m.total, 0, 1000000000000, 0),
				days: days,
				undo: undo
			});
		});
		if (!list.length) { return null; }
		var p = (d.prefs && typeof d.prefs === 'object') ? d.prefs : {};
		var def = defaultPrefs();
		var active = list[0].id;
		list.forEach(function (m) { if (m.id === d.active) { active = m.id; } });
		return {
			v: 1,
			active: active,
			prefs: {
				sound: p.sound === undefined ? def.sound : !!p.sound,
				volume: toInt(p.volume, 0, 100, def.volume),
				vibrate: p.vibrate !== false,
				wake: !!p.wake,
				dark: p.dark === undefined ? def.dark : !!p.dark,
				discreet: !!p.discreet
			},
			mantras: list
		};
	}

	var storageOK = (function () {
		try {
			var t = '__njc_test__';
			window.localStorage.setItem(t, t);
			window.localStorage.removeItem(t);
			return true;
		} catch (e) { return false; }
	}());

	function load() {
		if (!storageOK) { return null; }
		var raw = null;
		try { raw = window.localStorage.getItem(KEY); } catch (e) { return null; }
		if (!raw) { return null; }
		try {
			return sanitize(JSON.parse(raw));
		} catch (e) {
			try { window.localStorage.setItem(KEY + '_corrupt', raw); } catch (e2) { /* ignore */ }
			return null;
		}
	}

	var state = load() || freshState();
	var el = {};

	function save() {
		if (!storageOK) { return; }
		try {
			window.localStorage.setItem(KEY, JSON.stringify(state));
		} catch (e) {
			storageOK = false;
			if (el.storeNote) { el.storeNote.hidden = false; }
		}
	}

	function cur() {
		for (var i = 0; i < state.mantras.length; i++) {
			if (state.mantras[i].id === state.active) { return state.mantras[i]; }
		}
		return state.mantras[0];
	}

	function findByName(name) {
		var n = name.toLowerCase();
		for (var i = 0; i < state.mantras.length; i++) {
			if (state.mantras[i].name.toLowerCase() === n) { return state.mantras[i]; }
		}
		return null;
	}

	// A dedicated page (for example a Radha Naam page) can open its own mantra by default.
	function applyPageDefaults() {
		var name = cleanName(root.getAttribute('data-mantra'));
		if (!name) { return; }
		var tgt = toInt(root.getAttribute('data-target'), 1, 100000, 108);
		var found = findByName(name);
		if (!found) {
			var only = state.mantras.length === 1 ? state.mantras[0] : null;
			if (only && only.total === 0 && only.name === DEFAULT_NAME) {
				found = only;
				found.name = name;
				found.native = nativeFor(name);
				found.target = tgt;
			} else if (state.mantras.length < 50) {
				found = newMantra(name, tgt);
				state.mantras.push(found);
			}
		}
		if (found) { state.active = found.id; }
	}

	/* ---------------------------------------------------------------- DOM */

	function buildMandala() {
		var s = '<svg class="njc-mandala" viewBox="-100 -100 200 200" aria-hidden="true" focusable="false"><circle r="99"/><circle r="84"/>';
		var i;
		for (i = 0; i < 16; i++) {
			s += '<path d="M0,-66 C9,-78 9,-90 0,-97 C-9,-90 -9,-78 0,-66Z" transform="rotate(' + (i * 22.5) + ')"/>';
		}
		for (i = 0; i < 16; i++) {
			s += '<path d="M0,-52 C6,-60 6,-68 0,-73 C-6,-68 -6,-60 0,-52Z" transform="rotate(' + (i * 22.5 + 11.25) + ')"/>';
		}
		return s + '<circle r="52"/></svg>';
	}

	function pref(key, label) {
		return '<button type="button" class="njc-chip" data-pref="' + key + '" aria-pressed="false">' + label + '</button>';
	}

	root.innerHTML = [
		'<div class="njc-card">',
		'<div class="njc-top" data-part="top">',
		'<label class="njc-sr" for="njc-sel">Choose a mantra</label>',
		'<select id="njc-sel" class="njc-select" data-el="sel"></select>',
		'<button type="button" class="njc-btn" data-el="new">New mantra</button>',
		'</div>',
		'<div class="njc-stage"><div class="njc-disc">',
		buildMandala(),
		'<button type="button" class="njc-tap" data-el="tap" aria-label="Count one chant">',
		'<svg class="njc-beads" viewBox="0 0 240 240" aria-hidden="true" focusable="false">',
		'<defs><radialGradient id="njc-bead" cx="35%" cy="30%" r="75%"><stop offset="0" style="stop-color:var(--b1)"/><stop offset=".55" style="stop-color:var(--b2)"/><stop offset="1" style="stop-color:var(--b3)"/></radialGradient></defs>',
		'<g data-el="beadsG"></g></svg>',
		'<span class="njc-ripple" data-el="ripple"></span>',
		'<span class="njc-label" data-part="name" data-el="name"></span>',
		'<span class="njc-count" data-el="count">0</span>',
		'<span class="njc-of" data-el="of"></span>',
		'</button>',
		'<div class="njc-fx" data-el="fx" aria-hidden="true"></div>',
		'</div></div>',
		'<p class="njc-status" data-part="status" data-el="status" role="status" aria-live="polite"></p>',
		'<div class="njc-actions">',
		'<button type="button" class="njc-btn" data-el="undo">Undo</button>',
		'<button type="button" class="njc-btn" data-part="restart" data-el="restart">Restart round</button>',
		'<label class="njc-target" data-part="target"><span>Target</span><select class="njc-select" data-el="target"></select></label>',
		'<input type="number" class="njc-input" data-part="custom" data-el="custom" min="1" max="100000" inputmode="numeric" aria-label="Custom target count" hidden>',
		'</div>',
		'<button type="button" class="njc-btn njc-exit" data-el="exit" hidden>Leave quiet mode</button>',
		'<div class="njc-audio" data-part="audio" data-el="audio">',
		'<div class="njc-audio-row">',
		'<button type="button" class="njc-snd" data-el="snd" aria-pressed="true" aria-label="Sound on or off">',
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="njc-spk" d="M4 9v6h4l5 4V5L8 9H4z"/><g class="njc-on"><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M19 6.5a8 8 0 0 1 0 11"/></g><path class="njc-off" d="M17 9l5 6M22 9l-5 6"/></svg>',
		'</button>',
		'<input type="range" class="njc-vol" data-el="vol" min="0" max="100" step="5" value="80" aria-label="Volume">',
		'</div>',
		'<p class="njc-track"><span class="njc-eq" aria-hidden="true"><i></i><i></i><i></i></span><span data-el="trackText"></span></p>',
		'</div>',
		'<dl class="njc-stats" data-part="stats">',
		'<div><dt>Today</dt><dd data-el="today">0</dd></div>',
		'<div><dt>Rounds</dt><dd data-el="rounds">0</dd></div>',
		'<div><dt>Lifetime</dt><dd data-el="total">0</dd></div>',
		'<div><dt>Day streak</dt><dd data-el="streak">0</dd></div>',
		'</dl>',
		'<div class="njc-chart" data-part="chart">',
		'<p class="njc-chart-title" data-el="chartTitle"></p>',
		'<ul class="njc-bars" data-el="bars"></ul>',
		'</div>',
		'<div class="njc-prefs" data-part="prefs" role="group" aria-label="Settings">',
		pref('vibrate', 'Vibration'),
		pref('wake', 'Keep screen on'),
		pref('dark', 'Dark'),
		pref('discreet', 'Quiet mode'),
		'</div>',
		'<details class="njc-more" data-part="more">',
		'<summary>More: quick add, rename, backup, install</summary>',
		'<div class="njc-more-body">',
		'<p class="njc-h">Quick add</p>',
		'<div class="njc-presets" data-el="presets"></div>',
		'<p class="njc-h">This mantra</p>',
		'<div class="njc-row"><button type="button" class="njc-btn" data-el="rename">Rename</button><button type="button" class="njc-btn" data-el="del">Delete</button></div>',
		'<p class="njc-h">Backup</p>',
		'<p class="njc-note">Your progress is saved in this browser only. Download a backup to keep it safe or to move it to another device.</p>',
		'<div class="njc-row"><button type="button" class="njc-btn" data-el="export">Download backup</button>',
		'<label class="njc-btn njc-file">Restore backup<input type="file" class="njc-sr" accept="application/json,.json" data-el="import"></label></div>',
		'<div data-el="installBox" hidden>',
		'<p class="njc-h">Install on your phone</p>',
		'<p class="njc-note">Add the counter to your home screen for one-tap access and offline use. On iPhone, tap Share, then Add to Home Screen.</p>',
		'<button type="button" class="njc-btn" data-el="install" hidden>Install app</button>',
		'</div>',
		'</div>',
		'</details>',
		'<p class="njc-note njc-warn" data-el="storeNote" hidden>This browser is blocking storage, so your count will be lost when you close the page.</p>',
		'</div>',
		'<div class="njc-modal-overlay" data-el="modalOverlay" aria-hidden="true">',
		'<div class="njc-modal" role="dialog" aria-modal="true" aria-labelledby="njc-modal-title">',
		'<p class="njc-modal-title" id="njc-modal-title" data-el="modalTitle"></p>',
		'<label class="njc-sr" for="njc-modal-input" data-el="modalLabel">Mantra name</label>',
		'<input type="text" id="njc-modal-input" class="njc-input" data-el="modalInput" maxlength="40" autocomplete="off">',
		'<div class="njc-modal-actions">',
		'<button type="button" class="njc-btn" data-el="modalCancel">Cancel</button>',
		'<button type="button" class="njc-btn" data-el="modalOk">Save</button>',
		'</div></div></div>'
	].join('');

	Array.prototype.forEach.call(root.querySelectorAll('[data-el]'), function (n) {
		el[n.getAttribute('data-el')] = n;
	});
	var chips = root.querySelectorAll('[data-pref]');

	TARGETS.forEach(function (t) {
		var o = document.createElement('option');
		o.value = String(t);
		o.textContent = nf.format(t);
		el.target.appendChild(o);
	});
	var oc = document.createElement('option');
	oc.value = 'custom';
	oc.textContent = 'Custom';
	el.target.appendChild(oc);

	PRESETS.forEach(function (p) {
		var b = document.createElement('button');
		b.type = 'button';
		b.className = 'njc-btn';
		b.textContent = p.name;
		b.addEventListener('click', function () { addOrSwitch(p.name); });
		el.presets.appendChild(b);
	});

	/* --------------------------------------------------------- mala beads */

	var beadEls = [];
	var beadCount = -1;
	var prevFilled = 0;

	function svgEl(name, attrs) {
		var n = document.createElementNS(SVGNS, name);
		for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) { n.setAttribute(k, attrs[k]); } }
		return n;
	}

	function buildBeads(target) {
		var B = Math.min(target, 108);
		if (B === beadCount) { return; }
		beadCount = B;
		beadEls = [];
		prevFilled = 0;
		while (el.beadsG.firstChild) { el.beadsG.removeChild(el.beadsG.firstChild); }
		var slots = B + 1;
		var R = 96, cx = 120, cy = 120;
		var spacing = 2 * Math.PI * R / slots;
		var r = Math.min(7, Math.max(2.1, spacing * 0.34));
		var rg = Math.min(7.5, Math.max(r * 1.5, 5));
		for (var i = 0; i < slots; i++) {
			var a = -Math.PI / 2 + i * 2 * Math.PI / slots;
			var c;
			if (i === 0) {
				c = svgEl('circle', { cx: cx, cy: cy - R, r: rg.toFixed(2), 'class': 'guru' });
			} else {
				c = svgEl('circle', { cx: (cx + R * Math.cos(a)).toFixed(2), cy: (cy + R * Math.sin(a)).toFixed(2), r: r.toFixed(2) });
				beadEls.push(c);
			}
			el.beadsG.appendChild(c);
		}
		// the tassel that hangs from the guru bead
		var y0 = cy - R - rg;
		el.beadsG.appendChild(svgEl('path', {
			'class': 'njc-tassel',
			d: 'M' + cx + ' ' + y0.toFixed(2) + ' L' + cx + ' ' + (y0 - 3).toFixed(2) +
				' C' + (cx - 5) + ' ' + (y0 - 5).toFixed(2) + ' ' + (cx - 5) + ' ' + (y0 - 11).toFixed(2) + ' ' + cx + ' ' + (y0 - 15).toFixed(2) +
				' C' + (cx + 5) + ' ' + (y0 - 11).toFixed(2) + ' ' + (cx + 5) + ' ' + (y0 - 5).toFixed(2) + ' ' + cx + ' ' + (y0 - 3).toFixed(2) + ' Z'
		}));
	}

	function paintBeads(filled, animate) {
		filled = Math.max(0, Math.min(filled, beadEls.length));
		var i;
		if (filled < prevFilled) {
			for (i = filled; i < prevFilled; i++) { beadEls[i].setAttribute('class', ''); }
		} else {
			for (i = prevFilled; i < filled; i++) { beadEls[i].setAttribute('class', 'on'); }
			if (animate && !reduceMotion && filled > prevFilled && filled > 0) {
				beadEls[filled - 1].setAttribute('class', 'on pop');
			}
		}
		prevFilled = filled;
	}

	/* ------------------------------------------------------------- render */

	function streak() {
		var set = {};
		state.mantras.forEach(function (m) {
			Object.keys(m.days).forEach(function (k) { if (m.days[k] > 0) { set[k] = 1; } });
		});
		var d = new Date();
		if (!set[dayKey(d)]) { d.setDate(d.getDate() - 1); }
		var n = 0;
		while (set[dayKey(d)]) {
			n++;
			d.setDate(d.getDate() - 1);
		}
		return n;
	}

	function renderCounter(opts) {
		opts = opts || {};
		var m = cur();
		buildBeads(m.target);
		el.count.textContent = nf.format(opts.full ? m.target : m.count);
		el.of.textContent = 'of ' + nf.format(m.target);
		paintBeads(opts.full ? beadEls.length : Math.floor(m.count * beadEls.length / m.target), opts.animate);
		el.tap.style.setProperty('--p', (opts.full ? 1 : m.count / m.target).toFixed(3));
		el.tap.classList.toggle('is-done', !!opts.full);
		el.undo.disabled = !(m.undo.length && (m.count > 0 || m.rounds > 0));
	}

	function renderStats() {
		var m = cur();
		var today = dayKey();
		el.today.textContent = nf.format(m.days[today] || 0);
		el.rounds.textContent = nf.format(m.rounds);
		el.total.textContent = nf.format(m.total);
		el.streak.textContent = nf.format(streak());

		var days = [];
		var d = new Date();
		d.setDate(d.getDate() - 6);
		for (var i = 0; i < 7; i++) {
			var k = dayKey(d);
			days.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }), n: m.days[k] || 0, today: k === today });
			d.setDate(d.getDate() + 1);
		}
		var max = 1;
		days.forEach(function (x) { if (x.n > max) { max = x.n; } });
		el.chartTitle.textContent = 'Last 7 days: ' + m.name;
		el.bars.innerHTML = '';
		days.forEach(function (x) {
			var li = document.createElement('li');
			if (x.today) { li.className = 'is-today'; }
			li.setAttribute('aria-label', x.label + ': ' + nf.format(x.n));
			li.title = x.label + ': ' + nf.format(x.n);
			var wrap = document.createElement('span');
			wrap.className = 'njc-bar-wrap';
			var bar = document.createElement('span');
			bar.className = x.n ? 'njc-bar' : 'njc-bar is-zero';
			bar.style.height = x.n ? Math.max(8, Math.round(x.n / max * 100)) + '%' : '2px';
			wrap.appendChild(bar);
			var lab = document.createElement('span');
			lab.className = 'njc-bar-l';
			lab.textContent = x.label.slice(0, 3);
			li.appendChild(wrap);
			li.appendChild(lab);
			el.bars.appendChild(li);
		});
	}

	function renderTargetControls() {
		var m = cur();
		var isPreset = TARGETS.indexOf(m.target) > -1;
		el.target.value = isPreset ? String(m.target) : 'custom';
		el.custom.hidden = isPreset;
		if (!isPreset) { el.custom.value = String(m.target); }
	}

	function renderPrefs() {
		Array.prototype.forEach.call(chips, function (c) {
			var k = c.getAttribute('data-pref');
			c.setAttribute('aria-pressed', state.prefs[k] ? 'true' : 'false');
			if (k === 'wake') { c.hidden = !('wakeLock' in navigator); }
			if (k === 'vibrate') { c.hidden = !navigator.vibrate; }
		});
		root.setAttribute('data-theme', state.prefs.dark ? 'dark' : 'light');
		root.classList.toggle('njc--quiet', !!state.prefs.discreet);
		el.exit.hidden = !state.prefs.discreet;
	}

	function renderAudio() {
		var tr = trackFor(cur());
		el.snd.setAttribute('aria-pressed', state.prefs.sound ? 'true' : 'false');
		el.vol.value = String(state.prefs.volume);
		el.vol.disabled = !state.prefs.sound;
		var text;
		if (!state.prefs.sound) {
			text = 'Sound is off';
		} else if (!tr) {
			text = 'Soft bead click on every tap';
		} else if (P.failed && P.url === tr.url) {
			text = 'Song unavailable, using bead click';
		} else {
			text = tr.label + ' plays while you tap';
		}
		el.trackText.textContent = text;
		el.audio.classList.toggle('is-playing', P.mode === 'playing');
	}

	function renderAll() {
		var m = cur();
		el.sel.innerHTML = '';
		state.mantras.forEach(function (x) {
			var o = document.createElement('option');
			o.value = x.id;
			o.textContent = x.name;
			if (x.id === m.id) { o.selected = true; }
			el.sel.appendChild(o);
		});
		el.name.textContent = labelOf(m);
		el.name.title = m.name;
		renderPrefs();
		renderTargetControls();
		renderCounter();
		renderStats();
		syncTrack();
		el.storeNote.hidden = storageOK;
	}

	/* -------------------------------------------------------------- sound */

	var audioContext = null;
	function audioCtx() {
		if (!audioContext) {
			var A = window.AudioContext || window.webkitAudioContext;
			if (A) { try { audioContext = new A(); } catch (e) { audioContext = null; } }
		}
		if (audioContext && audioContext.state === 'suspended') {
			try { audioContext.resume(); } catch (e2) { /* ignore */ }
		}
		return audioContext;
	}

	var noiseBuf = null;

	// a soft wooden bead click: a short filtered noise tick plus a low thump
	function beadClick() {
		var c = audioCtx();
		var v = state.prefs.volume / 100;
		if (!c || v <= 0) { return; }
		var t = c.currentTime;
		if (!noiseBuf) {
			var len = Math.floor(c.sampleRate * 0.03);
			noiseBuf = c.createBuffer(1, len, c.sampleRate);
			var d = noiseBuf.getChannelData(0);
			for (var i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
		}
		var src = c.createBufferSource();
		src.buffer = noiseBuf;
		var bp = c.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.value = 1700;
		bp.Q.value = 1.1;
		var g = c.createGain();
		g.gain.value = 0.55 * v;
		src.connect(bp);
		bp.connect(g);
		g.connect(c.destination);
		src.start(t);

		var o = c.createOscillator();
		var og = c.createGain();
		o.type = 'sine';
		o.frequency.setValueAtTime(210, t);
		o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
		og.gain.setValueAtTime(0.0001, t);
		og.gain.exponentialRampToValueAtTime(0.24 * v, t + 0.004);
		og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
		o.connect(og);
		og.connect(c.destination);
		o.start(t);
		o.stop(t + 0.1);
	}

	// a temple bell / singing bowl: a few slightly detuned partials with a long fade
	function bell() {
		var c = audioCtx();
		var v = state.prefs.volume / 100;
		if (!c || v <= 0) { return; }
		var t = c.currentTime;
		[[392, 0.30, 3.6], [393.7, 0.20, 3.2], [1080, 0.13, 2.3], [2118, 0.06, 1.3], [3300, 0.025, 0.8]].forEach(function (p) {
			var o = c.createOscillator();
			var g = c.createGain();
			o.type = 'sine';
			o.frequency.value = p[0];
			g.gain.setValueAtTime(0.0001, t);
			g.gain.exponentialRampToValueAtTime(p[1] * v, t + 0.008);
			g.gain.exponentialRampToValueAtTime(0.0001, t + p[2]);
			o.connect(g);
			g.connect(c.destination);
			o.start(t);
			o.stop(t + p[2] + 0.05);
		});
	}

	/* ------------------------------------------------- songs that follow the taps */

	function parseTracks() {
		var raw = root.getAttribute('data-tracks');
		var out = [];
		if (!raw) { return out; }
		var arr;
		try { arr = JSON.parse(raw); } catch (e) { return out; }
		if (!Array.isArray(arr)) { return out; }
		arr.slice(0, 20).forEach(function (t) {
			if (!t || typeof t.url !== 'string' || !/^https?:\/\//i.test(t.url)) { return; }
			var keys = String(t.match || '').split(',').map(function (k) { return normText(k); }).filter(function (k) { return k !== '  '; });
			if (!keys.length) { return; }
			out.push({ keys: keys, label: cleanName(t.label) || 'Devotional song', url: t.url });
		});
		return out;
	}

	var tracks = parseTracks();
	var idleBase = toInt(root.getAttribute('data-idle'), 1, 30, 3) * 1000;

	function trackFor(m) {
		if (!tracks.length) { return null; }
		var hay = normText(m.name) + normText(m.native);
		for (var i = 0; i < tracks.length; i++) {
			for (var j = 0; j < tracks[i].keys.length; j++) {
				if (hay.indexOf(tracks[i].keys[j]) > -1) { return tracks[i]; }
			}
		}
		return null;
	}

	// P holds everything about the one song that is currently loaded
	var P = { tok: 0, url: '', a: null, src: null, gain: null, mode: 'idle', failed: false, idleT: null, stopT: null, fadeT: null, duckT: null, duck: 1, taps: [] };

	function songLevel() { return Math.max(0, Math.min(1, state.prefs.volume / 100 * P.duck)); }

	function disposeTrack() {
		P.tok++;
		clearTimeout(P.idleT);
		clearTimeout(P.stopT);
		clearInterval(P.fadeT);
		if (P.a) {
			try { P.a.pause(); } catch (e) { /* ignore */ }
			if (P.a.parentNode) { P.a.parentNode.removeChild(P.a); }
			P.a.removeAttribute('src');
			try { P.a.load(); } catch (e2) { /* ignore */ }
		}
		if (P.src) { try { P.src.disconnect(); } catch (e3) { /* ignore */ } }
		if (P.gain) { try { P.gain.disconnect(); } catch (e4) { /* ignore */ } }
		P.a = null;
		P.src = null;
		P.gain = null;
		P.url = '';
		P.mode = 'idle';
		P.failed = false;
	}

	// Try with CORS first (lets us use Web Audio fades, which iPhones need). If the CDN does not
	// send CORS headers the load fails, and we quietly retry as a plain audio element.
	function loadTrack(tr, withCors) {
		disposeTrack();
		var token = P.tok;
		P.url = tr.url;
		var a = document.createElement('audio');
		a.preload = 'metadata';
		a.loop = true;
		a.hidden = true;
		a.setAttribute('playsinline', '');
		if (withCors) { a.crossOrigin = 'anonymous'; }
		a.addEventListener('error', function () {
			if (token !== P.tok) { return; }
			if (withCors) {
				loadTrack(tr, false);
			} else {
				P.failed = true;
				P.mode = 'idle';
				renderAudio();
			}
		});
		a.addEventListener('loadedmetadata', function () {
			if (token !== P.tok) { return; }
			if (withCors) { attachGraph(); }
		});
		a.src = tr.url;
		root.appendChild(a);
		P.a = a;
	}

	function attachGraph() {
		var c = audioCtx();
		if (!c || !P.a || P.src) { return; }
		try {
			P.src = c.createMediaElementSource(P.a);
			P.gain = c.createGain();
			P.gain.gain.value = P.mode === 'idle' ? 0 : songLevel();
			P.src.connect(P.gain);
			P.gain.connect(c.destination);
		} catch (e) {
			P.src = null;
			P.gain = null;
		}
	}

	function fadeTo(v, ms) {
		v = Math.max(0, Math.min(1, v));
		clearInterval(P.fadeT);
		var c;
		if (P.gain && (c = audioCtx())) {
			var g = P.gain.gain;
			var t = c.currentTime;
			g.cancelScheduledValues(t);
			g.setValueAtTime(g.value, t);
			g.linearRampToValueAtTime(v, t + Math.max(0.001, ms / 1000));
			return;
		}
		var a = P.a;
		if (!a) { return; }
		if (ms <= 0) { a.volume = v; return; }
		var from = a.volume;
		var steps = Math.max(1, Math.round(ms / 30));
		var i = 0;
		P.fadeT = setInterval(function () {
			i++;
			a.volume = Math.max(0, Math.min(1, from + (v - from) * i / steps));
			if (i >= steps) { clearInterval(P.fadeT); }
		}, 30);
	}

	function stopSong() {
		if (P.mode !== 'playing') { return; }
		P.mode = 'fading';
		fadeTo(0, 450);
		clearTimeout(P.stopT);
		P.stopT = setTimeout(function () {
			if (P.a) { try { P.a.pause(); } catch (e) { /* ignore */ } }
			P.mode = 'idle';
			renderAudio();
		}, 480);
		renderAudio();
	}

	function stopSongNow() {
		clearTimeout(P.idleT);
		clearTimeout(P.stopT);
		clearTimeout(P.duckT);
		clearInterval(P.fadeT);
		P.duck = 1;
		if (P.a) { try { P.a.pause(); } catch (e) { /* ignore */ } }
		if (P.gain) { try { P.gain.gain.cancelScheduledValues(0); P.gain.gain.value = 0; } catch (e2) { /* ignore */ } }
		P.mode = 'idle';
		renderAudio();
	}

	// called on every tap while a song belongs to the current mantra
	function songTap(tr) {
		if (P.url !== tr.url) { loadTrack(tr, true); }
		if (P.failed || !P.a) { return false; }
		var now = Date.now();
		if (P.taps.length && now - P.taps[P.taps.length - 1] > 12000) { P.taps = []; }
		P.taps.push(now);
		if (P.taps.length > 4) { P.taps.shift(); }
		clearTimeout(P.idleT);
		clearTimeout(P.stopT);
		if (P.mode === 'idle') {
			P.mode = 'playing';
			fadeTo(0, 0);
			var pr = P.a.play();
			if (pr && pr.catch) { pr.catch(function () { P.mode = 'idle'; renderAudio(); }); }
			fadeTo(songLevel(), 280);
		} else if (P.mode === 'fading') {
			P.mode = 'playing';
			fadeTo(songLevel(), 150);
		}
		// stay on while taps keep coming; stretch the wait for slow chanters so the song never stutters
		var gap = idleBase;
		if (P.taps.length >= 3) {
			var sum = 0;
			for (var i = 1; i < P.taps.length; i++) { sum += P.taps[i] - P.taps[i - 1]; }
			gap = Math.min(8000, Math.max(idleBase, sum / (P.taps.length - 1) * 1.8));
		}
		P.idleT = setTimeout(stopSong, gap);
		renderAudio();
		return true;
	}

	function duck(ms) {
		P.duck = 0.35;
		if (P.mode === 'playing') { fadeTo(songLevel(), 120); }
		clearTimeout(P.duckT);
		P.duckT = setTimeout(function () {
			P.duck = 1;
			if (P.mode === 'playing') { fadeTo(songLevel(), 500); }
		}, ms);
	}

	// keep the right song loaded for the selected mantra, and never play one by itself
	function syncTrack() {
		var tr = trackFor(cur());
		if (!tr || !state.prefs.sound || state.prefs.discreet) {
			stopSongNow();
			if (!tr || !state.prefs.sound) { disposeTrack(); }
		} else if (P.url !== tr.url) {
			stopSongNow();
			loadTrack(tr, true);
		}
		renderAudio();
	}

	function playSounds(roundDone) {
		if (state.prefs.discreet || !state.prefs.sound || state.prefs.volume <= 0) { return; }
		audioCtx();
		var tr = trackFor(cur());
		var song = tr ? songTap(tr) : false;
		if (!song && !roundDone) { beadClick(); }
		if (roundDone) {
			bell();
			if (song) { duck(1900); }
		}
	}

	/* ----------------------------------------------------- visual feedback */

	var floats = [];
	var rippleAnim = null;

	function floatName() {
		if (!canAnimate || state.prefs.discreet) { return; }
		var m = cur();
		var f = document.createElement('span');
		f.className = 'njc-float';
		f.textContent = labelOf(m);
		f.style.fontSize = (1.05 + Math.random() * 0.45).toFixed(2) + 'rem';
		var spread = Math.max(30, el.tap.offsetWidth * 0.27);
		var dx = (Math.random() * 2 - 1) * spread;
		var rot = (Math.random() * 2 - 1) * 6;
		var rise = 80 + Math.random() * 30;
		el.fx.appendChild(f);
		floats.push(f);
		if (floats.length > 9) {
			var old = floats.shift();
			if (old.parentNode) { old.parentNode.removeChild(old); }
		}
		var anim = f.animate([
			{ opacity: 0, transform: 'translateX(-50%) translate(0px,12px) scale(0.78) rotate(0deg)' },
			{ opacity: 1, offset: 0.22, transform: 'translateX(-50%) translate(' + (dx * 0.25).toFixed(1) + 'px,' + (-rise * 0.25).toFixed(1) + 'px) scale(1) rotate(' + (rot * 0.4).toFixed(1) + 'deg)' },
			{ opacity: 0, transform: 'translateX(-50%) translate(' + dx.toFixed(1) + 'px,' + (-rise).toFixed(1) + 'px) scale(1.12) rotate(' + rot.toFixed(1) + 'deg)' }
		], { duration: 1500 + Math.random() * 400, easing: 'cubic-bezier(0.22,0.65,0.3,1)' });
		anim.onfinish = function () {
			var i = floats.indexOf(f);
			if (i > -1) { floats.splice(i, 1); }
			if (f.parentNode) { f.parentNode.removeChild(f); }
		};
	}

	function ripple() {
		if (!canAnimate) { return; }
		if (rippleAnim) { rippleAnim.cancel(); }
		rippleAnim = el.ripple.animate([
			{ opacity: 0.6, transform: 'scale(0.6)' },
			{ opacity: 0, transform: 'scale(1.14)' }
		], { duration: 560, easing: 'ease-out' });
	}

	var statusTimer;
	function say(text) {
		el.status.textContent = text;
		clearTimeout(statusTimer);
		statusTimer = setTimeout(function () { el.status.textContent = ''; }, 3500);
	}

	function haptic(roundDone) {
		if (state.prefs.discreet || !state.prefs.vibrate || !navigator.vibrate) { return; }
		try { navigator.vibrate(roundDone ? [70, 50, 70] : 10); } catch (e) { /* ignore */ }
	}

	var wakeLock = null;
	function applyWake() {
		if (!('wakeLock' in navigator)) { return; }
		if (state.prefs.wake && document.visibilityState === 'visible') {
			if (!wakeLock) {
				navigator.wakeLock.request('screen').then(function (l) {
					wakeLock = l;
					l.addEventListener('release', function () { wakeLock = null; });
				}).catch(function () { /* ignore */ });
			}
		} else if (wakeLock) {
			wakeLock.release().catch(function () { /* ignore */ });
			wakeLock = null;
		}
	}

	/* ------------------------------------------------------------ actions */

	var flashTimer;

	function tap() {
		var m = cur();
		var k = dayKey();
		m.count++;
		m.total++;
		m.days[k] = (m.days[k] || 0) + 1;
		m.undo.push(k);
		if (m.undo.length > 50) { m.undo.shift(); }
		var done = false;
		if (m.count >= m.target) {
			m.count = 0;
			m.rounds++;
			done = true;
		}
		save();
		clearTimeout(flashTimer);
		if (done) {
			renderCounter({ full: true, animate: true });
			flashTimer = setTimeout(function () { renderCounter(); }, 550);
			say('Round ' + nf.format(m.rounds) + ' complete');
		} else {
			renderCounter({ animate: true });
		}
		renderStats();
		ripple();
		floatName();
		haptic(done);
		playSounds(done);
	}

	function undo() {
		var m = cur();
		if (!m.undo.length) { return; }
		if (m.count === 0 && m.rounds === 0) { m.undo = []; renderCounter(); return; }
		var k = m.undo.pop();
		if (m.count > 0) {
			m.count--;
		} else {
			m.rounds--;
			m.count = m.target - 1;
		}
		m.total = Math.max(0, m.total - 1);
		var left = (m.days[k] || 0) - 1;
		if (left > 0) { m.days[k] = left; } else { delete m.days[k]; }
		save();
		clearTimeout(flashTimer);
		renderCounter();
		renderStats();
	}

	function restartRound() {
		var m = cur();
		if (m.count === 0) { return; }
		if (!window.confirm('Restart this round from 0? Your lifetime and daily totals stay as they are.')) { return; }
		m.count = 0;
		m.undo = [];
		save();
		clearTimeout(flashTimer);
		renderCounter();
	}

	function setTarget(n) {
		var m = cur();
		n = toInt(n, 1, 100000, m.target);
		m.target = n;
		if (m.count >= n) {
			m.rounds += Math.floor(m.count / n);
			m.count = m.count % n;
		}
		save();
		renderTargetControls();
		renderCounter();
		renderStats();
	}

	function addOrSwitch(name) {
		name = cleanName(name);
		if (!name) { return; }
		var f = findByName(name);
		if (!f) {
			if (state.mantras.length >= 50) {
				window.alert('You can keep up to 50 mantras. Delete one first.');
				return;
			}
			f = newMantra(name, 108);
			state.mantras.push(f);
		}
		state.active = f.id;
		save();
		clearTimeout(flashTimer);
		renderAll();
	}

	var modalSubmit = null;

	function closeTextModal() {
		if (!el.modalOverlay) { return; }
		el.modalOverlay.classList.remove('is-open');
		el.modalOverlay.setAttribute('aria-hidden', 'true');
		document.documentElement.classList.remove('njc-dialog-open');
		modalSubmit = null;
	}

	function openTextModal(opts) {
		opts = opts || {};
		el.modalTitle.textContent = opts.title || '';
		el.modalLabel.textContent = opts.label || opts.title || 'Mantra name';
		el.modalInput.placeholder = opts.placeholder || '';
		el.modalInput.value = opts.value == null ? '' : String(opts.value);
		modalSubmit = opts.onSubmit || null;
		el.modalOverlay.classList.add('is-open');
		el.modalOverlay.setAttribute('aria-hidden', 'false');
		document.documentElement.classList.add('njc-dialog-open');
		requestAnimationFrame(function () {
			el.modalInput.focus();
			el.modalInput.select();
		});
	}

	function submitTextModal() {
		if (!modalSubmit) { closeTextModal(); return; }
		var name = cleanName(el.modalInput.value);
		if (!name) {
			el.modalInput.focus();
			return;
		}
		var fn = modalSubmit;
		closeTextModal();
		fn(name);
	}

	function renameMantra() {
		var m = cur();
		openTextModal({
			title: 'Rename this mantra',
			label: 'New name for this mantra',
			value: m.name,
			onSubmit: function (name) {
				m.name = name;
				m.native = nativeFor(name);
				save();
				renderAll();
			}
		});
	}

	function deleteMantra() {
		var m = cur();
		if (state.mantras.length === 1) {
			if (!window.confirm('This is your only mantra. Reset it and erase its history?')) { return; }
			var f = newMantra(DEFAULT_NAME, 108);
			state.mantras = [f];
			state.active = f.id;
		} else {
			if (!window.confirm('Delete "' + m.name + '" and all of its history? This cannot be undone.')) { return; }
			state.mantras = state.mantras.filter(function (x) { return x.id !== m.id; });
			state.active = state.mantras[0].id;
		}
		save();
		renderAll();
	}

	function exportData() {
		var blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		a.href = url;
		a.download = 'naam-japa-backup-' + dayKey() + '.json';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
	}

	function importData(file) {
		if (!file) { return; }
		if (file.size > 5 * 1024 * 1024) {
			window.alert('That file is too large to be a backup.');
			return;
		}
		var reader = new FileReader();
		reader.onload = function () {
			var parsed = null;
			try { parsed = sanitize(JSON.parse(String(reader.result))); } catch (e) { parsed = null; }
			if (!parsed) {
				window.alert('This file is not a valid Naam Japa backup.');
				return;
			}
			if (!window.confirm('Replace the progress in this browser with this backup?')) { return; }
			state = parsed;
			save();
			renderAll();
			say('Backup restored');
		};
		reader.readAsText(file);
	}

	/* ------------------------------------------------------------- events */

	el.tap.addEventListener('click', tap);
	el.undo.addEventListener('click', undo);
	el.restart.addEventListener('click', restartRound);

	el.sel.addEventListener('change', function () {
		state.active = el.sel.value;
		save();
		clearTimeout(flashTimer);
		renderAll();
	});

	el['new'].addEventListener('click', function () {
		openTextModal({
			title: 'New mantra',
			label: 'Name of the mantra or naam',
			placeholder: 'For example Radha or Om Namah Shivaya',
			onSubmit: function (name) { addOrSwitch(name); }
		});
	});

	el.modalCancel.addEventListener('click', closeTextModal);
	el.modalOk.addEventListener('click', submitTextModal);
	el.modalOverlay.addEventListener('click', function (e) {
		if (e.target === el.modalOverlay) { closeTextModal(); }
	});
	el.modalInput.addEventListener('keydown', function (e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			submitTextModal();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			closeTextModal();
		}
	});

	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && el.modalOverlay.classList.contains('is-open')) {
			e.preventDefault();
			closeTextModal();
		}
	});

	el.target.addEventListener('change', function () {
		if (el.target.value === 'custom') {
			el.custom.hidden = false;
			el.custom.value = String(cur().target);
			el.custom.focus();
			el.custom.select();
		} else {
			setTarget(el.target.value);
		}
	});

	el.custom.addEventListener('change', function () { setTarget(el.custom.value); });
	el.custom.addEventListener('keydown', function (e) {
		if (e.key === 'Enter') { setTarget(el.custom.value); el.custom.blur(); }
	});

	Array.prototype.forEach.call(chips, function (c) {
		c.addEventListener('click', function () {
			var k = c.getAttribute('data-pref');
			state.prefs[k] = !state.prefs[k];
			save();
			renderPrefs();
			if (k === 'wake') { applyWake(); }
			if (k === 'discreet') { syncTrack(); }
		});
	});

	el.exit.addEventListener('click', function () {
		state.prefs.discreet = false;
		save();
		renderPrefs();
		syncTrack();
	});

	el.snd.addEventListener('click', function () {
		state.prefs.sound = !state.prefs.sound;
		save();
		if (state.prefs.sound) { audioCtx(); }
		syncTrack();
	});

	el.vol.addEventListener('input', function () {
		state.prefs.volume = toInt(el.vol.value, 0, 100, 80);
		if (P.mode === 'playing') { fadeTo(songLevel(), 60); }
	});
	el.vol.addEventListener('change', function () { save(); });

	el.rename.addEventListener('click', renameMantra);
	el.del.addEventListener('click', deleteMantra);
	el['export'].addEventListener('click', exportData);
	el['import'].addEventListener('change', function () {
		var f = el['import'].files && el['import'].files[0];
		el['import'].value = '';
		importData(f);
	});

	document.addEventListener('visibilitychange', function () {
		if (document.visibilityState !== 'visible') { stopSongNow(); }
		applyWake();
	});

	// keep two open tabs in step
	window.addEventListener('storage', function (e) {
		if (e.key !== KEY || !e.newValue) { return; }
		try {
			var s = sanitize(JSON.parse(e.newValue));
			if (s) { state = s; renderAll(); }
		} catch (err) { /* ignore */ }
	});

	/* ------------------------------------------------- install on the phone */

	var deferredInstall = null;

	function isStandalone() {
		return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
	}

	function initPwa() {
		var sw = root.getAttribute('data-sw');
		if (!sw || !('serviceWorker' in navigator) || isStandalone()) { return; }
		el.installBox.hidden = false;
		var scope = root.getAttribute('data-sw-scope');
		var register = function () {
			navigator.serviceWorker.register(sw, scope ? { scope: scope } : undefined).catch(function () { /* ignore */ });
		};
		if (document.readyState === 'complete') { register(); } else { window.addEventListener('load', register); }
	}

	window.addEventListener('beforeinstallprompt', function (e) {
		e.preventDefault();
		deferredInstall = e;
		el.installBox.hidden = false;
		el.install.hidden = false;
	});

	window.addEventListener('appinstalled', function () {
		el.installBox.hidden = true;
		el.install.hidden = true;
	});

	el.install.addEventListener('click', function () {
		if (!deferredInstall) { return; }
		deferredInstall.prompt();
		deferredInstall.userChoice.then(function () {
			deferredInstall = null;
			el.install.hidden = true;
		});
	});

	/* --------------------------------------------------------------- init */

	applyPageDefaults();
	save();
	renderAll();
	applyWake();
	initPwa();
}());
