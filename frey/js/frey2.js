import { UI } from './ui.js';
import { AudioEngine } from './audio-engine.js';
import { Visualizer } from './visualization.js';
import { DSP } from './dsp.js';

const App = {
    async init() {
        console.log('Init V2k Demodulator v5.7 Fixed...');
        
        this.viz = new Visualizer();
        this.ui = new UI(this);
        this.dsp = new DSP(this);
        this.audio = new AudioEngine(this.viz, this.dsp); 

        this.bindEvents();
        this.bindDSP();
        
        this.ui.log('Система готова. Загрузите файл.');
    },

    bindEvents() {
        // Управление звуком
        this.ui.on('play', () => this.audio.playCurrentBuffer());
        this.ui.on('stop', () => this.stopAll());
        this.ui.on('mixer-change', s => this.audio.updateMixer(s));
        
        this.ui.on('mic-start', async id => { 
            await this.audio.startMicrophone(id); 
            this.ui.setLiveState(true); 
        });
        
        this.ui.on('stream-start', async url => { 
            await this.audio.startStream(url); 
            this.ui.setLiveState(true); 
        });
        
        this.ui.on('file-load', f => this.handleFiles(f));

        // 1. ИЗВЛЕЧЬ
        this.ui.on('extract-one', () => {
            if(!this.audio.currentBuffer) return alert('Файл не загружен');
            this.ui.log('Анализ DSP...');
            this.dsp.analyzeFullFile(this.audio.currentBuffer, 'Manual Extract');
        });

        // 2. MATCH DTW
        this.ui.on('match-dtw', () => {
            this.ui.log('Расчет матрицы самоподобия...');
            this.dsp.runDTW();
        });

        // 3. КЛАСТЕРЫ
        this.ui.on('run-cluster', () => {
            this.ui.log('Запуск K-Means кластеризации...');
            const k = parseInt(document.getElementById('maxClusters').value || 5);
            this.dsp.runClustering(k);
        });
        
        this.ui.on('interpret', () => {
            alert('GPT API Key required');
        });
    },

    bindDSP() {
        // Real-time
        this.dsp.onRealTimeData = m => this.viz.drawRealTimeMetrics(m);

        // Результат извлечения (Подробный график)
        this.dsp.onFileAnalysisDone = (res, id) => {
            const text = `=== РЕЗУЛЬТАТ АНАЛИЗА ===\nID: ${id}\nФреймов: ${res.frames}\nМетод: Min-Max (High Detail)\n\nГотов к Кластеризации.`;
            this.ui.printResult(text);
            this.ui.log('Демодуляция завершена.');
            this.viz.drawFullEnvelopes(res);
        };

        // Результат Матрицы
        this.dsp.onDTWMatrixReady = (matrix) => {
            this.ui.log('Матрица построена.');
            this.viz.drawDTWMatrix(matrix);
        };

        // Результат Кластеризации
        this.dsp.onClustersReady = (data) => {
            this.ui.log(`Кластеризация завершена (${data.centroids.length} групп).`);
            
            // Вывод в лог
            const resEl = document.getElementById('results');
            resEl.textContent += `\n\n=== CLUSTERING RESULTS ===\nНайдено ${data.centroids.length} кластеров.\n`;
            
            data.centroids.forEach((c, i) => {
                resEl.textContent += `Cluster ${i}: Center [${c[0].toFixed(2)}, ${c[1].toFixed(2)}]\n`;
            });
            
            // Рисуем на экране
            this.viz.drawClusters(data);
        };
    },

    stopAll() {
        this.audio.stop();
        this.ui.setLiveState(false);
        this.ui.log('Остановлено.');
    },

    async handleFiles(list) {
        if(!list.length) return;
        const f = list[0];
        try {
            this.ui.log(`Загрузка ${f.name}...`);
            const b = await this.audio.loadFile(f);
            
            // Preview Waveform
            const raw = b.getChannelData(0);
            const v = new Uint8Array(2048);
            const step = Math.floor(raw.length/2048);
            for(let i=0;i<2048;i++) v[i]=(raw[i*step]+1)*128;
            this.viz.drawWaveform(v);

            this.ui.log('Файл загружен. Нажмите Извлечь.');
            // Авто-старт анализа
            this.dsp.analyzeFullFile(b, f.name);
        } catch(e) {
            this.ui.log('Ошибка: '+e.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
