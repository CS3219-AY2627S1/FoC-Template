const container = document.querySelector('#services');
const message = document.querySelector('#message');
let busy = false;

async function api(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`Control request failed (${response.status})`);
  return response.json();
}

function render(services) {
  container.replaceChildren();
  for (const service of services) {
    const card = document.createElement('article');
    const title = document.createElement('h2');
    title.textContent = `${service.id}-service`;
    const route = document.createElement('code');
    route.textContent = service.route;
    const state = document.createElement('p');
    state.textContent = service.enabled ? 'Routing enabled' : 'Simulated outage · 503';
    state.className = service.enabled ? 'enabled' : 'disabled';
    const button = document.createElement('button');
    button.textContent = service.enabled ? 'Simulate outage' : 'Restore routing';
    button.setAttribute('aria-label', `${button.textContent} for ${service.id}-service`);
    button.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      container.querySelectorAll('button').forEach(b => { b.disabled = true; });
      try {
        await api(`/api/services/${service.id}`, {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({enabled: !service.enabled}),
        });
        await refresh();
        message.textContent = `${service.id}-service routing ${service.enabled ? 'disabled' : 'restored'}.`;
      } catch (error) {
        message.textContent = error.message;
      } finally {
        busy = false;
        container.querySelectorAll('button').forEach(b => { b.disabled = false; });
      }
    });
    card.append(title, route, state, button);
    container.append(card);
  }
}

async function refresh() {
  const result = await api('/api/services');
  render(result.services);
}
refresh().catch(error => { message.textContent = error.message; });
setInterval(() => {
  if (!busy) refresh().catch(error => { message.textContent = error.message; });
}, 5000);
