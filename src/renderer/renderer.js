const $ = (id) => document.getElementById(id);
const text = $('text');
const updateBtn = $('update-btn');

window.clippy.getVersion().then((v) => { $('version').textContent = `v${v}`; });

$('check-btn').onclick = () => window.clippy.checkForUpdates();
$('quit-btn').onclick = () => window.clippy.quit();
updateBtn.onclick = () => window.clippy.installUpdate();

window.clippy.onUpdateStatus((s) => {
  updateBtn.hidden = s.state !== 'ready';
  switch (s.state) {
    case 'checking':    text.textContent = 'Looking for updates...'; break;
    case 'available':   text.textContent = `Update v${s.version} found, downloading...`; break;
    case 'downloading': text.textContent = `Downloading update: ${s.percent}%`; break;
    case 'ready':       text.textContent = `v${s.version} is ready. Restart to install.`; break;
    case 'none':        text.textContent = "You're up to date."; break;
    case 'dev':         text.textContent = s.message; break;
    case 'error':       text.textContent = `Update error: ${s.message}`; break;
  }
});
