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
        console.log('[App] Initializing v5.0 Mixer Edition...');
        
        // 1. Инициализация подсистем
        this.viz = new Visualizer();
        this.ui = new UI(this);
        this.dsp = new DSP(this);
        
        // Аудио движок связывает всё: Визуал, Математику и Микшер
        this.audio = new AudioEngine(this.viz, this.dsp); 

        // 2. Настройка событий
        this.bindEvents();
        this.bindDSP();

        this.ui.log('System Ready. Select Source & Adjust EQ.');
    },

    bindEvents() {
        // --- Плеер (Файлы) ---
        this.ui.on('play', () => {
            this.ui.log('Starting file playback...');
            this.audio.playCurrentBuffer();
        });
        
        this.ui.on('stop', () => {
            this.stopAll();
        });

        this.ui.on('stop-live', () => {
            this.stopAll();
        });

        // --- Микрофон (Real-Time) ---
        this.ui.on('mic-start', async (deviceId) => {
            this.ui.log('Initializing microphone...');
            await this.audio.startMicrophone(deviceId);
            this.ui.setLiveState(true);
        });

        // --- Радио (Real-Time) ---
        this.ui.on('stream-start', async (url) => {
            if (!url) return alert('Enter Stream URL');
            this.ui.log(`Connecting to stream...`);
            await this.audio.startStream(url);
            this.ui.setLiveState(true);
        });

        // --- Загрузка Файлов ---
        this.ui.on('file-load', (files) => this.handleFiles(files));

        // --- Микшер и Эквалайзер (NEW) ---
        this.ui.on('mixer-change', (settings) => {
            // settings = { gain, low, mid, high }
            // Передаем настройки в аудио-движок
            this.audio.updateMixer(settings);
            
            // Логирование только при сильных изменениях, чтобы не спамить
            // this.ui.log(`EQ: L${settings.low} M${settings.mid} H${settings.high}`);
        });
    },

    bindDSP() {
        // Данные реального времени (RMS, Centroid, Peak) от DSP Worker
        this.dsp.onRealTimeData = (metrics) => {
            if (this.viz && this.viz.drawRealTimeMetrics) {
                this.viz.drawRealTimeMetrics(metrics);
            }
        };

        // Результат полного анализа файла
        this.dsp.onFileAnalysisDone = (result, id) => {
            this.ui.log(`Deep Analysis done for: ${id}. Frames: ${result.frames}`);
            // Здесь можно добавить отрисовку детальных графиков
        };
    },

    // Остановка всего
    stopAll() {
        this.audio.stop();
        this.ui.setLiveState(false);
        this.ui.log('Stopped.');
    },

    // Обработка Drag&Drop или выбора файлов
    async handleFiles(fileList) {
        if (!fileList || fileList.length === 0) return;

        const file = fileList[0];
        try {
            this.ui.log(`Loading ${file.name}...`);
            
            // 1. Декодирование
            const buffer = await this.audio.loadFile(file);
            this.ui.log(`Loaded ${file.name} (${buffer.duration.toFixed(2)}s). Ready.`);
            
            // 2. Превью волны (берем кусок из середины)
            const rawData = buffer.getChannelData(0); 
            const previewLen = 2048;
            const center = Math.floor(rawData.length / 2);
            // Безопасный слайс
            const slice = rawData.slice(center, center + previewLen);
            
            // Конвертация для отрисовки (float -> byte approximation)
            const view = new Uint8Array(previewLen);
            for(let i=0; i<previewLen; i++) {
                const val = slice[i] || 0;
                view[i] = (val + 1) * 128;
            }
            this.viz.drawWaveform(view);

            // 3. Запуск фонового анализа
            this.ui.log('Running background analysis...');
            this.dsp.analyzeFullFile(buffer, file.name);
            
        } catch (e) {
            console.error(e);
            this.ui.log('Error loading file: ' + e.message);
        }
    }
};

// Запуск при готовности DOM
document.addEventListener('DOMContentLoaded', () => App.init());
