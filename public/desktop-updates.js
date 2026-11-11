const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

export function desktopUpdates({invoke, restartButton, beforeInstall, notify}) {
  let result = {status: 'idle'};
  let checking = false, installing = false, error = '', panel;

  function render() {
    const ready = result.status === 'ready';
    const busy = installing || checking;
    restartButton.hidden = !ready;
    restartButton.disabled = busy;
    restartButton.textContent = installing ? 'Installing update…' : 'Restart to update';
    if (!panel?.isConnected) return;
    panel.hidden = result.status === 'disabled';
    panel.querySelector('[data-update-status]').textContent = error || (
      installing ? 'Installing update…' :
      checking ? 'Checking for updates and downloading if available…' :
      ready ? `Version ${result.version} is ready. Restart when you’re done working.` :
      result.status === 'current' ? 'Fikr Vox is up to date.' :
      'Updates download automatically while Fikr Vox is open.'
    );
    const button = panel.querySelector('button');
    button.disabled = busy;
    button.textContent = ready ? restartButton.textContent : 'Check for updates';
  }

  async function check() {
    if (checking || installing || result.status === 'disabled') return;
    checking = true;
    error = '';
    render();
    try {
      result = await invoke('stage_desktop_update');
    } catch {
      error = 'Could not check for or download updates. Try again in a moment.';
    } finally {
      checking = false;
      render();
    }
  }

  async function install() {
    if (installing || checking || result.status !== 'ready') return;
    installing = true;
    error = '';
    render();
    try {
      await beforeInstall();
    } catch {
      error = 'Could not save your work. Save it before restarting.';
    }
    if (!error) {
      try {
        await invoke('install_desktop_update');
        return;
      } catch {
        error = 'Could not install the update. Make sure Fikr Vox is in a writable Applications folder and try again.';
      }
    }
    installing = false;
    render();
    notify(error);
  }

  restartButton.onclick = install;
  return {
    start() {
      setTimeout(async () => {
        await check();
        if (result.status !== 'disabled') setInterval(check, CHECK_INTERVAL);
      }, 4000);
    },
    mount(host) {
      panel = host;
      panel.innerHTML = '<div class="settings-card"><div class="about-info-row"><div><strong>Software updates</strong><p data-update-status role="status"></p></div><button type="button"></button></div></div>';
      panel.querySelector('button').onclick = () => result.status === 'ready' ? install() : check();
      render();
    }
  };
}
