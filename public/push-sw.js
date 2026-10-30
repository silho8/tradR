self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || 'You have a new update from tradR.' }; }
  const title = payload.title || 'tradR update';
  const options = { body: payload.body || 'There is something new waiting for you.', icon: '/tradr-mark.svg', badge: '/tradr-mark.svg', tag: payload.tag || 'tradr-update', data: { url: payload.url || '/activity' }, renotify: true };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => 'focus' in client);
    if (existing) { existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});
