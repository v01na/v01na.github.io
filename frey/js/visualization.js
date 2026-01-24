export class Visualizer {
    constructor() {
        // Верхний канвас (Волна / Осциллограф)
        this.waveCanvas = document.getElementById('waveCanvas');
        this.waveCtx = this.waveCanvas ? this.waveCanvas.getContext('2d') : null;

        // Нижний канвас (Огибающие / Метрики RMS, Centroid)
        this.envCanvas = document.getElementById('envCanvas');
        this.envCtx = this.envCanvas ? this.envCanvas.getContext('2d') : null;
        
        // Буфер истории для бегущего графика метрик
        this.metricsHistory = []; 
        this.maxHistory = 300; // Храним последние 300 кадров
    }

    // Отрисовка волны (принимает Uint8Array или Float32Array)
    drawWaveform(dataArray) {
        if (!this.waveCtx) return;

        const w = this.waveCanvas.width;
        const h = this.waveCanvas.height;
        const len = dataArray.length;

        // Очистка фона
        this.waveCtx.fillStyle = '#020617'; // very dark slate
        this.waveCtx.fillRect(0, 0, w, h);
        
        this.waveCtx.lineWidth = 2;
        this.waveCtx.strokeStyle = '#3b82f6'; // blue-500
        this.waveCtx.beginPath();

        const sliceW = w / len;
        let x = 0;

        // Определяем тип данных (byte vs float)
        const isByte = dataArray instanceof Uint8Array;

        for (let i = 0; i < len; i++) {
            let v;
            if (isByte) {
                v = dataArray[i] / 128.0; // 0..255 -> 0..2
                v = v - 1; // -1..1
            } else {
                v = dataArray[i]; // уже -1..1
            }
            
            // Масштабируем Y: центр (h/2) + амплитуда
            const y = (h / 2) + (v * (h / 2));

            if (i === 0) this.waveCtx.moveTo(x, y);
            else this.waveCtx.lineTo(x, y);

            x += sliceW;
        }

        this.waveCtx.lineTo(w, h / 2);
        this.waveCtx.stroke();
    }

    // Отрисовка метрик реального времени (бегущие графики)
    drawRealTimeMetrics(metrics) {
        if (!this.envCtx) return;

        // metrics = { rms: float, centroid: float, hilbertPeak: float }
        this.metricsHistory.push(metrics);
        
        // Удаляем старые, если буфер переполнен
        if (this.metricsHistory.length > this.maxHistory) {
            this.metricsHistory.shift();
        }

        const w = this.envCanvas.width;
        const h = this.envCanvas.height;
        
        // Очистка
        this.envCtx.clearRect(0, 0, w, h);
        this.envCtx.fillStyle = '#0f172a';
        this.envCtx.fillRect(0, 0, w, h);

        // Рисуем сетку (опционально)
        this.envCtx.strokeStyle = '#1e293b';
        this.envCtx.lineWidth = 1;
        this.envCtx.beginPath();
        this.envCtx.moveTo(0, h/2); this.envCtx.lineTo(w, h/2);
        this.envCtx.stroke();

        // 1. RMS (Синий) - Умножаем на 3 для наглядности
        this.drawLineGraph(this.metricsHistory.map(m => m.rms * 3), '#3b82f6', 2);

        // 2. Centroid (Зеленый) - Нормализуем 0..5000Hz -> 0..1
        this.drawLineGraph(this.metricsHistory.map(m => m.centroid / 5000), '#10b981', 1);
        
        // 3. Hilbert Peak (Красный/Прозрачный)
        this.drawLineGraph(this.metricsHistory.map(m => m.hilbertPeak), 'rgba(239, 68, 68, 0.5)', 1);

        // Текстовая легенда
        this.envCtx.fillStyle = '#94a3b8';
        this.envCtx.font = '10px monospace';
        const last = this.metricsHistory[this.metricsHistory.length-1];
        if(last) {
            this.envCtx.fillStyle = '#3b82f6';
            this.envCtx.fillText(`RMS: ${last.rms.toFixed(4)}`, 10, 20);
            
            this.envCtx.fillStyle = '#10b981';
            this.envCtx.fillText(`Centroid: ${last.centroid.toFixed(0)} Hz`, 10, 35);
        }
    }

    // Вспомогательный метод рисования линии
    drawLineGraph(data, color, width) {
        const w = this.envCanvas.width;
        const h = this.envCanvas.height;
        const len = data.length;
        const step = w / this.maxHistory;

        this.envCtx.beginPath();
        this.envCtx.strokeStyle = color;
        this.envCtx.lineWidth = width;

        for(let i=0; i<len; i++) {
            // Ограничиваем значение от 0 до 1
            let val = data[i];
            if (val < 0) val = 0;
            if (val > 1) val = 1;

            const x = i * step;
            const y = h - (val * h); // Инвертируем Y (0 внизу)
            
            if(i===0) this.envCtx.moveTo(x, y);
            else this.envCtx.lineTo(x, y);
        }
        this.envCtx.stroke();
    }
}
