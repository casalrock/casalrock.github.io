#!/bin/bash
# Abre la app en el simulador de iPhone (Safari de verdad) y hace capturas.
# Solo mirar: no se guarda nada en la base de datos real.
set -u
OUT="$1"; mkdir -p "$OUT"
DIR="$(cd "$(dirname "$0")" && pwd)"
PRUEBA="https://casalrock.github.io/prueba/"
REAL="https://casalrock.github.io/"

xcodebuild -version > "$OUT/xcode.txt" 2>&1 || true
xcrun simctl list devices available > "$OUT/simuladores.txt" 2>&1
UDID=$(xcrun simctl list devices available -j | python3 "$DIR/elegir_iphone.py")
echo "Simulador elegido: $UDID" | tee -a "$OUT/simulador.log"
[ -z "$UDID" ] && { echo "No hay ningún iPhone en el simulador"; exit 1; }
NOMBRE=$(xcrun simctl list devices available | grep "$UDID" | sed 's/ (.*//; s/^ *//')
echo "$NOMBRE" > "$OUT/iphone.txt"

xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b >> "$OUT/simulador.log" 2>&1 || true
xcrun simctl ui "$UDID" appearance dark || true
# hora y batería "bonitas" en la barra de arriba
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 || true
open -a Simulator --args -CurrentDeviceUDID "$UDID" || true
sleep 5

foto() { xcrun simctl io "$UDID" screenshot "$OUT/$1.png" >> "$OUT/simulador.log" 2>&1 || echo "sin foto $1" | tee -a "$OUT/simulador.log"; }

# 1) app de prueba
xcrun simctl openurl "$UDID" "$PRUEBA"
sleep 3;  foto sim-01-prueba-splash
sleep 12; foto sim-02-prueba-inicio
sleep 10; foto sim-03-prueba-inicio-30s

# 2) app real
xcrun simctl openurl "$UDID" "$REAL"
sleep 15; foto sim-04-real-inicio

# 3) extra: manejar Safari del simulador con WebDriver (si se deja), solo cosas locales
if timeout 300 python3 "$DIR/sim_webdriver.py" "$UDID" "$OUT" >> "$OUT/webdriver.log" 2>&1; then
  echo "WebDriver: OK" | tee -a "$OUT/simulador.log"
else
  echo "WebDriver: no disponible (ver webdriver.log)" | tee -a "$OUT/simulador.log"
fi
exit 0
