const status = document.querySelector('#service-status');
const feedback = document.querySelector('#form-feedback');
const interest = document.querySelector('#interest-form');
const subscribe = document.querySelector('#subscribe-form');
const result = document.querySelector('#interest-result');
let apiBase = null;

interest.addEventListener('submit', event => {
  event.preventDefault();
  const choice = interest.elements.interest.value;
  const labels = { free: 'kostenlose Ausgabe', annual: 'Civic Plus für CHF 60/Jahr', monthly: 'Civic Plus für CHF 6/Monat' };
  const body = `Guten Tag\n\nIch interessiere mich für ${labels[choice]}. Bitte informieren Sie mich, wenn das Angebot startet.\n\nMir ist bewusst: Dies ist nur eine Interessensmeldung, keine Newsletter-Anmeldung, keine bezahlte Mitgliedschaft und keine Zahlung.\n\nFreundliche Grüsse`;
  document.querySelector('#interest-mail').href = `mailto:info@errandom.com?subject=${encodeURIComponent('errandom Civic: Interesse')}&body=${encodeURIComponent(body)}`;
  result.hidden = false;
});
interest.addEventListener('change', () => { result.hidden = true; });
document.querySelector('#plus-action').addEventListener('click', () => {
  if (!apiBase) { interest.elements.interest.value = 'annual'; result.hidden = true; }
});
subscribe.addEventListener('submit', async event => {
  event.preventDefault();
  if (!apiBase || !subscribe.reportValidity()) return;
  const button = subscribe.querySelector('button');
  button.disabled = true;
  feedback.textContent = '';
  try {
    const response = await fetch(`${apiBase}/api/subscribe`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: subscribe.elements.email.value.trim(), consent: subscribe.elements.consent.checked })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Die Anmeldung konnte nicht gestartet werden.');
    feedback.textContent = 'Die Bestätigungs-E-Mail wurde vom Versanddienst angenommen. Öffnen Sie ihren Link; Ihre Anmeldung ist noch nicht bestätigt.';
  } catch (error) {
    console.error('Civic signup failed:', error);
    feedback.textContent = `Anmeldung nicht abgeschlossen: ${error.message}`;
  } finally { button.disabled = false; }
});

async function loadServices() {
  try {
    const response = await fetch('/civic/config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Service-Konfiguration nicht verfügbar.');
    const config = await response.json();
    if (!config.apiBase) return;
    const url = new URL(config.apiBase);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Ungültige API-Adresse.');
    apiBase = config.apiBase.replace(/\/$/, '');
    const health = await fetch(`${apiBase}/api/health`, { cache: 'no-store' });
    if (!health.ok) throw new Error('Der Anmeldedienst antwortet nicht.');
    const readiness = await health.json();
    if (readiness.emailReady) {
      subscribe.hidden = false;
      interest.hidden = true;
      status.textContent = readiness.billingReady
        ? 'Kostenlos per E-Mail dabei sein oder im persönlichen Zugang bewusst Civic Plus wählen. Die kostenlose Anmeldung startet kein kostenpflichtiges Abo.'
        : 'Die kostenlose E-Mail-Anmeldung ist verbunden. Civic Plus ist noch nicht für Zahlungen freigeschaltet.';
    } else {
      apiBase = null;
      status.textContent = 'E-Mail-Versand ist noch nicht verbunden. Eine Interessensmeldung per E-Mail bleibt möglich.';
    }
    if (readiness.billingReady) {
      const action = document.querySelector('#plus-action');
      action.href = '/civic/account/?plan=annual';
      action.textContent = 'Civic Plus im persönlichen Zugang wählen';
    }
  } catch (error) {
    apiBase = null;
    console.error('Civic service status failed:', error);
    status.textContent = 'Der automatische Anmeldedienst ist derzeit nicht verfügbar. Nutzen Sie die Interessensmeldung; sie startet weder ein Abo noch eine Zahlung.';
  }
}
async function sourceStatus() {
  const target = document.querySelector('#source-status');
  try {
    const response = await fetch('/civic/source-status.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Quellenstatus nicht verfügbar.');
    const report = await response.json();
    const checked = Date.parse(report.checkedAt);
    if (!Number.isFinite(checked) || checked > Date.now() + 60000) throw new Error('Ungültiger Prüfzeitpunkt.');
    const stale = Date.now() - checked > 48 * 3600000;
    const failures = report.results.filter(item => item.state !== 'available').length;
    const registryResponse = await fetch('/civic/sources.json', { cache: 'no-store' });
    if (!registryResponse.ok) throw new Error('Quellenregister nicht verfügbar.');
    const registry = await registryResponse.json();
    const changed = registry.filter(source => source.reviewedHash && report.results.some(item =>
      item.id === source.id && item.state === 'available' && item.hash !== source.reviewedHash)).length;
    const stamp = new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(checked);
    target.textContent = `Quellen zuletzt abgerufen: ${stamp}. ${stale ? 'Prüfung überfällig. ' : ''}${failures ? `${failures} Quelle(n) derzeit nicht abrufbar. ` : ''}${changed ? `${changed} Quelle(n) seit der Freigabe geändert; eine erneute Prüfung ist nötig. ` : ''}Ein Quellenabruf ist keine redaktionelle Freigabe.`;
  } catch (error) {
    console.error('Civic source status failed:', error);
    target.textContent = 'Quellenstatus derzeit nicht prüfbar. Die amtlichen Links bleiben verfügbar; wir behaupten keine aktuelle redaktionelle Freigabe.';
  }
}
loadServices();
sourceStatus();
document.querySelector('#interest-form').hidden = false;
