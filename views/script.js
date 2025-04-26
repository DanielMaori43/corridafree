// Definindo a chave pública Vapid
const publicVapidKey = 'BFdXjAtR3fgd2FWlhKUNdKS6kapmTVPolRw-vWvQKCreMsSh4sPAMwd7lnF5p5ZbdXYZ3JhhFsGDKFfKD2C2C7c';

// Função para converter base64 em Uint8Array
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const graficoCanvas = document.getElementById('meuGrafico').getContext('2d');
const tempoDecorridoElement = document.getElementById('tempo-decorrido');
const distanciaPercorridaElement = document.getElementById('distancia-percorrida');
const iniciarCaminhadaBotao = document.getElementById('iniciar-caminhada');
const pararCaminhadaBotao = document.getElementById('parar-caminhada');
const mapaContainer = document.getElementById('mapa-container');
const ritmoAtualElement = document.getElementById('ritmo-atual');
const feedbackElement = document.getElementById('feedback-mensagem');
const toggleAudioButton = document.getElementById('toggle-audio');

let startTime;
let previousPosition = null;
let totalDistance = 0;
let timerInterval;
let distanceData = [];
let timeData = [];
let pathCoordinates = [];
let meuGrafico;
let mapa;
let polyline;
let primeiraCoordenadaRecebida = false;
let ritmoInicial = null;
let tempoParado = 0;
let paradoDesde = null;
let audioAtivado = true;
let ritmoInicialRegistrado = false;
let ritmoDiminuiuAvisado = false;
const LIMIAR_VELOCIDADE = 0.1;
const TEMPO_LIMITE_PARADO = 120000;

//Função para n para a msg quando a tela estiver travada
if ("Notification" in window) {
    if (Notification.permission !== "granted") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                console.log("Permissão para notificações concedida!");
            } else {
                console.log("Permissão para notificações negada.");
            }
        });
    }
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(function(registration) {
      console.log('Service Worker registrado com sucesso:', registration);
      
      // Tente atualizar o service worker sempre que ele for registrado
      registration.update();

      // Verificar a inscrição do push
      registration.pushManager.getSubscription().then(function(subscription) {
        if (!subscription) {
          // Se o usuário não está inscrito, inscreva-o novamente
          subscribeUser(registration);
        } else {
          console.log('Usuário já inscrito:', subscription);
        }
      });

    }).catch(function(error) {
      console.log('Erro ao registrar o Service Worker:', error);
    });
}

function subscribeUser(registration) {
  registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(publicVapidKey)
  }).then(function(subscription) {
    console.log('Usuário inscrito:', subscription);
    // Enviar a inscrição para o servidor
    sendSubscriptionToServer(subscription);
  }).catch(function(err) {
    console.log('Erro ao inscrever o usuário:', err);
  });
}

function sendSubscriptionToServer(subscription) {
  fetch('/api/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(subscription)
  })
  .then(response => response.json())
  .then(data => {
    console.log('Inscrição enviada para o servidor:', data);
  })
  .catch(error => console.error('Erro ao enviar a inscrição para o servidor:', error));
}


// Verifica se o navegador suporta push notifications
if ('serviceWorker' in navigator && 'PushManager' in window) {
  navigator.serviceWorker.ready.then(function(registration) {
    registration.pushManager.getSubscription().then(function(subscription) {
      if (!subscription) {
        // Inscreve novamente caso o usuário não tenha uma inscrição válida
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(publicVapidKey)
        }).then(function(newSubscription) {
          // Envia a nova inscrição para o servidor
          sendSubscriptionToServer(newSubscription);
        });
      } else {
        // Envia a inscrição atual para o servidor
        sendSubscriptionToServer(subscription);
      }
    });
  });
}

// Função para exibir a notificação de caminhada
function notificarCaminhada(quantidade) {
    if (Notification.permission === "granted") {
        const notification = new Notification('Você já andou ' + quantidade + ' km!', {
            body: 'Continue assim, você está indo muito bem!',
            icon: '/images/icon.png',
            badge: '/images/badge.png'
        });
    }
}

// Exemplo de uso: chame esta função quando atingir 1 km
notificarCaminhada(1);

// Função para falar mensagens com o SpeechSynthesis
function falarMensagem(mensagem) {
    if ('speechSynthesis' in window && audioAtivado) {
        const utterance = new SpeechSynthesisUtterance(mensagem);
        window.speechSynthesis.speak(utterance);
    }
}

function iniciarCaminhada() {
    console.log("Iniciando caminhada...");

    startTime = Date.now();
    totalDistance = 0;
    previousPosition = null;
    distanceData = [];
    timeData = [];
    pathCoordinates = [];
    tempoDecorridoElement.textContent = '00:00:00';
    distanciaPercorridaElement.textContent = '0.00 km';
    ritmoAtualElement.textContent = '0:00';
    feedbackElement.textContent = '';
    ritmoInicial = null;
    paradoDesde = null;
    ritmoInicialRegistrado = false;
    ritmoDiminuiuAvisado = false;

    if (audioAtivado) falarMensagem("Caminhada iniciada!");
    inicializarGrafico();
    inicializarMapa(-20.0, -45.0);

    watchId = navigator.geolocation.watchPosition(atualizarLocalizacao, tratarErro, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
    });

    timerInterval = setInterval(atualizarTempo, 1000);
    iniciarCaminhadaBotao.disabled = true;
    pararCaminhadaBotao.disabled = false;
}

function atualizarGrafico(timestamp) {
    distanceData.push(totalDistance);
    timeData.push(timestamp);
    meuGrafico.data.labels = Array.from({ length: distanceData.length }, (_, i) => i + 1);
    meuGrafico.data.datasets[0].data = distanceData;
    meuGrafico.update();
}

function pararCaminhada() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        clearInterval(timerInterval);
        iniciarCaminhadaBotao.disabled = false;
        pararCaminhadaBotao.disabled = true;

        const tempo = tempoDecorridoElement.textContent;
        const distancia = totalDistance.toFixed(2);
        const ritmo = ritmoAtualElement.textContent;

        fetch('/api/historico', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: new Date().toISOString(),
                distancia,
                tempo,
                ritmo
            })
        })
        .then(res => {
            if (res.ok) {
                feedbackElement.textContent = "✅ Caminhada salva no histórico!";
                carregarHistorico();
            } else {
                feedbackElement.textContent = "❌ Erro ao salvar caminhada.";
            }
        });

        if (audioAtivado) falarMensagem(`Caminhada finalizada. Distância total percorrida: ${distancia} quilômetros.`);
        desenharRotaNoMapa();
    }
}

function atualizarLocalizacao(position) {
    const { latitude, longitude } = position.coords;
    const timestamp = position.timestamp;

    pathCoordinates.push([latitude, longitude]);

    if (!primeiraCoordenadaRecebida && mapa) {
        mapa.setView([latitude, longitude], 15);
        primeiraCoordenadaRecebida = true;
    }

    let velocidadeAtual = 0;
    if (position.coords.speed !== null) {
        velocidadeAtual = position.coords.speed * 3.6;
    }

    if (velocidadeAtual < LIMIAR_VELOCIDADE) {
        if (paradoDesde === null) {
            paradoDesde = Date.now();
        } else if (Date.now() - paradoDesde > TEMPO_LIMITE_PARADO) {
            falarMensagem("Você está parado há algum tempo. Tudo bem?");
            paradoDesde = null;
        }
    } else {
        paradoDesde = null;
    }

    if (previousPosition) {
        const distance = calcularDistancia(previousPosition.latitude, previousPosition.longitude, latitude, longitude);
        totalDistance += distance;

        const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        let ritmo = '0:00';
        if (totalDistance > 0) {
            const segundosPorKm = elapsedTime / totalDistance;
            const minutos = Math.floor(segundosPorKm / 60);
            const segundos = Math.floor(segundosPorKm % 60);
            ritmo = `${minutos}:${String(segundos).padStart(2, '0')}`;
        }

        ritmoAtualElement.textContent = ritmo;
    }

    previousPosition = { latitude, longitude };
    distanciaPercorridaElement.textContent = totalDistance.toFixed(2) + ' km';

    atualizarGrafico(timestamp);
    atualizarMapaComNovaCoordenada(latitude, longitude);
}

function tratarErro(error) {
    console.warn('Erro ao obter localização:', error.message);
}

function atualizarTempo() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    tempoDecorridoElement.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function inicializarGrafico() {
    if (meuGrafico) meuGrafico.destroy();
    meuGrafico = new Chart(graficoCanvas, {
        type: 'line',
        data: {
            labels: Array.from({ length: distanceData.length }, (_, i) => i + 1),
            datasets: [{
                label: 'Distância (km)',
                data: distanceData,
                borderColor: '#bb86fc',
                backgroundColor: 'rgba(187, 134, 252, 0.2)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'Número de Leituras', color: '#e0e0e0' }, ticks: { color: '#9e9e9e' }, grid: { color: '#373737' } },
                y: { title: { display: true, text: 'Distância (km)', color: '#e0e0e0' }, ticks: { color: '#9e9e9e' }, grid: { color: '#373737' } }
            }
        }
    });
}

function inicializarMapa(lat, lon) {
    if (mapa) mapa.remove();
    mapa = L.map(mapaContainer).setView([lat, lon], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapa);

    polyline = L.polyline([], { color: 'blue' }).addTo(mapa);
}

function atualizarMapaComNovaCoordenada(lat, lon) {
    if (polyline) {
        polyline.addLatLng([lat, lon]);
    }
    mapa.setView([lat, lon], 15);
}

toggleAudioButton.addEventListener('click', function() {
    audioAtivado = !audioAtivado;
    toggleAudioButton.textContent = audioAtivado ? "🔊" : "🔇";
});
