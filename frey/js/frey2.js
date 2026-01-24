import { UI } from './ui.js';
import { AudioEngine } from './audio-engine.js';
import { Visualizer } from './visualization.js';

// Глобальное состояние приложения
const App = {
    ui: null,
    audio: null,
    viz: null,
    
    async init() {
        console.log('[App] Initializing v4.5 Modular...');
        
        // 1. Инициализация подсистем
        this.viz = new Visualizer();
        this.ui = new UI(this);
        this.audio = new AudioEngine(this.viz); // Передаем визуализатор в аудио движок

        // 2. Привязка событий UI к логике
        this.bindEvents();

        // 3. Готовность
        this.ui.log('System Ready. Select input source.');
    },

    bindEvents() {
        // Управление воспроизведением файлов
        this.ui.on('play', () => this.audio.playSelectedFile());
        this.ui.on('stop', () => this.audio.stop());
        
        // Микрофон
        this.ui.on('mic-start', async (deviceId) => {
            await this.audio.startMicrophone(deviceId);
            this.ui.setLiveState(true);
        });

        // Радио
        this.ui.on('stream-start', async (url) => {
            await this.audio.startStream(url);
            this.ui.setLiveState(true);
        });

        this.ui.on('stop-live', () => {
            this.audio.stop();
            this.ui.setLiveState(false);
        });
    }
};

// Запуск при загрузке
document.addEventListener('DOMContentLoaded', () => App.init());
