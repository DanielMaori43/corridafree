self.addEventListener('push', function(event) {
  const options = {
    body: event.data ? event.data.text() : 'Nova notificação',
    icon: 'images/icon.png',
    badge: 'images/badge.png'
  };

  event.waitUntil(
    self.registration.showNotification('Alerta de Caminhada', options)
  );
});
