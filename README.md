# maestro-harness

Harness **opt-in** para pruebas E2E con [Maestro](https://maestro.dev) en celulares Android reales. Agnóstico de proyecto, SO (mac/win/linux), dispositivo y red. Node ≥ 18, sin dependencias npm.

## Instalar en un proyecto (un comando)
```bash
cd mi-proyecto
npx github:nocolais-95/maestro-harness setup     # o: npx ./maestro-harness-0.1.0.tgz setup
```
`setup` revisa requisitos (Node 18+, Maestro, adb, Java) con el comando de instalación de lo que falte, detecta appId/scheme/Metro de tu `app.json`, crea `maestro-harness.json` y `test/maestro/` con un test de prueba, ofrece instalar la skill y agentes de Claude Code en `.claude/`, ofrece registrar el MCP de Maestro, explica cómo funciona y pregunta si querés correr el test de prueba ahora. `--yes` acepta todo sin preguntar (CI/scripts).

Uso diario sin instalar nada global: `npx github:nocolais-95/maestro-harness doctor|run …`. Con `npm link` (o `npm i -g`) queda como `mh`.

### Como plugin de Claude Code (alternativa)
```
/plugin marketplace add <git-url>
/plugin install maestro-harness@maestro-harness
```

### Compartirlo
- Por git: subir este repo y pasar el `npx github:…` de arriba.
- Sin git: `npm pack` genera `maestro-harness-0.1.0.tgz`; quien lo reciba corre `npx ./maestro-harness-0.1.0.tgz setup`.
- Registry: `npm publish` y quedaría `npx maestro-harness setup`.

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
