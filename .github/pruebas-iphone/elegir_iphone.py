# Elige el iPhone más moderno disponible en el simulador (lee el JSON de "simctl list -j")
import json, re, sys

d = json.load(sys.stdin)["devices"]
mejor = None
for runtime, devs in d.items():
    m = re.search(r"iOS-(\d+)-(\d+)", runtime)
    if not m:
        continue
    ver = (int(m.group(1)), int(m.group(2)))
    for dev in devs:
        nom = dev.get("name", "")
        if not nom.startswith("iPhone") or not dev.get("isAvailable", True):
            continue
        num = re.search(r"iPhone (\d+)", nom)
        n = int(num.group(1)) if num else 0
        # preferimos el modelo "normal" (sin Pro/Max/Plus/SE) del iOS más nuevo
        normal = 1 if re.fullmatch(r"iPhone \d+", nom) else 0
        clave = (ver, normal, n)
        if mejor is None or clave > mejor[0]:
            mejor = (clave, dev["udid"])
print(mejor[1] if mejor else "")
