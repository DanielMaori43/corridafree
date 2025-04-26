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

// Função para não parar a mensagem quando a tela estiver travada
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

// Registro do Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(function (registration) {
            console.log('Service Worker registrado com sucesso:', registration);

            // Tente atualizar o service worker sempre que ele for registrado
            registration.update();

            // Verificar inscrição do push
            verificarPushSubscription(registration);
        })
        .catch(function (error) {
            console.log('Erro ao registrar o Service Worker:', error);
        });
}
// Verificar permissão para notificações
if ("Notification" in window) {
    if (Notification.permission === "granted") {
        iniciarRegistroServiceWorker();
    } else {
        Notification.requestPermission().then(function(permission) {
            if (permission === "granted") {
                console.log("Permissão para notificações concedida!");
                iniciarRegistroServiceWorker();
            } else {
                console.log("Permissão para notificações negada.");
            }
        }).catch(function(err) {
            console.error("Erro ao solicitar permissão para notificações:", err);
        });
    }
}

function iniciarRegistroServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(function(registration) {
                console.log('Service Worker registrado com sucesso:', registration);

                registration.update();

                registration.pushManager.getSubscription().then(function(subscription) {
                    if (!subscription) {
                        // Se o usuário não está inscrito, inscreva-o
                        subscribeUser(registration);
                    } else {
                        console.log('Usuário já inscrito:', subscription);
                    }
                });

            }).catch(function(error) {
                console.log('Erro ao registrar o Service Worker:', error);
            });
    }
}

// Função para verificar e gerenciar a inscrição do push
function verificarPushSubscription(registration) {
    registration.pushManager.getSubscription().then(function (subscription) {
        if (!subscription) {
            console.log('Usuário não está inscrito, inscrevendo...');
            subscribeUser(registration);
        } else {
            console.log('Usuário já inscrito:', subscription);
            sendSubscriptionToServer(subscription); // Enviar a inscrição atual para o servidor
        }
    });
}

// Função para se inscrever em Push Notifications
function subscribeUser(registration) {
    registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicVapidKey)
    })
        .then(function (subscription) {
            console.log('Usuário inscrito:', subscription);
            sendSubscriptionToServer(subscription);
        })
        .catch(function (err) {
            console.log('Erro ao inscrever o usuário:', err);
        });
}

// Função para enviar inscrição do Push Notification para o servidor
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

// Resto do código de controle da caminhada continua igual...

// Lembre-se de incluir todas as outras funções do código conforme estavam (atualização de localização, cálculo de distância, etc.)

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
                x: { title: { display: true, text: 'Número de Leituras', color: '#e0e0e0' }, ticks: { color: '#9e9e9e' }, grid: { color: '#373737' }},
                y: { title: { display: true, text: 'Distância (km)', color: '#e0e0e0' }, ticks: { color: '#9e9e9e' }, grid: { color: '#373737' }}
            },
            plugins: { legend: { labels: { color: '#e0e0e0' } } }
        }
    });
}

function inicializarMapa(lat, lon) {
    mapa = L.map('mapa-container').setView([lat, lon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapa);
}

function desenharRotaNoMapa() {
    if (mapa && pathCoordinates.length > 1) {
        if (polyline) mapa.removeLayer(polyline);
        polyline = L.polyline(pathCoordinates, { color: 'blue' }).addTo(mapa);
        mapa.fitBounds(polyline.getBounds());
    }
}

function atualizarMapaComNovaCoordenada(lat, lon) {
    if (mapa) {
        if (!polyline) {
            polyline = L.polyline([lat, lon], { color: 'blue' }).addTo(mapa);
        } else {
            polyline.addLatLng([lat, lon]);
        }
    }
}

function carregarHistorico() {
    fetch('/api/historico')
        .then(res => res.json())
        .then(data => {
            const lista = document.getElementById('lista-historico');
            lista.innerHTML = '';
            data.forEach(c => {
                const item = document.createElement('li');
                item.innerHTML = `
                    <span style="color: #03dac6;">📅 ${new Date(c.data).toLocaleString()}</span><br>
                    🚶 <strong>${c.distancia} km</strong> | ⏱️ ${c.tempo} | 🏃 Ritmo: ${c.ritmo || 'N/A'}
                `;
                lista.appendChild(item);
            });
        })
        .catch(err => {
            console.error("Erro ao carregar histórico:", err);
        });
}

document.getElementById('limpar-historico').addEventListener('click', () => {
    fetch('/api/historico', { method: 'DELETE' })
        .then(() => {
            feedbackElement.textContent = "🧹 Histórico limpo com sucesso!";
            carregarHistorico();
        });
});

// ✅ Botão de som corrigido
toggleAudioButton.addEventListener('click', () => {
    audioAtivado = !audioAtivado;
    toggleAudioButton.textContent = audioAtivado ? '🔊' : '🔇';
});

iniciarCaminhadaBotao.addEventListener('click', () => {
    console.log("Botão Iniciar Caminhada foi clicado!");
    iniciarCaminhada();
});

pararCaminhadaBotao.addEventListener('click', pararCaminhada);
window.addEventListener('DOMContentLoaded', carregarHistorico);
