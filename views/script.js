// Seletores de elementos da interface
const graficoCanvas = document.getElementById('meuGrafico').getContext('2d');
const tempoDecorridoElement = document.getElementById('tempo-decorrido');
const distanciaPercorridaElement = document.getElementById('distancia-percorrida');
const iniciarCaminhadaBotao = document.getElementById('iniciar-caminhada');
const pararCaminhadaBotao = document.getElementById('parar-caminhada');
const mapaContainer = document.getElementById('mapa-container');
const ritmoAtualElement = document.getElementById('ritmo-atual');
const feedbackElement = document.getElementById('feedback-mensagem');
const toggleAudioButton = document.getElementById('toggle-audio');
// const cron = require("node-cron"); // (Parece não utilizado aqui, pode ser removido)

// Variáveis de controle da caminhada
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

// Constantes para detecção de parada
const LIMIAR_VELOCIDADE = 0.1; // em m/s
const TEMPO_LIMITE_PARADO = 120000; // 2 minutos

// Solicita permissão para enviar notificações ao usuário
if ("Notification" in window) {
    if (Notification.permission !== "granted") {
        Notification.requestPermission().then(permission => {
            console.log("Permissão para notificações:", permission);
        });
    }
}

// Registro do Service Worker para notificações push
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(registration => {
      console.log('Service Worker registrado com sucesso:', registration);
      registration.update(); // Força atualização
    }).catch(error => {
      console.log('Erro ao registrar Service Worker:', error);
    });
}

// Inicializa e verifica inscrição em notificações push
function iniciarRegistroServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker registrado:', registration);
                registration.update();
                verificarPushSubscription(registration);
            })
            .catch(error => console.log('Erro ao registrar SW:', error));
    }
}

// Verifica se o usuário já está inscrito no Push Notification
function verificarPushSubscription(registration) {
    registration.pushManager.getSubscription().then(subscription => {
        if (!subscription) {
            subscribeUser(registration);
        } else {
            sendSubscriptionToServer(subscription);
        }
    });
}

// Realiza inscrição em notificações push
function subscribeUser(registration) {
  registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(publicVapidKey)
  }).then(subscription => {
    localStorage.setItem('pushSubscription', JSON.stringify(subscription));
    sendSubscriptionToServer(subscription);
  }).catch(err => console.log('Erro ao inscrever:', err));
}

// Recupera inscrição salva localmente
const savedSubscription = localStorage.getItem('pushSubscription');
if (savedSubscription) {
  sendSubscriptionToServer(JSON.parse(savedSubscription));
}

// Envia inscrição ao backend
function sendSubscriptionToServer(subscription) {
    fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
    })
    .then(res => res.json())
    .then(data => console.log('Inscrição enviada:', data))
    .catch(error => console.error('Erro ao enviar inscrição:', error));
}

// Exibe notificação de motivação com a distância
function notificarCaminhada(quantidade) {
    if (Notification.permission === "granted") {
        new Notification(`Você já andou ${quantidade} km!`, {
            body: 'Continue assim, você está indo muito bem!',
            icon: '/images/icon.png',
            badge: '/images/badge.png'
        });
    }
}

// Fala uma mensagem usando síntese de voz
function falarMensagem(mensagem) {
    if ('speechSynthesis' in window && audioAtivado) {
        console.log("Falando:", mensagem);  // <== Adicione isto
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(mensagem));
    }
}

// Inicia a caminhada: reinicia dados e ativa rastreamento
function iniciarCaminhada() {
  console.log("Iniciando caminhada...");
  // Reset de variáveis
  startTime = Date.now();
  totalDistance = 0;
  previousPosition = null;
  distanceData = [];
  timeData = [];
  pathCoordinates = [];
  ritmoInicial = null;
  paradoDesde = null;
  ritmoInicialRegistrado = false;
  ritmoDiminuiuAvisado = false;

  // Zera visualmente a interface
  tempoDecorridoElement.textContent = '00:00:00';
  distanciaPercorridaElement.textContent = '0.00 km';
  ritmoAtualElement.textContent = '0:00';
  feedbackElement.textContent = '';

  if (audioAtivado) falarMensagem("Caminhada iniciada!");

  // Centraliza mapa no local atual
  navigator.geolocation.getCurrentPosition(pos => {
    mapa.setView([pos.coords.latitude, pos.coords.longitude], 15);
  });

  // Começa a rastrear a posição
  watchId = navigator.geolocation.watchPosition(atualizarLocalizacao, tratarErro, {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0
  });

  // Inicia o cronômetro
  timerInterval = setInterval(atualizarTempo, 1000);

  // Atualiza estado dos botões
  iniciarCaminhadaBotao.disabled = true;
  pararCaminhadaBotao.disabled = false;
}

// Atualiza o gráfico com a distância ao longo do tempo
function atualizarGrafico(timestamp) {
    distanceData.push(totalDistance);
    timeData.push(timestamp);
    meuGrafico.data.labels = Array.from({ length: distanceData.length }, (_, i) => i + 1);
    meuGrafico.data.datasets[0].data = distanceData;
    meuGrafico.update();
}

// Finaliza a caminhada e salva no backend
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
        }).then(res => {
            if (res.ok) {
                feedbackElement.textContent = "✅ Caminhada salva no histórico!";
                carregarHistorico();
                salvarImagemDoMapa();
            } else {
                feedbackElement.textContent = "❌ Erro ao salvar caminhada.";
            }
        });

        if (audioAtivado) falarMensagem(`Caminhada finalizada. Distância total percorrida: ${distancia} quilômetros.`);
        desenharRotaNoMapa();
    }
}

// Atualiza localização do usuário e calcula distância, ritmo e feedback
function atualizarLocalizacao(position) {
    const { latitude, longitude } = position.coords;
    const timestamp = position.timestamp;

    pathCoordinates.push([latitude, longitude]);

    if (!primeiraCoordenadaRecebida && mapa) {
        mapa.setView([latitude, longitude], 15);
        primeiraCoordenadaRecebida = true;
    }

    // Detecta se o usuário está parado por muito tempo
    const velocidadeAtual = position.coords.speed !== null ? position.coords.speed * 3.6 : 0;
    if (velocidadeAtual < LIMIAR_VELOCIDADE) {
        if (!paradoDesde) paradoDesde = Date.now();
        else if (Date.now() - paradoDesde > TEMPO_LIMITE_PARADO) {
            falarMensagem("Você está parado há algum tempo. Tudo bem?");
            paradoDesde = null;
        }
    } else {
        paradoDesde = null;
    }

    // Calcula distância percorrida desde o último ponto
    if (previousPosition) {
        const distancia = calcularDistancia(previousPosition.latitude, previousPosition.longitude, latitude, longitude);
        totalDistance += distancia;

        const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        const segundosPorKm = totalDistance > 0 ? elapsedTime / totalDistance : 0;
        const minutos = Math.floor(segundosPorKm / 60);
        const segundos = Math.floor(segundosPorKm % 60);
        ritmoAtualElement.textContent = `${minutos}:${String(segundos).padStart(2, '0')}`;
    }

    previousPosition = { latitude, longitude };
    distanciaPercorridaElement.textContent = `${totalDistance.toFixed(2)} km`;

    atualizarGrafico(timestamp);
    atualizarMapaComNovaCoordenada(latitude, longitude);
}

// Lida com erro de geolocalização
function tratarErro(error) {
    console.warn('Erro ao obter localização:', error.message);
}

// Atualiza o tempo decorrido
function atualizarTempo() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    tempoDecorridoElement.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Calcula distância entre dois pontos (fórmula de Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Inicializa o gráfico da caminhada
function inicializarGrafico() {
    if (meuGrafico) meuGrafico.destroy();
    meuGrafico = new Chart(graficoCanvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Distância (km)',
                data: [],
                borderColor: '#bb86fc',
                backgroundColor: 'rgba(187, 134, 252, 0.2)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'Leituras' }, ticks: { color: '#9e9e9e' }, grid: { color: '#373737' }},
                y: { title: { display: true, text: 'Distância (km)' }, ticks: { color: '#9e9e9e' }, grid: { color: '#373737' }}
            },
            plugins: { legend: { labels: { color: '#e0e0e0' } } }
        }
    });
}

// Inicializa o mapa Leaflet
function inicializarMapa(lat, lon) {
  if (mapa) return;

  mapa = L.map('mapa-container').setView([lat, lon], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
  polyline = L.polyline([], { color: 'blue' }).addTo(mapa);
}

// Desenha toda a rota percorrida ao final
function desenharRotaNoMapa() {
    if (mapa && pathCoordinates.length > 1) {
        if (polyline) mapa.removeLayer(polyline);
        polyline = L.polyline(pathCoordinates, { color: 'blue' }).addTo(mapa);
        mapa.fitBounds(polyline.getBounds());
    }
}

// Adiciona nova coordenada à rota
function atualizarMapaComNovaCoordenada(lat, lon) {
    if (mapa) {
        if (!polyline) {
            polyline = L.polyline([lat, lon], { color: 'blue' }).addTo(mapa);
        } else {
            polyline.addLatLng([lat, lon]);
        }
    }
}

// Carrega histórico salvo no backend e exibe na interface
function carregarHistorico() {
    fetch('/api/historico')
      .then(res => res.json())
      .then(historico => {
        const lista = document.getElementById('lista-historico');
        lista.innerHTML = '';
        historico.forEach(item => {
          const li = document.createElement('li');
          li.innerHTML = `
            <strong>Data:</strong> ${new Date(item.data).toLocaleString()} <br>
            <strong>Tempo:</strong> ${item.tempo} min<br>
            <strong>Distância:</strong> ${item.distancia} km<br>
            <strong>Ritmo:</strong> ${item.ritmo}<br>
            <button onclick="excluirCaminhada(${item.id})">Excluir</button>
            <hr>
          `;
          lista.appendChild(li);
        });
      })
      .catch(error => console.error('Erro ao carregar histórico:', error));
}

// Exclui caminhada específica do histórico
function excluirCaminhada(id) {
    if (confirm('Tem certeza que deseja excluir esta caminhada?')) {
        fetch(`/api/historico/${id}`, { method: 'DELETE' })
            .then(res => {
                if (res.ok) carregarHistorico();
                else res.json().then(data => alert('Erro: ' + (data.error || 'desconhecido')));
            }).catch(err => console.error('Erro ao excluir:', err));
    }
}

// Botão de ativar/desativar áudio
toggleAudioButton.addEventListener('click', () => {
    audioAtivado = !audioAtivado;
    toggleAudioButton.textContent = audioAtivado ? '🔊' : '🔇';
});

// Inicia caminhada ao clicar no botão
iniciarCaminhadaBotao.addEventListener('click', iniciarCaminhada);
pararCaminhadaBotao.addEventListener('click', pararCaminhada);

// Carrega histórico ao carregar a página
window.addEventListener('DOMContentLoaded', carregarHistorico);

// Salva imagem do mapa como PNG
function salvarImagemDoMapa() {
  const mapaEl = document.getElementById("mapa-container");
  html2canvas(mapaEl, { useCORS: true }).then(canvas => {
    const imagem = canvas.toDataURL("image/png");
    const link = document.createElement('a');
    link.href = imagem;
    link.download = `trajeto-${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.png`;
    link.click();
  });
}

window.addEventListener('load', () => {
 inicializarGrafico(); // gráfico vazio
  inicializarMapa(-20.0, -45.0); // posição inicial genérica

 // opcional: centralizar no local atual
 navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    mapa.setView([latitude, longitude], 15);
  });
});

