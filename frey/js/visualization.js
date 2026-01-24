export class Visualizer {
    constructor() {
        this.waveCanvas = document.getElementById('waveCanvas');
        this.waveCtx = this.waveCanvas.getContext('2d');

        this.envCanvas = document.getElementById('envCanvas');
        this.envCtx = this.envCanvas.getContext('2d');
        
        this.dtwCanvas = document.getElementById('dtwCanvas');
        this.dtwCtx = this.dtwCanvas.getContext('2d');
        
        this.clusterCanvas = document.getElementById('clusterCanvas');
        this.clusterCtx = this.clusterCanvas ? this.clusterCanvas.getContext('2d') : null;

        this.metricsHistory = []; 
        this.maxHistory = 300;
        
        // Обработчик ресайза окна для перерисовки (опционально)
        window.addEventListener('resize', () => {
            // Логика обновления размеров канвасов при изменении ширины сайдбара
            // Здесь можно добавить код для fitToContainer
        });
    }

    // --- 1. REAL-TIME ---
    drawWaveform(byteData) {
        const w = this.waveCanvas.width, h = this.waveCanvas.height;
        this.waveCtx.fillStyle = '#020617'; 
        this.waveCtx.fillRect(0, 0, w, h);
        this.waveCtx.lineWidth = 1.5; 
        this.waveCtx.strokeStyle = '#3b82f6'; 
        this.waveCtx.beginPath();
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
        this.envCtx.clearRect(0,0,w,h); 
        this.envCtx.fillStyle='#0f172a'; 
        this.envCtx.fillRect(0,0,w,h);
        
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

    // --- 2. ПОДРОБНЫЕ ОГИБАЮЩИЕ ---
    drawFullEnvelopes(res) {
        const w = this.envCanvas.width, h = this.envCanvas.height;
        this.envCtx.fillStyle = '#0f172a'; 
        this.envCtx.fillRect(0,0,w,h);
        
        // Метод отрисовки с сохранением пиков (Min-Max)
        // Это делает график "лохматым" и подробным, а не сглаженным
        const drawDetailed = (data, color) => {
            this.envCtx.fillStyle = color;
            this.envCtx.strokeStyle = color;
            const step = Math.max(1, Math.floor(data.length / w));
            
            this.envCtx.beginPath();
            for (let x = 0; x < w; x++) {
                // Находим мин и макс в диапазоне, который соответствует этому пикселю
                let min = 1.0, max = 0.0;
                const start = x * step;
                const end = Math.min((x + 1) * step, data.length);
                
                for (let i = start; i < end; i++) {
                    if (data[i] < min) min = data[i];
                    if (data[i] > max) max = data[i];
                }
                
                // Рисуем вертикальную линию от мин до макс
                const yMax = h - (max * (h - 20)) - 10;
                const yMin = h - (min * (h - 20)) - 10;
                
                this.envCtx.moveTo(x, yMin);
                this.envCtx.lineTo(x, yMax);
            }
            this.envCtx.stroke();
        };

        if(res.rms) drawDetailed(res.rms, '#3b82f6'); // RMS (Синий)
        if(res.hilb) drawDetailed(res.hilb, 'rgba(239, 68, 68, 0.7)'); // Hilbert (Красный, полупрозрачный)
    }

    // --- 3. МАТРИЦА ---
    drawDTWMatrix(matrixData) {
        const { matrix, rows, cols } = matrixData;
        const w = this.dtwCanvas.width, h = this.dtwCanvas.height;
        this.dtwCtx.fillStyle = '#000'; this.dtwCtx.fillRect(0,0,w,h);
        
        const img = this.dtwCtx.createImageData(w, h);
        const d = img.data;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const my = Math.floor((y / h) * rows);
                const mx = Math.floor((x / w) * cols);
                const val = 1.0 - (matrix[my * cols + mx] || 0);
                const i = (y * w + x) * 4;
                d[i] = val*255; d[i+1] = val*100; d[i+2] = val*50; d[i+3] = 255;
            }
        }
        this.dtwCtx.putImageData(img, 0, 0);
    }

    // --- 4. КЛАСТЕРЫ (2D MAP) ---
    drawClusters(data) {
        // data: { assignments: [], centroids: [], points: [[x,y],...] }
        if (!this.clusterCanvas || !data.points) return;
        
        // Показываем панель кластеров
        const panel = document.getElementById('clusterVizPanel');
        if (panel) panel.classList.remove('hidden');

        const ctx = this.clusterCtx;
        const w = this.clusterCanvas.width;
        const h = this.clusterCanvas.height;
        
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        // Цвета кластеров
        const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

        // Рисуем точки
        data.points.forEach((pt, i) => {
            const clusterId = data.assignments[i];
            const color = colors[clusterId % colors.length];
            
            // Нормализация координат 0..1 -> canvas
            const x = pt[0] * w;
            const y = h - (pt[1] * h); // Y перевернут

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        });
        
        // Легенда
        const legend = document.getElementById('clusterLegend');
        if(legend) {
            legend.innerHTML = `Найдено ${data.centroids.length} кластеров`;
        }
    }
}
