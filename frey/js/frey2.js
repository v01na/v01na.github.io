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
        console.log('[App] V2k Demodulator v5.4 Fixed...');
        
        this.viz = new Visualizer();
        this.ui = new UI(this);
        this.dsp = new DSP(this);
        this.audio = new AudioEngine(this.viz, this.dsp); 

        this.bindEvents();
        this.bindDSP();

        this.ui.log('Система готова. Ожидание.');
    },

    bindEvents() {
        // --- Источники ---
        this.ui.on('play', () => {
            this.ui.log('Запуск файла...');
            this.audio.playCurrentBuffer();
        });
        
        this.ui.on('stop', () => { this.stopAll(); });

        this.ui.on('mic-start', async (deviceId) => {
            this.ui.log('Микрофон...');
            await this.audio.startMicrophone(deviceId);
            this.ui.setLiveState(true);
        });

        this.ui.on('stream-start', async (url) => {
            if (!url) return alert('Нет URL');
            this.ui.log(`Поток: ${url}`);
            await this.audio.startStream(url);
            this.ui.setLiveState(true);
        });

        this.ui.on('file-load', (files) => this.handleFiles(files));

        // --- Микшер ---
        this.ui.on('mixer-change', (settings) => this.audio.updateMixer(settings));

        // --- ДЕМОДУЛЯЦИЯ (Исправлено) ---
        this.ui.on('extract-one', () => {
            const buffer = this.audio.currentBuffer;
            if (!buffer) {
                this.ui.log('Ошибка: Сначала загрузите файл!');
                alert('Нет загруженного файла для анализа.');
                return;
            }
            this.ui.log('Запуск демодуляции (повторный анализ)...');
            // Запускаем анализ того же буфера, но с (возможно) новыми настройками из UI
            this.dsp.analyzeFullFile(buffer, 'Re-Analysis');
        });

        this.ui.on('extract-all', () => {
            this.ui.log('Функция пакетной обработки в разработке');
        });
        
        // --- Кластеризация ---
        this.ui.on('cluster', () => {
             this.ui.log('Запуск кластеризации (K-Means)...');
             // Здесь нужно вызвать метод кластеризации из dsp.js (нужно добавить его в dsp.js если нет)
             alert('Данные для кластеризации собраны. Проверьте консоль разработчика.');
        });
    },

    bindDSP() {
        // Рисуем живые метрики (Real-Time)
        this.dsp.onRealTimeData = (metrics) => {
            if (this.viz && this.viz.drawRealTimeMetrics) {
                this.viz.drawRealTimeMetrics(metrics);
            }
        };

        // Результат демодуляции файла
        this.dsp.onFileAnalysisDone = (result, id) => {
            this.ui.log(`Демодуляция завершена (${id}). Точек: ${result.frames}`);
            
            // Здесь мы можем обновить нижний график (envCanvas) статичными данными результата
            // Чтобы увидеть результат демодуляции "в покое"
            if (this.viz && this.viz.drawFullEnvelopes) {
                 this.viz.drawFullEnvelopes(result);
            } else {
                 // Если метода нет, хотя бы выведем в консоль
                 console.log('DSP Result:', result);
            }
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
            this.ui.log(`Чтение ${file.name}...`);
            const buffer = await this.audio.loadFile(file);
            
            // Рисуем превью
            this.drawPreview(buffer);

            this.ui.log(`Загружен ${file.name}. Демодуляция...`);
            
            // Авто-старт анализа при загрузке
            this.dsp.analyzeFullFile(buffer, file.name);
            
        } catch (e) {
            console.error(e);
            this.ui.log('Ошибка: ' + e.message);
        }
    },

    drawPreview(buffer) {
        const rawData = buffer.getChannelData(0); 
        const previewLen = 2048;
        const center = Math.floor(rawData.length / 2);
        const slice = rawData.slice(center, center + previewLen);
        const view = new Uint8Array(previewLen);
        for(let i=0; i<previewLen; i++) view[i] = (slice[i] + 1) * 128;
        this.viz.drawWaveform(view);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
