# maestro-harness

Harness **opt-in** para pruebas E2E con [Maestro](https://maestro.dev) en celulares Android reales. Agnóstico de proyecto, SO (mac/win/linux), dispositivo y red. Node ≥ 18, sin dependencias npm.

## Instalar
```bash
# 1. Maestro + adb (platform-tools) + Node 18+
# 2. Como plugin de Claude Code
/plugin marketplace add <git-url-de-este-repo>
/plugin install maestro-harness@maestro-harness
# 3. CLI (opcional): npm link   # expone `mh`
```
En el proyecto: `mh init`, editar `maestro-harness.json`, `mh doctor`.

## Qué resuelve
- **Dispositivo:** USB primero; si no, recupera por wifi (última IP → mDNS → escaneo de subred), verificando identidad por serial. Cambiar de red no requiere configurar nada.
- **Perfiles OEM** (`profiles/*.json`): quirks por fabricante (MIUI: `--no-reinstall-driver`, ajustes de seguridad). Agregá un JSON para otro fabricante.
- **Metro/dev client:** `adb reverse` + `${DEV_CLIENT_URL}`; no depende de la IP del host.
- **Comunes mobile:** `common:wifi-off-recovery`, `airplane-mode`, `rotate`, `background-resume`, `cold-start-loop`, `rapid-taps-stress`, `scroll-stress`.
- **Reporte corto** (≤15 líneas) pensado para gastar pocos tokens.

## Separación general / específico
General = este repo. Específico del proyecto = `maestro-harness.json` + `test/maestro/`. Específico del dispositivo = `profiles/`.

## Estado
Verificado en macOS con Redmi Note 7 (MIUI). Windows/Linux: implementado sin dependencias de bash/perl pero **sin probar**. iOS: fuera de alcance por ahora.
