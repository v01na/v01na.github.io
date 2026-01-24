export class Visualizer {
    constructor() {
        this.waveCanvas = document.getElementById('waveCanvas');
        this.waveCtx = this.waveCanvas.getContext('2d');

        this.envCanvas = document.getElementById('envCanvas');
        this.envCtx = this.envCanvas.getContext('2d');
        
        this.dtwCanvas = document.getElementById('dtwCanvas');
        this.dtwCtx = this.dtwCanvas.getContext('2d');

        this.metricsHistory = []; 
        this.maxHistory = 300;
    }

    // --- REAL-TIME ---
    drawWaveform(byteData) {
        const w = this.waveCanvas.width, h = this.waveCanvas.height;
        this.waveCtx.fillStyle = '#020617'; this.waveCtx.fillRect(0, 0, w, h);
        this.waveCtx.lineWidth = 1.5; this.waveCtx.strokeStyle = '#3b82f6'; this.waveCtx.beginPath();
        const slice = w / byteData.length; let x = 0;
        for (let i = 0; i < byteData.length; i++) {
            const y = (byteData[i] / 128.0) * h / 2;
            i===0 ? this.waveCtx.moveTo(x, y) : this.waveCtx.lineTo(x, y);
            x += slice;
        }
        this.waveCtx.stroke();
    }

    drawRealTimeMetrics(m) {
        this.metricsHistory.push(m);
        if (this.metricsHistory.length > this.maxHistory) this.metricsHistory.shift();
        
        const w = this.envCanvas.width, h = this.envCanvas.height;
        this.envCtx.clearRect(0,0,w,h); this.envCtx.fillStyle='#0f172a'; this.envCtx.fillRect(0,0,w,h);
        
        // Рисуем бегущие графики (RMS=Blue, Centroid=Green)
        this.drawPath(this.metricsHistory.map(x=>x.rms*4), '#3b82f6', h, w);
        this.drawPath(this.metricsHistory.map(x=>x.centroid/5000), '#10b981', h, w);
    }

    drawPath(data, color, h, w) {
        const step = w / this.maxHistory;
        this.envCtx.beginPath(); this.envCtx.strokeStyle = color; this.envCtx.lineWidth = 2;
        for(let i=0;i<data.length;i++){
            const y = h - (Math.min(1, data[i]) * (h-10)) - 5;
            i===0?this.envCtx.moveTo(i*step, y):this.envCtx.lineTo(i*step, y);
        }
        this.envCtx.stroke();
    }

    // --- STATIC ANALYSIS RESULTS ---
    
    // 1. Огибающие (результат Extract)
    drawFullEnvelopes(res) {
        const w = this.envCanvas.width, h = this.envCanvas.height;
        this.envCtx.fillStyle = '#0f172a'; this.envCtx.fillRect(0,0,w,h);
        
        // Ресемплинг под ширину экрана для отрисовки
        const fit = (arr) => {
            const out = new Float32Array(w);
            const step = arr.length / w;
            for(let i=0;i<w;i++) out[i] = arr[Math.floor(i*step)] || 0;
            return out;
        };

        if(res.rms) this.drawStaticPath(fit(res.rms), '#3b82f6', h);
        if(res.cent) this.drawStaticPath(fit(res.cent), '#10b981', h);
        if(res.hilb) this.drawStaticPath(fit(res.hilb), '#ef4444', h);
    }

    drawStaticPath(data, color, h) {
        this.envCtx.beginPath(); this.envCtx.strokeStyle = color; this.envCtx.lineWidth = 1;
        for(let i=0; i<data.length; i++) {
            const y = h - (data[i] * (h-20)) - 10;
            i===0?this.envCtx.moveTo(i, y):this.envCtx.lineTo(i, y);
        }
        this.envCtx.stroke();
    }

    // 2. Матрица DTW (Heatmap)
    drawDTWMatrix(matrixData) {
        const { matrix, rows, cols } = matrixData;
        const w = this.dtwCanvas.width, h = this.dtwCanvas.height;
        this.dtwCtx.fillStyle = '#000'; this.dtwCtx.fillRect(0,0,w,h);
        
        // Создаем изображение
        const img = this.dtwCtx.createImageData(w, h);
        const d = img.data;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                // Координаты в матрице данных
                const my = Math.floor((y / h) * rows);
                const mx = Math.floor((x / w) * cols);
                
                // Значение (0..1), где 0 - похоже, 1 - не похоже
                // Инвертируем: 1 (Ярко) = Похоже
                const val = 1.0 - (matrix[my * cols + mx] || 0);
                
                // Цвет (Сине-Огненная палитра)
                const i = (y * w + x) * 4;
                d[i]   = val * 255;       // R
                d[i+1] = val * 100;       // G
                d[i+2] = val * 50;        // B
                d[i+3] = 255;             // Alpha
            }
        }
        this.dtwCtx.putImageData(img, 0, 0);
    }
}
