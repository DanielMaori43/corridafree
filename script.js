const graficoCanvas = document.getElementById('meuGrafico').getContext('2d');
const tempoDecorridoElement = document.getElementById('tempo-decorrido');
const distanciaPercorridaElement = document.getElementById('distancia-percorrida');
const iniciarCaminhadaBotao = document.getElementById('iniciar-caminhada');
const pararCaminhadaBotao = document.getElementById('parar-caminhada');
const mapaContainer = document.getElementById('mapa-container');
const ritmoAtualElement = document.getElementById('ritmo-atual');
const feedbackElement = document.getElementById('feedback-mensagem');
const audioIcon = document.getElementById('audio-icon');
const toggleAudioButton = document.getElementById('toggle-audio');

let watchId;
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
let ritmoInicial = null; // Para armazenar o ritmo inicial
let tempoParado = 0;
let paradoDesde = null;
let audioAtivado = true; // Variável para controlar o estado do áudio
let ritmoInicialRegistrado = false; // Nova flag para controlar o registro do ritmo inicial
let ritmoDiminuiuAvisado = false; // Variável de controle para o aviso de ritmo diminuído
const LIMIAR_VELOCIDADE = 0.1; // km/h
const TEMPO_LIMITE_PARADO = 120000; // 2 minutos em milissegundos



// Função para inserir uma nova caminhada
function salvarHistorico(distancia, tempo, ritmo) {
    const data = new Date().toISOString(); // Data no formato ISO
    const sql = 'INSERT INTO historico_caminhada (data, distancia, tempo, ritmo) VALUES (?, ?, ?, ?)';
    db.run(sql, [data, distancia, tempo, ritmo], (err) => {
        if (err) {
            console.error('Erro ao salvar histórico:', err);
            return;
        }
        console.log('Caminhada salva no histórico!');
    });
}

// Função para depuração
function debugLog(message) {
    console.log(message);
}

// Função para falar mensagens com o SpeechSynthesis
function falarMensagem(mensagem) {
    if ('speechSynthesis' in window && audioAtivado) {
        const utterance = new SpeechSynthesisUtterance(mensagem);
        window.speechSynthesis.speak(utterance);
    } else if (!('speechSynthesis' in window)) {
        console.log("API de Text-to-Speech não suportada.");
    } else {
        console.log("Avisos de voz estão desativados.");
    }
}

// Função para iniciar a caminhada
function iniciarCaminhada() {
    console.log("Iniciar caminhada clicado!");
    
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
    ritmoInicialRegistrado = false; // Resetar a flag ao iniciar uma nova caminhada
    ritmoDiminuiuAvisado = false; // Resetar a flag ao iniciar uma nova caminhada

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

// Função para parar a caminhada
function pararCaminhada() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        clearInterval(timerInterval);
        iniciarCaminhadaBotao.disabled = false;
        pararCaminhadaBotao.disabled = true;
        if (audioAtivado) falarMensagem(`Caminhada finalizada. Distância total percorrida: ${totalDistance.toFixed(2)} quilômetros.`);
        console.log("Caminhada finalizada. Distância total:", totalDistance.toFixed(2) + " km");
        desenharRotaNoMapa();
    }
}

// Função para atualizar a localização
function atualizarLocalizacao(position) {
    const { latitude, longitude } = position.coords;
    const timestamp = position.timestamp;

    pathCoordinates.push([latitude, longitude]);
    console.log("Coordenadas adicionadas:", latitude, longitude, "Tamanho do Path:", pathCoordinates.length);

    if (!primeiraCoordenadaRecebida && mapa) {
        mapa.setView([latitude, longitude], 15);
        primeiraCoordenadaRecebida = true;
    }

    let velocidadeAtual = 0;
    if (position.coords.speed !== null) {
        velocidadeAtual = position.coords.speed * 3.6; // Converter m/s para km/h
    }

    if (velocidadeAtual < LIMIAR_VELOCIDADE) {
        if (paradoDesde === null) {
            paradoDesde = Date.now();
        } else if (Date.now() - paradoDesde > TEMPO_LIMITE_PARADO) {
            falarMensagem("Você está parado há algum tempo. Tudo bem?");
            paradoDesde = null; // Evitar repetição constante do alerta
        }
    } else {
        paradoDesde = null;
    }

    if (previousPosition) {
        const distance = calcularDistancia(previousPosition.latitude, previousPosition.longitude, latitude, longitude);
        totalDistance += distance;
        console.log("Distância Incrementada:", distance, "Distância Total:", totalDistance);

        const currentTime = Date.now();
        const elapsedTimeInSeconds = Math.floor((currentTime - startTime) / 1000);

        let ritmoAtual = '0:00';
        if (totalDistance > 0) {
            const ritmoEmSegundosPorKm = elapsedTimeInSeconds / totalDistance;
            const minutos = Math.floor(ritmoEmSegundosPorKm / 60);
            const segundos = Math.floor(ritmoEmSegundosPorKm % 60);
            ritmoAtual = `${minutos}:${String(segundos).padStart(2, '0')}`;
        }

        if (ritmoAtualElement) {
            ritmoAtualElement.textContent = ritmoAtual;
        }
    }

    previousPosition = { latitude, longitude };
    distanciaPercorridaElement.textContent = totalDistance.toFixed(2) + ' km';

    atualizarGrafico(timestamp);
    atualizarMapaComNovaCoordenada(latitude, longitude);
}

// Função para tratar erros na localização
function tratarErro(error) {
    console.warn('Erro ao obter localização:', error.message);
}

// Função para atualizar o tempo
function atualizarTempo() {
    const currentTime = Date.now();
    const elapsedTime = Math.floor((currentTime - startTime) / 1000);

    const hours = Math.floor(elapsedTime / 3600);
    const minutes = Math.floor((elapsedTime % 3600) / 60);
    const seconds = elapsedTime % 60;

    const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    tempoDecorridoElement.textContent = formattedTime;
}

// Função para calcular a distância entre duas coordenadas
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distância em km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Função para inicializar o gráfico
function inicializarGrafico() {
    if (meuGrafico) {
        meuGrafico.destroy();
    }
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
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Número de Leituras',
                        color: '#e0e0e0'
                    },
                    ticks: {
                        color: '#9e9e9e',
                        stepSize: 1
                    },
                    grid: {
                        color: '#373737'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Distância (km)',
                        color: '#e0e0e0'
                    },
                    ticks: {
                        color: '#9e9e9e'
                    },
                    grid: {
                        color: '#373737'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e0e0e0'
                    }
                }
            }
        }
    });
}

// Função para inicializar o mapa
function inicializarMapa(latitude, longitude) {
    mapa = L.map('mapa-container').setView([latitude, longitude], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapa);
}

// Função para desenhar a rota no mapa
function desenharRotaNoMapa() {
    if (mapa && pathCoordinates.length > 1) {
        if (polyline) {
            mapa.removeLayer(polyline);
        }
        polyline = L.polyline(pathCoordinates, { color: 'blue' }).addTo(mapa);
        mapa.fitBounds(polyline.getBounds());
    }
}

// Função para atualizar o mapa com nova coordenada
function atualizarMapaComNovaCoordenada(latitude, longitude) {
    if (mapa) {
        if (!polyline) {
            polyline = L.polyline([latitude, longitude], { color: 'blue' }).addTo(mapa);
        } else {
            polyline.addLatLng([latitude, longitude]);
        }
    }
}

// Event listener para o botão de mudo/som
toggleAudioButton.addEventListener('click', () => {
    audioAtivado = !audioAtivado;
    audioIcon.textContent = audioAtivado ? '🔊' : '🔇'; // Atualizar o ícone
    console.log("Áudio ativado:", audioAtivado);
});
function carregarHistorico() {
    fetch('/api/historico')
        .then(response => response.json())
        .then(data => {
            const historicoContainer = document.getElementById('historico-container');
            historicoContainer.innerHTML = ''; // Limpar o conteúdo atual
            data.forEach(caminhada => {
                const caminhadaDiv = document.createElement('div');
                caminhadaDiv.classList.add('caminhada');
                caminhadaDiv.innerHTML = `
                    <p><strong>Data:</strong> ${caminhada.data}</p>
                    <p><strong>Distância:</strong> ${caminhada.distancia} km</p>
                    <p><strong>Tempo:</strong> ${caminhada.tempo}</p>
                    <p><strong>Ritmo:</strong> ${caminhada.ritmo || 'N/A'}</p>
                `;
                historicoContainer.appendChild(caminhadaDiv);
            });
        })
        .catch(err => {
            console.error('Erro ao carregar histórico:', err);
        });
}



// Verifique se o botão está sendo referenciado corretamente
iniciarCaminhadaBotao.addEventListener('click', iniciarCaminhada);
pararCaminhadaBotao.addEventListener('click', pararCaminhada);
