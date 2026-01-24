import { UI } from './ui.js';
import { AudioEngine } from './audio-engine.js';
import { Visualizer } from './visualization.js';
import { DSP } from './dsp.js';

const App = {
    async init() {
        console.log('Init V2k Demodulator...');
        this.viz = new Visualizer();
        this.ui = new UI(this);
        this.dsp = new DSP(this);
        this.audio = new AudioEngine(this.viz, this.dsp); 

        this.bindEvents();
        this.bindDSP();
        this.ui.log('Система готова.');
    },

    bindEvents() {
        this.ui.on('play', () => this.audio.playCurrentBuffer());
        // Убираем stopAll() из play, чтобы можно было микшировать
        
        this.ui.on('stop', () => this.stopAll());
        this.ui.on('mixer-change', s => this.audio.updateMixer(s));
        this.ui.on('mic-start', async id => { await this.audio.startMicrophone(id); this.ui.setLiveState(true); });
        this.ui.on('stream-start', async url => { await this.audio.startStream(url); this.ui.setLiveState(true); });
        this.ui.on('file-load', f => this.handleFiles(f));

        // 1. ИЗВЛЕЧЬ (EXTRACT)
        this.ui.on('extract-one', () => {
            if(!this.audio.currentBuffer) return alert('Файл не загружен');
            this.ui.log('Начат анализ DSP...');
            this.dsp.analyzeFullFile(this.audio.currentBuffer, 'Manual');
        });

        // 2. MATCH DTW
        this.ui.on('match-dtw', () => {
            this.ui.log('Запуск расчета матрицы DTW...');
            this.dsp.runDTW();
        });
    },

    bindDSP() {
        this.dsp.onRealTimeData = m => this.viz.drawRealTimeMetrics(m);

        // РЕЗУЛЬТАТ ИЗВЛЕЧЕНИЯ
        this.dsp.onFileAnalysisDone = (res, id) => {
            // Форматируем текст для консоли (вместо [object Object])
            const text = `=== РЕЗУЛЬТАТ АНАЛИЗА ===\n` +
                         `ID: ${id}\n` +
                         `Точек графика: ${res.frames}\n` +
                         `Сжатие (Step): ${res.step}x\n` +
                         `RMS Samples: ${res.rms.length}\n` +
                         `Готов к построению матрицы.`;
            
            this.ui.printResult(text); // Вывод в большое черное окно
            this.ui.log('Анализ завершен.');
            this.viz.drawFullEnvelopes(res); // Рисуем средний график
        };

        // РЕЗУЛЬТАТ МАТРИЦЫ
        this.dsp.onDTWMatrixReady = (matrix) => {
            this.ui.log('Матрица построена.');
            this.viz.drawDTWMatrix(matrix); // Рисуем нижний график
            
            // Дописываем инфо
            const current = document.getElementById('results').textContent;
            this.ui.printResult(current + `\n\n=== DTW MATRIX ===\nРазмер: ${matrix.rows}x${matrix.cols}\nГотово.`);
        };
    },

    stopAll() {
        this.audio.stop();
        this.ui.setLiveState(false);
    },

    async handleFiles(list) {
        if(!list.length) return;
        const f = list[0];
        try {
            this.ui.log(`Загрузка ${f.name}...`);
            const b = await this.audio.loadFile(f);
            
            // Preview
            const raw = b.getChannelData(0);
            const v = new Uint8Array(2048);
            const step = Math.floor(raw.length/2048);
            for(let i=0;i<2048;i++) v[i]=(raw[i*step]+1)*128;
            this.viz.drawWaveform(v);

            this.ui.log('Файл загружен. Нажмите Play или Извлечь.');
            this.dsp.analyzeFullFile(b, f.name); // Авто-анализ
        } catch(e) {
            this.ui.log('Ошибка: '+e.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
