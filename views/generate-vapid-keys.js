
const webpush = require('web-push');

// Gerar as chaves VAPID
const vapidKeys = webpush.generateVAPIDKeys();

// Exibir as chaves no console para que você as copie
console.log(vapidKeys);
