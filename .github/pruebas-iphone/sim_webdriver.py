# Extra opcional: maneja Safari del simulador de iPhone con WebDriver (safaridriver).
# SOLO cosas que se quedan en el propio móvil: cambiar de pestaña, cambiar el tema,
# entrar en "Nueva vía", tocar presas y Cancelar. Nunca se pulsa Guardar ni se marca nada.
import json, subprocess, sys, time, base64, urllib.request

UDID, OUT = sys.argv[1], sys.argv[2]
URL = "https://casalrock.github.io/prueba/"
BASE = "http://127.0.0.1:4444"


def sh(c):
    print("$", c, flush=True)
    return subprocess.run(c, shell=True, capture_output=True, text=True)


def req(method, path, body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=timeout) as f:
        return json.loads(f.read().decode() or "{}")


def foto(nombre):
    sh(f'xcrun simctl io {UDID} screenshot "{OUT}/{nombre}.png"')


# intentar activar "Automatización remota" en Safari del simulador (claves posibles)
for dom, key in [("com.apple.mobilesafari", "RemoteAutomationEnabled"), ("com.apple.mobilesafari", "WebDriverEnabled"),
                 ("com.apple.WebInspector", "RemoteAutomationEnabled"), ("com.apple.WebInspector", "Enabled"),
                 ("com.apple.mobilesafari", "WebKitDeveloperExtrasEnabledPreferenceKey")]:
    sh(f"xcrun simctl spawn {UDID} defaults write {dom} {key} -bool YES")
sh("sudo safaridriver --enable")
drv = subprocess.Popen(["safaridriver", "-p", "4444"], stdout=open(OUT + "/safaridriver.log", "w"), stderr=subprocess.STDOUT)
time.sleep(3)
try:
    caps = {"capabilities": {"alwaysMatch": {"browserName": "Safari", "platformName": "iOS",
                                             "safari:useSimulator": True, "safari:deviceUDID": UDID}}}
    try:
        s = req("POST", "/session", caps, timeout=180)
    except Exception as e:
        body = getattr(e, "read", lambda: b"")().decode(errors="replace")
        print("No se pudo abrir sesión WebDriver:", e, body[:800])
        sys.exit(2)
    sid = s["value"]["sessionId"]
    print("sesión", sid, json.dumps(s["value"].get("capabilities", {}))[:500])

    def js(code, args=None):
        return req("POST", f"/session/{sid}/execute/sync", {"script": code, "args": args or []})["value"]

    def wdfoto(nombre):
        try:
            png = req("GET", f"/session/{sid}/screenshot")["value"]
            open(f"{OUT}/{nombre}.png", "wb").write(base64.b64decode(png))
        except Exception as e:
            print("sin captura webdriver", nombre, e)

    req("POST", f"/session/{sid}/url", {"url": URL})
    time.sleep(6)
    js("window.__errs=[];addEventListener('error',function(e){__errs.push(String(e.message))});addEventListener('unhandledrejection',function(e){__errs.push('promesa: '+String(e.reason))});")
    info = js("""var d=document.createElement('div');d.style.cssText='position:fixed;top:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';document.body.appendChild(d);var cs=getComputedStyle(d);var r={ua:navigator.userAgent,ancho:innerWidth,alto:innerHeight,dpr:devicePixelRatio,anchoPagina:document.documentElement.scrollWidth,safeTop:cs.paddingTop,safeBottom:cs.paddingBottom,tema:document.documentElement.getAttribute('data-theme'),pestanas:[].map.call(document.querySelectorAll('#tabs button'),function(b){return b.textContent.trim()}).join('|'),supabase:typeof window.supabase,db:typeof DBX!=='undefined'&&!!DBX,rutasMoon:typeof routes!=='undefined'?routes.length:-1,viasMuro:typeof wroutes!=='undefined'?wroutes.length:-1,splash:(function(){var s=document.getElementById('splash');return s?getComputedStyle(s).opacity+'/'+getComputedStyle(s).display:'no'})()};d.remove();return r;""")
    print("INFO", json.dumps(info, ensure_ascii=False))
    open(OUT + "/sim-info.json", "w").write(json.dumps(info, ensure_ascii=False, indent=1))
    foto("sim-10-wd-muro"); wdfoto("sim-10-wd-muro-pagina")

    js("document.querySelector('#tabs [data-tab=\"tab\"]').click()"); time.sleep(1.5)
    foto("sim-11-wd-moon")
    js("document.querySelector('#themeToggle').click()"); time.sleep(1)
    foto("sim-12-wd-moon-claro")
    js("document.querySelector('#tabs [data-tab=\"mur\"]').click()"); time.sleep(1.5)
    foto("sim-13-wd-muro-claro")
    js("document.querySelector('#themeToggle').click()"); time.sleep(0.5)
    js("document.querySelector('#tabs [data-tab=\"grp\"]').click()"); time.sleep(1)
    foto("sim-14-wd-grupo")
    js("scrollTo(0,document.body.scrollHeight)"); time.sleep(1)
    foto("sim-15-wd-grupo-abajo")

    # modo crear (solo en el móvil): hace falta un nombre local para que deje entrar
    nombre_previo = js("return localStorage.getItem('olg-myname')")
    if not nombre_previo:
        js("localStorage.setItem('olg-myname','Simulador');localStorage.setItem('__simnombre','1')")
        req("POST", f"/session/{sid}/refresh", {}); time.sleep(6)
        js("window.__errs=window.__errs||[];addEventListener('error',function(e){__errs.push(String(e.message))});")
    for tab, nueva in [("mur", "#wnueva"), ("tab", "#nueva")]:
        js(f"document.querySelector('#tabs [data-tab=\"{tab}\"]').click()"); time.sleep(1)
        js(f"document.querySelector('{nueva}').click();scrollTo(0,0)"); time.sleep(1)
        if tab == "tab":
            res = js("""var ks=['C5','E8','G11'];ks.forEach(function(k){var c=document.querySelectorAll('#b circle[data-k="'+k+'"]');c[c.length-1].dispatchEvent(new MouseEvent('click',{bubbles:true}))});return JSON.stringify(cur)""")
        else:
            res = js("""var hs=[].slice.call(document.querySelectorAll('#wsvg path.hshape')).map(function(e){var r=e.getBoundingClientRect();return{e:e,y:r.y,x:r.x,w:r.width}}).filter(function(o){return o.w>12&&o.y>0&&o.y<innerHeight-160&&o.x>30&&o.x<innerWidth-60});hs.sort(function(a,b){return b.y-a.y});[0,Math.floor(hs.length*.4),Math.floor(hs.length*.8)].forEach(function(i){if(hs[i])hs[i].e.dispatchEvent(new MouseEvent('click',{bubbles:true}))});return JSON.stringify(wcur)""")
        print("presas marcadas (solo en pantalla)", tab, res)
        time.sleep(1)
        foto(f"sim-2{0 if tab == 'mur' else 1}-wd-crear-{tab}")
        bar = js(f"var e=document.querySelector('.selbar[data-for=\"{'w' if tab == 'mur' else 't'}\"]');var r=e.getBoundingClientRect();return {{top:r.top,bottom:r.bottom,alto:innerHeight,pb:getComputedStyle(e).paddingBottom}}")
        print("barra de abajo", tab, json.dumps(bar))
        # salir sin guardar
        js(f"document.querySelector('.selbar[data-for=\"{'w' if tab == 'mur' else 't'}\"] [data-px=\"{'wcancelar' if tab == 'mur' else 'cancelar'}\"]').click()"); time.sleep(0.6)
        js("var y=document.getElementById('cpyes');if(y&&!document.getElementById('cancelpop').hidden)y.click()"); time.sleep(0.6)
    if js("return localStorage.getItem('__simnombre')"):
        js("localStorage.removeItem('olg-myname');localStorage.removeItem('olg-yo');localStorage.removeItem('__simnombre')")
    print("ERRORES JS", json.dumps(js("return window.__errs||[]"), ensure_ascii=False))
    try:
        req("DELETE", f"/session/{sid}")
    except Exception:
        pass
finally:
    drv.terminate()
