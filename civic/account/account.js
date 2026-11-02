const status = document.querySelector('#account-status');
let apiBase;
async function api(path, body) {
  const response = await fetch(`${apiBase}/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'include',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Der Zugang konnte nicht aktualisiert werden.');
  return data;
}
async function account() {
  const data = await api('account');
  document.querySelector('#login-panel').hidden = true;
  document.querySelector('#member-panel').hidden = false;
  document.querySelector('#newsletter').checked = data.newsletter;
  document.querySelector('#portal').hidden = !data.portalReady;
  document.querySelector('#packet').hidden = !data.paid;
  document.querySelector('#dossier').hidden = !data.paid;
  clearDossier();
  document.querySelector('#upgrade-panel').hidden = data.paid || !data.billingReady;
  document.querySelector('#membership-status').textContent = data.paid
    ? `Civic Plus aktiv bis ${new Intl.DateTimeFormat('de-CH').format(new Date(data.paidUntil * 1000))}.${data.cancelAtEnd ? ' Die Verlängerung ist gekündigt.' : ''}`
    : 'Kostenloser Zugang. Keine aktive Civic Plus-Mitgliedschaft bestätigt.';
  status.textContent = `Angemeldet: ${data.email}`;
}
async function action(button, callback) {
  button.disabled = true;
  try { await callback(); } catch (error) {
    console.error('Civic account action failed:', error);
    status.textContent = `Nicht abgeschlossen: ${error.message}`;
  } finally { button.disabled = false; }
}
function clearDossier() {
  document.querySelector('#dossier-panel').hidden = true;
  document.querySelector('#dossier-content').replaceChildren();
}
function textNode(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
document.querySelector('#dossier').addEventListener('click', event => action(event.currentTarget, async () => {
  clearDossier();
  const data = await api('dossier');
  const content = document.createDocumentFragment();
  content.append(textNode('p', `${data.date} · Version ${data.version} · Geprüft: ${new Intl.DateTimeFormat('de-CH', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(data.reviewedAt))}`), textNode('p', data.subscriber.introduction));
  for (const dossier of data.subscriber.dossiers) {
    const proposal = data.proposals.find(item => item.id === dossier.proposal);
    const article = document.createElement('article');
    article.className = 'card';
    article.append(textNode('h3', proposal.title), textNode('p', proposal.question));
    for (const section of dossier.sections) {
      const claim = proposal.claims.find(item => item.id === section.claim);
      const source = data.sources.find(item => item.id === claim.source);
      const url = new URL(source.url);
      if (url.protocol !== 'https:' || url.hostname !== 'www.admin.ch' || url.username || url.password) {
        throw new Error('Ungültige Quellenadresse im Dossier.');
      }
      const detail = document.createElement('details');
      detail.open = true;
      const link = textNode('a', `Öffentliche Ausgangsaussage: ${claim.id}`);
      link.href = `/civic/#quelle-${encodeURIComponent(claim.id)}`;
      const citation = textNode('a', source.title);
      citation.href = url.href;
      detail.append(textNode('summary', section.title), textNode('p', section.type), textNode('p', section.text),
        textNode('p', `Grenze der Analyse: ${section.uncertainty}`),
        textNode('p', `Öffentliche Ausgangsaussage: ${claim.text}`), citation,
        textNode('p', `Fundstelle: ${claim.passage} · Einordnung: ${claim.uncertainty}`), link);
      article.append(detail);
    }
    article.append(textNode('h4', 'Ihr Entscheidungsblatt'));
    const questions = document.createElement('ul');
    for (const question of dossier.questions) questions.append(textNode('li', question));
    article.append(questions, textNode('p', 'Notieren Sie Ihre Abwägung für sich oder auf dem Ausdruck. Ihre Antworten werden hier nicht erfasst.'));
    content.append(article);
  }
  document.querySelector('#dossier-title').textContent = data.subscriber.title;
  document.querySelector('#dossier-content').replaceChildren(content);
  document.querySelector('#dossier-panel').hidden = false;
  document.querySelector('#dossier-title').focus();
  status.textContent = 'Ihre freigegebene Plus-Ausgabe ist geöffnet.';
}));
document.querySelector('#login-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  action(form.querySelector('button'), async () => {
    await api('login', { email: form.elements.email.value.trim() });
    status.textContent = 'Der Anmeldelink wurde vom Versanddienst angenommen. Öffnen Sie ihn innerhalb von 30 Minuten.';
  });
});
document.querySelector('#checkout-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  action(form.querySelector('button'), async () => {
    const data = await api('checkout', { plan: form.elements.plan.value, acceptTerms: form.elements.terms.checked });
    if (!data.url?.startsWith('https://checkout.stripe.com/')) throw new Error('Ungültige Zahlungsadresse.');
    window.location.assign(data.url);
  });
});
document.querySelector('#portal').addEventListener('click', event => action(event.currentTarget, async () => {
  const data = await api('portal', {});
  if (!data.url?.startsWith('https://billing.stripe.com/')) throw new Error('Ungültige Abrechnungsadresse.');
  window.location.assign(data.url);
}));
document.querySelector('#packet').addEventListener('click', event => action(event.currentTarget, async () => {
  const response = await fetch(`${apiBase}/api/packet`, { credentials: 'include' });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error ?? 'Druckpaket nicht verfügbar.');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = 'civic-plus-abstimmungspaket.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  status.textContent = 'Druckpaket heruntergeladen. Öffnen Sie die HTML-Datei und nutzen Sie die Druckfunktion Ihres Browsers.';
}));
document.querySelector('#save-preferences').addEventListener('click', event => action(event.currentTarget, async () => {
  const data = await api('preferences', { newsletter: document.querySelector('#newsletter').checked });
  status.textContent = data.newsletter ? 'E-Mail-Ausgaben aktiviert.' : 'E-Mail-Ausgaben abbestellt. Eine bezahlte Mitgliedschaft bleibt unverändert.';
}));
document.querySelector('#logout').addEventListener('click', event => action(event.currentTarget, async () => {
  await api('logout', {});
  clearDossier();
  document.querySelector('#member-panel').hidden = true;
  document.querySelector('#login-panel').hidden = false;
  status.textContent = 'Abgemeldet.';
}));
async function init() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = fragment.get('token');
  history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    const response = await fetch('/civic/config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Service-Konfiguration nicht verfügbar.');
    const config = await response.json();
    if (!config.apiBase) {
      status.textContent = 'Der persönliche Zugang und die Bezahlung sind noch nicht verbunden. Nutzen Sie die kostenlose Ausgabe oder melden Sie Ihr Interesse auf der Startseite.';
      return;
    }
    const url = new URL(config.apiBase);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Ungültige Service-Adresse.');
    apiBase = config.apiBase.replace(/\/$/, '');
    const health = await api('health');
    document.querySelector('#login-panel').hidden = !health.emailReady;
    const plan = new URLSearchParams(window.location.search).get('plan');
    if (['monthly', 'annual'].includes(plan)) document.querySelector('#plan').value = plan;
    if (accessToken) await api('confirm', { token: accessToken });
    else {
      const response = await fetch(`${apiBase}/api/account`, { credentials: 'include' });
      if (response.status === 401) {
        status.textContent = health.emailReady
          ? 'Fordern Sie einen Anmeldelink an. Die öffentliche Ausgabe ist ohne Konto verfügbar.'
          : 'Neue E-Mail-Anmeldungen sind derzeit nicht verfügbar. Die öffentliche Ausgabe bleibt kostenlos; bei Abrechnungsfragen kontaktieren Sie info@errandom.com.';
        return;
      }
      if (!response.ok) throw new Error('Der persönliche Zugang antwortet nicht.');
    }
    await account();
  } catch (error) {
    console.error('Civic account initialization failed:', error);
    status.textContent = `Zugang nicht abgeschlossen: ${error.message}`;
  }
}
window.addEventListener('hashchange', () => {
  if (new URLSearchParams(window.location.hash.slice(1)).has('token')) init();
});
init();
