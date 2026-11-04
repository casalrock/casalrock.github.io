// Prueba de la app en Safari de iPhone (motor WebKit) con una base de datos de mentira.
// Nunca toca la base de datos real: se bloquea cualquier conexión a supabase.co.
// Uso: node prueba.js  (variables: URL, OUT, NAVEGADOR=webkit|chromium, MOVIL="iPhone 15")
const pw = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = process.env.URL || 'https://casalrock.github.io/prueba/';
const OUT = process.env.OUT || path.join(__dirname, 'capturas');
const NAV = process.env.NAVEGADOR || 'webkit';
const MOVIL = process.env.MOVIL || 'iPhone 15';
const FAKE = fs.readFileSync(path.join(__dirname, 'supabase-falso.js'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });

let fails = 0, n = 0;
const ok = (c, m) => { console.log((c ? '  OK ' : '  FALLO ') + m); if (!c) fails++; };
const log = (...a) => console.log(...a);

async function nuevoContexto(b, extra) {
  const dev = pw.devices[MOVIL];
  const opts = Object.assign({}, dev, { serviceWorkers: 'block', acceptDownloads: true, locale: 'es-ES' });
  if (NAV !== 'webkit') delete opts.defaultBrowserType;
  const ctx = await b.newContext(opts);
  await ctx.addInitScript(FAKE);
  if (extra) await ctx.addInitScript(extra.fn, extra.arg);
  // seguridad: nada puede llegar a la base de datos real
  await ctx.route(/supabase\.co|supabase-js|jsdelivr/, r => r.abort());
  return ctx;
}
function vigilar(p, errs) {
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|access control|ERR_FAILED|blocked/i.test(m.text())) errs.push('consola: ' + m.text()); });
}
async function foto(p, nombre, full) {
  n++;
  const f = path.join(OUT, String(n).padStart(2, '0') + '-' + nombre + '.png');
  try { await p.screenshot({ path: f, fullPage: !!full }); } catch (e) { log('   (no se pudo hacer la foto ' + nombre + ': ' + e.message + ')'); }
}
async function tapSel(p, sel) {
  try { await p.tap(sel, { timeout: 6000 }); }
  catch (e) {
    const info = await p.evaluate(s => {
      const el = document.querySelector(s); if (!el) return 'no existe';
      const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return 'disabled=' + el.disabled + ' caja=' + JSON.stringify([Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]) + ' encima=' + (t ? t.tagName + '#' + t.id + '.' + t.className + ' "' + (t.textContent || '').trim().slice(0, 30) + '"' : 'nada') + ' vh=' + innerHeight;
    }, sel);
    throw new Error('no se pudo tocar ' + sel + ' (' + info + ')');
  }
  await p.waitForTimeout(220);
}

// comprobaciones propias de iPhone
async function revisarIphone(p, donde) {
  const r = await p.evaluate(() => {
    const vw = innerWidth;
    const ancho = document.documentElement.scrollWidth;
    const chicos = [...document.querySelectorAll('input,select,textarea')].filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => '#' + e.id + ':' + getComputedStyle(e).fontSize);
    const salen = [...document.querySelectorAll('button,.btn,input,select')].filter(e => { if (!e.offsetParent) return false; const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > vw + 1 || b.left < -1); }).map(e => (e.id || e.textContent.trim().slice(0, 15)));
    const peque = [...document.querySelectorAll('button')].filter(e => { if (!e.offsetParent) return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.height < 28 || b.width < 28); }).map(e => (e.id || e.textContent.trim().slice(0, 12)) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
    return { vw, ancho, chicos, salen, peque };
  });
  ok(r.ancho <= r.vw + 1, donde + ': no hay desplazamiento lateral (ancho ' + r.ancho + ' / pantalla ' + r.vw + ')');
  ok(r.chicos.length === 0, donde + ': campos de texto con letra >=16px (si no, iPhone hace zoom al tocarlos) ' + JSON.stringify(r.chicos));
  ok(r.salen.length === 0, donde + ': ningún botón se sale de la pantalla ' + JSON.stringify(r.salen));
  if (r.peque.length) log('   botones pequeños (<28px) en ' + donde + ': ' + JSON.stringify(r.peque.slice(0, 12)));
}

(async () => {
  const b = await pw[NAV].launch();
  log('Navegador: ' + NAV + ' ' + b.version() + ' | móvil: ' + MOVIL + ' | ' + URL);
  const errsTot = [];

  // ===================== 1. Arranque, nombre y PIN =====================
  {
    log('=== Arranque y nombre');
    const ctx = await nuevoContexto(b);
    const p = await ctx.newPage(); const errs = []; vigilar(p, errs);
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400); await foto(p, 'splash-inicio');
    await p.waitForTimeout(1100); await foto(p, 'splash-dibujo');
    await p.waitForTimeout(2500); await foto(p, 'pantalla-inicial');
    ok(await p.evaluate(() => { const s = document.getElementById('splash'); return !s || s.classList.contains('fuera') || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0'; }), 'la pantalla de bienvenida desaparece sola');
    log('   pestañas: ' + await p.evaluate(() => [...document.querySelectorAll('#tabs button')].map(b => b.textContent.trim() + (b.classList.contains('on') ? '*' : '')).join(' | ')));
    await revisarIphone(p, 'inicio');
    const v = await p.evaluate(() => { const m = document.querySelector('meta[name=viewport]'); return m && m.content; });
    log('   viewport: ' + v + ' | tamaño ventana: ' + await p.evaluate(() => innerWidth + 'x' + innerHeight + ' dpr ' + devicePixelRatio));
    // nombre + PIN
    await p.tap('#myname'); await p.fill('#myname', 'Prueba iPhone');
    await p.tap('#mypin'); await p.fill('#mypin', '12');
    await p.evaluate(() => { [...document.querySelectorAll('#namebar button')].find(x => x.textContent.trim() === 'Guardar').scrollIntoView({ block: 'center' }) });
    await p.locator('#namebar button', { hasText: 'Guardar' }).tap(); await p.waitForTimeout(400);
    const msgPin = await p.evaluate(() => document.querySelector('#namebar p').textContent);
    ok(/PIN de 4 cifras/.test(msgPin), 'PIN corto: avisa "' + msgPin + '"');
    await foto(p, 'nombre-pin-corto');
    await p.fill('#mypin', '1234');
    await p.locator('#namebar button', { hasText: 'Guardar' }).tap(); await p.waitForTimeout(900);
    const reg = await p.evaluate(() => ({ name: localStorage.getItem('olg-myname'), db: JSON.parse(localStorage.getItem('__fakedb') || '{}').autores || {}, msg: (document.querySelector('#namebar p') || {}).textContent }));
    const filas = JSON.stringify(reg.db);
    ok(reg.name === 'Prueba iPhone' && /Prueba iPhone/.test(filas) && /1234/.test(filas), 'nombre y PIN guardados (solo en la base de mentira) — "' + reg.msg + '"');
    await foto(p, 'nombre-guardado');
    // cambiar tema con el botón
    const t0 = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await tapSel(p, '#themeToggle');
    const t1 = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
    ok(t0 !== t1, 'botón luna/sol cambia de tema: ' + t0 + ' -> ' + t1);
    await foto(p, 'tema-' + t1);
    await p.reload(); await p.waitForTimeout(3500);
    ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === t1, 'el tema elegido se recuerda al volver a abrir');
    await tapSel(p, '#themeToggle');
    ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === t0, 'el botón vuelve al tema anterior');
    errsTot.push(...errs.map(e => '[arranque] ' + e));
    await ctx.close();
  }

  // ===================== 2. Muro y Moon, tema oscuro y claro =====================
  for (const theme of ['dark', 'light']) {
    const ctx = await nuevoContexto(b, { fn: t => { try { if (!sessionStorage.getItem('__ini')) { sessionStorage.setItem('__ini', '1'); localStorage.setItem('olg-myname', 'Olga'); localStorage.setItem('olg-theme', t); } } catch (e) { } }, arg: theme });
    const p = await ctx.newPage(); const errs = []; vigilar(p, errs);
    await p.goto(URL); await p.waitForTimeout(3500);
    log('=== Tema ' + theme + ' (' + await p.evaluate(() => document.documentElement.getAttribute('data-theme')) + ')');
    for (const tab of ['mur', 'tab']) {
      const W = tab === 'mur' ? 'w' : 't'; const P = W === 'w' ? '#w' : '#';
      const pre = theme + '-' + (W === 'w' ? 'muro' : 'moon');
      log('--- ' + (W === 'w' ? 'Muro' : 'Moon'));
      try {
        await tapSel(p, `#tabs [data-tab="${tab}"]`); await p.waitForTimeout(400);
        await foto(p, pre + '-pestana');
        const st = () => p.evaluate(W => JSON.stringify(W === 'w' ? wcur : cur), W);
        const bar = s => tapSel(p, `.selbar[data-for="${W}"] ${s}`);
        const nRoutes = () => p.evaluate(W => (W === 'w' ? wroutes.filter(r => r.wall === curWall) : routes).length, W);
        const hayTop = () => p.evaluate(W => Object.values(W === 'w' ? wcur : cur).some(v => v[0] === 'f'), W);
        const n0 = await nRoutes();
        await tapSel(p, P + 'nueva'); await p.waitForTimeout(300); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(200);
        ok(await p.evaluate(W => !!document.querySelector((W === 'w' ? '#wform' : '#tform') + ' .howto').offsetParent, W), 'instrucciones visibles al crear');
        // la barra fija de abajo
        const sb = await p.evaluate(W => { const e = document.querySelector('.selbar[data-for="' + W + '"]'); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { pos: cs.position, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), vh: innerHeight, pb: cs.paddingBottom, btns: [...e.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.textContent.trim()) }; }, W);
        log('   barra de abajo: ' + JSON.stringify(sb));
        ok(sb.bottom <= sb.vh + 1 && sb.top > sb.vh * 0.5, 'barra Deshacer/Quitar/Guardar fija abajo y dentro de la pantalla');
        ok(sb.h < sb.vh * 0.35, 'la barra de abajo no tapa demasiado (' + sb.h + 'px de ' + sb.vh + ')');
        // elegir presas
        let ids;
        if (W === 'w') {
          ids = await p.evaluate(() => { const vh = innerHeight; const all = [...document.querySelectorAll('#wsvg path.hshape')]; const c = all.map((e, i) => { const r = e.getBoundingClientRect(); return { i, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }).filter(o => o.x > 40 && o.x < innerWidth - 90 && o.w > 12 && o.y > 0); c.sort((a, b) => b.y - a.y); const m = c.length; return [c[Math.floor(m * .05)], c[Math.floor(m * .3)], c[Math.floor(m * .55)], c[Math.floor(m * .8)]].map(o => o.i); });
        } else ids = ['C5', 'D8', 'F11', 'H14'];
        const tapados = [];
        const tap = async i => {
          const loc = W === 'w' ? p.locator('#wsvg path.hshape').nth(ids[i]) : p.locator(`#b circle[data-k="${ids[i]}"]`).last();
          await loc.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'center' }));
          await p.waitForTimeout(120);
          const bb = await loc.boundingBox(); const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
          const tapa = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest('.selbar') ? 'barra' : (e && e.closest('svg') ? '' : (e ? e.tagName + '#' + e.id : 'nada')); }, [x, y]);
          if (tapa) tapados.push(ids[i] + ':' + tapa);
          await p.touchscreen.tap(x, y); await p.waitForTimeout(200);
        };
        const hist = [await st()];
        for (let i = 0; i < 4; i++) { await tap(i); hist.push(await st()); }
        log('   presas tras cada toque: ' + hist.map(h => Object.keys(JSON.parse(h)).length).join(','));
        if (tapados.length) log('   presas tapadas por algo al tocar: ' + JSON.stringify(tapados));
        ok(Object.keys(JSON.parse(hist[4])).length === 4, '4 presas puestas con el dedo (Inicio + intermedias)');
        await tap(1); const afterHand = await st(); ok(afterHand !== hist[4], 'tocar otra vez cambia la mano');
        await p.evaluate(() => scrollTo(0, 0)); await foto(p, pre + '-crear-presas');
        await bar('[data-del]'); const q1 = await st(); await bar('[data-del]'); const q2 = await st();
        ok(Object.keys(JSON.parse(q2)).length === 2, 'Quitar ×2 deja 2 presas');
        await bar('[data-undo]'); ok(await st() === q1, 'Deshacer recupera la quitada');
        await bar('[data-undo]'); ok(await st() === afterHand, 'Deshacer otra vez recupera la otra');
        await bar('[data-undo]'); ok(await st() === hist[4], 'Deshacer deshace el cambio de mano');
        // Guardar sin top
        await bar('[data-save]'); await p.waitForTimeout(200);
        const m1 = await p.evaluate(W => { const m = document.querySelector('.selbar[data-for="' + W + '"] .selmsg'); return m && !m.hidden ? m.textContent : ''; }, W);
        ok(/top/i.test(m1) && await p.locator('#namepop').isHidden(), 'Guardar sin top avisa: "' + m1 + '"');
        await foto(p, pre + '-aviso-sin-top');
        for (let i = 0; i < 6 && !(await hayTop()); i++) await tap(3);
        ok(await hayTop(), 'top marcado tocando varias veces la última');
        await foto(p, pre + '-con-top');
        await bar('[data-save]'); await p.waitForTimeout(300);
        ok(await p.locator('#namepop').isVisible(), 'Guardar abre la ventanita');
        const pop = await p.evaluate(() => { const e = document.querySelector('#namepop'); const box = [...e.querySelectorAll('*')].map(x => x.getBoundingClientRect()).filter(r => r.width > 0); const top = Math.min(...box.map(r => r.top)), bot = Math.max(...box.map(r => r.bottom)); return { top: Math.round(top), bot: Math.round(bot), vh: innerHeight }; });
        ok(pop.top >= 0 && pop.bot <= pop.vh, 'ventanita entera dentro de la pantalla ' + JSON.stringify(pop));
        await p.locator('#npin').tap(); await p.fill('#npin', 'Prueba compartida ' + W); await p.selectOption('#npg', '6a');
        await foto(p, pre + '-ventanita');
        await revisarIphone(p, pre + ' ventanita');
        await tapSel(p, '#npok'); await p.waitForTimeout(700);
        const r1 = await p.evaluate(W => { const l = (W === 'w' ? wroutes : routes); return l[l.length - 1]; }, W);
        ok(await nRoutes() === n0 + 1 && r1.n === 'Prueba compartida ' + W && r1.g === '6a' && !r1.priv, 'guardada (compartida, 6a)');
        // privada
        await tapSel(p, P + 'nueva'); await p.evaluate(() => scrollTo(0, 0));
        await tap(0); await tap(2); await tap(3); for (let i = 0; i < 6 && !(await hayTop()); i++) await tap(3);
        await bar('[data-save]'); await p.waitForTimeout(250);
        await p.fill('#npin', 'Mi privada ' + W); await p.selectOption('#npg', '6b+'); await p.locator('#nppriv').tap(); await p.waitForTimeout(100);
        ok(await p.isChecked('#nppriv'), 'casilla "Solo para mí" se marca con el dedo');
        await tapSel(p, '#npok'); await p.waitForTimeout(700);
        const r2 = await p.evaluate(W => { const l = (W === 'w' ? wroutes : routes); return l[l.length - 1]; }, W);
        ok(r2.n === 'Mi privada ' + W && r2.g === '6b+' && r2.priv === true, 'guardada privada 6b+');
        const dbn = await p.evaluate(W => JSON.stringify(JSON.parse(localStorage.getItem('__fakedb') || '{}')[W === 'w' ? 'rutas_muro' : 'rutas_tablero'] || {}), W);
        ok(dbn.includes('Prueba compartida ' + W) && !dbn.includes('Mi privada ' + W), 'la privada NO se comparte');
        // lista
        const lista = await p.evaluate(W => [...document.querySelectorAll((W === 'w' ? '#wlst' : '#lst') + ' li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()), W);
        log('   lista: ' + JSON.stringify(lista));
        ok(lista.some(t => /Prueba compartida/.test(t) && /3 movimientos/.test(t)), 'la lista muestra "3 movimientos"');
        await p.locator(W === 'w' ? '#wlst' : '#lst').scrollIntoViewIfNeeded(); await foto(p, pre + '-lista');
        // elegir, tarjeta y botones
        await p.locator((W === 'w' ? '#wlst' : '#lst') + ' .it', { hasText: 'Prueba compartida' }).tap(); await p.waitForTimeout(500);
        const det = await p.evaluate(W => document.querySelector(W === 'w' ? '#wdet' : '#det').innerText.replace(/\s+/g, ' '), W);
        ok(/Prueba compartida/.test(det) && /6a/.test(det), 'tarjeta de la vía elegida: "' + det.slice(0, 90) + '"');
        await p.evaluate(W => { const d = document.querySelector(W === 'w' ? '#wdet' : '#det'); d.scrollIntoView({ block: 'center' }); }, W); await p.waitForTimeout(250);
        await foto(p, pre + '-elegida');
        const ic = await p.evaluate(P => ['editar', 'copiar', 'borrar'].map(k => { const b = document.querySelector(P + k), c = getComputedStyle(b, '::before'), bs = getComputedStyle(b); const r = b.getBoundingClientRect(); return { k, vis: !!b.offsetParent, txt: b.textContent.trim(), mask: (c.webkitMaskImage || c.maskImage || '').slice(0, 40), w: c.width, h: Math.round(r.height), right: Math.round(r.right), vw: innerWidth, bg: c.backgroundColor, col: bs.color }; }), P);
        log('   botones: ' + JSON.stringify(ic));
        ok(ic.every(x => x.vis && /svg/.test(x.mask) && parseFloat(x.w) > 10), 'Editar/Copiar/Borrar tienen su icono en Safari');
        ok(ic.every(x => x.right <= x.vw), 'Editar/Copiar/Borrar caben en la pantalla');
        await p.locator(P + 'acts').scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, 100)); await foto(p, pre + '-botones');
        // editar
        await tapSel(p, P + 'editar'); await p.waitForTimeout(300);
        ok(await p.evaluate(W => (W === 'w' ? wmode : mode) === 'crear', W), 'Editar abre el modo crear');
        await bar('[data-save]'); await p.waitForTimeout(250);
        ok(await p.inputValue('#npin') === 'Prueba compartida ' + W && await p.inputValue('#npg') === '6a', 'al editar la ventanita trae nombre y grado');
        await p.fill('#npin', 'Renombrada ' + W); await p.selectOption('#npg', '6c'); await tapSel(p, '#npok'); await p.waitForTimeout(700);
        ok(await p.evaluate(W => document.querySelector(W === 'w' ? '#wlst' : '#lst').innerText.includes('Renombrada'), W), 'la lista muestra el nombre nuevo');
        // copiar
        await p.locator((W === 'w' ? '#wlst' : '#lst') + ' .it', { hasText: 'Renombrada' }).tap(); await p.waitForTimeout(400);
        await tapSel(p, P + 'copiar'); await p.waitForTimeout(300);
        await bar('[data-save]'); await p.waitForTimeout(250);
        ok(/^Copia de Renombrada/.test(await p.inputValue('#npin')), 'Copiar trae "Copia de …"');
        await tapSel(p, '#npno'); await bar(`[data-px="${W === 'w' ? 'wcancelar' : 'cancelar'}"]`); await p.waitForTimeout(250);
        ok(await p.locator('#cancelpop').isVisible(), 'Cancelar con presas pregunta antes');
        await foto(p, pre + '-cancelar');
        await tapSel(p, '#cpyes'); await p.waitForTimeout(250);
        ok(await nRoutes() === n0 + 2, 'cancelar la copia no crea nada');
        // borrar
        await p.locator((W === 'w' ? '#wlst' : '#lst') + ' .it', { hasText: 'Mi privada' }).tap(); await p.waitForTimeout(400);
        await tapSel(p, P + 'borrar');
        ok(/Toca otra vez/.test(await p.textContent(P + 'borrar')), 'Borrar pide un segundo toque');
        await foto(p, pre + '-borrar-confirmar');
        await tapSel(p, P + 'borrar'); await p.waitForTimeout(400);
        ok(await nRoutes() === n0 + 1, 'segundo toque borra la vía');
        // hecha / no hecha
        const est0 = await p.evaluate(W => { const b = document.querySelector((W === 'w' ? '#wlst' : '#lst') + ' .estb'); return b && b.className; }, W);
        await p.locator((W === 'w' ? '#wlst' : '#lst') + ' .estb').first().tap(); await p.waitForTimeout(300);
        const est1 = await p.evaluate(W => { const b = document.querySelector((W === 'w' ? '#wlst' : '#lst') + ' .estb'); return b && b.className; }, W);
        ok(est0 !== est1, 'marcar como hecha con el círculo (' + est0 + ' -> ' + est1 + ')');
        if (await p.locator('#gsheet').isVisible().catch(() => false)) {
          await foto(p, pre + '-hecha-grado');
          await p.locator('#gsheet button', { hasText: '6a' }).first().tap(); await p.waitForTimeout(300);
          ok(await p.locator('#gsheet').isHidden(), 'la ventanita "¡Hecha!" se cierra al elegir grado');
        }
        await revisarIphone(p, pre);
      } catch (e) { ok(false, 'el recorrido se paró: ' + e.message.split('\n')[0]); await foto(p, pre + '-ERROR'); }
    }
    // Grupo + exportar
    try {
      log('--- Grupo');
      await tapSel(p, '#tabs [data-tab="grp"]'); await p.waitForTimeout(300);
      await foto(p, theme + '-grupo', true);
      await revisarIphone(p, theme + ' grupo');
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.locator('#bkDown').tap()]);
      await p.waitForTimeout(300);
      const msg = await p.textContent('#bkMsg');
      let cont = '';
      if (dl) { const f = path.join(OUT, theme + '-export.json'); await dl.saveAs(f); cont = fs.readFileSync(f, 'utf8'); }
      ok(!!dl && /Renombrada/.test(cont), 'Exportar descarga un archivo (' + (dl ? dl.suggestedFilename() : 'sin descarga') + ') — "' + msg + '"');
      await foto(p, theme + '-grupo-exportado');
    } catch (e) { ok(false, 'Grupo/Exportar: ' + e.message.split('\n')[0]); }
    ok(errs.length === 0, 'errores de JavaScript (' + theme + '): ' + JSON.stringify(errs));
    errsTot.push(...errs);
    await ctx.close();
  }

  // ===================== 3. App real: solo mirar (con base de mentira, vacía) =====================
  {
    const real = URL.replace(/prueba\/?$/, '');
    if (real !== URL) {
      log('=== App real (solo mirar) ' + real);
      const ctx = await nuevoContexto(b);
      const p = await ctx.newPage(); const errs = []; vigilar(p, errs);
      await p.goto(real); await p.waitForTimeout(3500);
      await foto(p, 'real-inicio');
      await revisarIphone(p, 'app real');
      ok(errs.length === 0, 'app real sin errores de JavaScript: ' + JSON.stringify(errs));
      await ctx.close();
    }
  }
  log(fails ? 'FALLOS: ' + fails : 'TODO OK');
  await b.close();
})();
