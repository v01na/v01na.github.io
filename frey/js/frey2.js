import { UI } from './ui.js';
import { AudioEngine } from './audio-engine.js';
import { Visualizer } from './visualization.js';
import { DSP } from './dsp.js';

const App = {
    ui: null,
    audio: null,
    viz: null,
    dsp: null,
    
    async init() {
        console.log('[App] V2k Demodulator v5.3 Rus...');
        
        this.viz = new Visualizer();
        this.ui = new UI(this);
        this.dsp = new DSP(this);
        this.audio = new AudioEngine(this.viz, this.dsp); 

        this.bindEvents();
        this.bindDSP();

        this.ui.log('Система готова. Выберите источник.');
    },

    bindEvents() {
        // --- Файлы ---
        this.ui.on('play', () => {
            this.ui.log('Запуск воспроизведения файла...');
            this.audio.playCurrentBuffer();
        });
        
        // Stop All
        this.ui.on('stop', () => { this.stopAll(); });
        this.ui.on('stop-live', () => { this.stopAll(); }); // Для кнопок радио/мик

        // --- Микрофон ---
        this.ui.on('mic-start', async (deviceId) => {
            this.ui.log('Инициализация микрофона...');
            await this.audio.startMicrophone(deviceId);
            this.ui.setLiveState(true);
        });

        // --- Радио ---
        this.ui.on('stream-start', async (url) => {
            if (!url) return alert('Введите URL потока');
            this.ui.log(`Подключение к потоку...`);
            await this.audio.startStream(url);
            this.ui.setLiveState(true);
        });

        // --- Загрузка ---
        this.ui.on('file-load', (files) => this.handleFiles(files));

        // --- Микшер ---
        this.ui.on('mixer-change', (settings) => {
            this.audio.updateMixer(settings);
        });
    },

    bindDSP() {
        this.dsp.onRealTimeData = (metrics) => {
            if (this.viz && this.viz.drawRealTimeMetrics) {
                this.viz.drawRealTimeMetrics(metrics);
            }
        };

        this.dsp.onFileAnalysisDone = (result, id) => {
            this.ui.log(`Анализ завершен: ${id}. Кадров: ${result.frames}`);
        };
    },

    stopAll() {
        this.audio.stop();
        this.ui.setLiveState(false);
        this.ui.log('Остановлено.');
    },

    async handleFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        const file = fileList[0];
        try {
            this.ui.log(`Загрузка ${file.name}...`);
            const buffer = await this.audio.loadFile(file);
            
            // Превью
            const rawData = buffer.getChannelData(0); 
            const previewLen = 2048;
            const center = Math.floor(rawData.length / 2);
            const slice = rawData.slice(center, center + previewLen);
            const view = new Uint8Array(previewLen);
            for(let i=0; i<previewLen; i++) view[i] = (slice[i] + 1) * 128;
            this.viz.drawWaveform(view);

            this.ui.log(`Загружен ${file.name} (${buffer.duration.toFixed(2)}s).`);
            
            // Фоновый анализ
            this.dsp.analyzeFullFile(buffer, file.name);
            
        } catch (e) {
            console.error(e);
            this.ui.log('Ошибка загрузки: ' + e.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
