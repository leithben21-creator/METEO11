/* Après « npx cap add android » : icônes, couleurs de barre système, version.  Idempotent. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
if (!fs.existsSync(res)) { console.error('android/ introuvable — lancer « npx cap add android » d\'abord'); process.exit(1); }

// 1) icônes (classique + ronde + premier plan adaptatif) et fond adaptatif
const src = path.join(root, 'resources', 'android-icons');
for (const d of fs.readdirSync(src)) {
  const to = path.join(res, d); fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(path.join(src, d))) fs.copyFileSync(path.join(src, d, f), path.join(to, f));
}
const valDir = path.join(res, 'values'); fs.mkdirSync(valDir, { recursive: true });
fs.writeFileSync(path.join(valDir, 'ic_launcher_background.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B1226</color>\n</resources>\n');

// 1b) écran de démarrage (remplace celui de Capacitor)
const spl = path.join(root, 'resources', 'splash');
if (fs.existsSync(spl)) for (const d of fs.readdirSync(spl)) {
  const to = path.join(res, d); fs.mkdirSync(to, { recursive: true });
  fs.copyFileSync(path.join(spl, d, 'splash.png'), path.join(to, 'splash.png'));
}

// 2) barre d'état / navigation sombres
const stylesP = path.join(valDir, 'styles.xml');
if (fs.existsSync(stylesP)) {
  let s = fs.readFileSync(stylesP, 'utf8');
  const add = '        <item name="android:statusBarColor">#0B1226</item>\n        <item name="android:navigationBarColor">#0B1226</item>\n        <item name="android:windowBackground">#0B1226</item>\n';
  if (!s.includes('statusBarColor')) s = s.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, '$1\n' + add);
  fs.writeFileSync(stylesP, s);
}

// 3) version (numéro de build GitHub)
const gp = path.join(root, 'android', 'app', 'build.gradle');
if (fs.existsSync(gp)) {
  let g = fs.readFileSync(gp, 'utf8');
  const code = parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10);
  g = g.replace(/versionCode\s+\d+/, 'versionCode ' + code).replace(/versionName\s+"[^"]*"/, 'versionName "1.0.' + code + '"');
  fs.writeFileSync(gp, g);
}
console.log('prepare-android : OK');
