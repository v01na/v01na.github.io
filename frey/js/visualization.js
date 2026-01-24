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
        
        window.addEventListener('resize', () => {
            // Placeholder for resize logic
        });
    }

    // --- 1. REAL-TIME ---
    drawWaveform(byteData) {
        const w = this.waveCanvas.width;
        const h = this.waveCanvas.height;
        this.waveCtx.fillStyle = '#020617'; 
        this.waveCtx.fillRect(0, 0, w, h);
        
        this.waveCtx.lineWidth = 1.5; 
        this.waveCtx.strokeStyle = '#3b82f6'; 
        this.waveCtx.beginPath();
        
        const slice = w / byteData.length; 
        let x = 0;
        for (let i = 0; i < byteData.length; i++) {
            const v = byteData[i] / 128.0;
            const y = v * h / 2;
            i===0 ? this.waveCtx.moveTo(x, y) : this.waveCtx.lineTo(x, y);
            x += slice;
        }
        this.waveCtx.stroke();
    }

    drawRealTimeMetrics(m) {
        // Добавляем в историю
        this.metricsHistory.push(m);
        if (this.metricsHistory.length > this.maxHistory) this.metricsHistory.shift();
        
        const w = this.envCanvas.width;
        const h = this.envCanvas.height;
        
        // Очистка
        this.envCtx.clearRect(0, 0, w, h); 
        this.envCtx.fillStyle = '#0f172a'; 
        this.envCtx.fillRect(0, 0, w, h);
        
        // Рисуем линии
        this.drawPath(this.metricsHistory.map(x => x.rms * 4), '#3b82f6', h, w); // RMS (Blue)
        this.drawPath(this.metricsHistory.map(x => x.centroid / 8000), '#10b981', h, w); // Centroid (Green)
        this.drawPath(this.metricsHistory.map(x => x.hilbertPeak), '#ef4444', h, w); // Peak (Red)

        // --- ВОССТАНОВЛЕНО: Текстовые значения (HUD) ---
        const last = this.metricsHistory[this.metricsHistory.length - 1];
        if (last) {
            this.envCtx.font = '10px monospace';
            
            // RMS
            this.envCtx.fillStyle = '#3b82f6';
            this.envCtx.fillText(`RMS: ${last.rms.toFixed(4)}`, 10, 15);
            
            // Centroid
            this.envCtx.fillStyle = '#10b981';
            this.envCtx.fillText(`Centroid: ${Math.round(last.centroid)} Hz`, 10, 30);
            
            // Hilbert/Peak
            this.envCtx.fillStyle = '#ef4444';
            this.envCtx.fillText(`Peak: ${last.hilbertPeak.toFixed(4)}`, 10, 45);
        }
    }

    drawPath(data, color, h, w) {
        const step = w / this.maxHistory;
        this.envCtx.beginPath(); 
        this.envCtx.strokeStyle = color; 
        this.envCtx.lineWidth = 2;
        
        for(let i=0; i<data.length; i++){
            const val = Math.min(1, Math.max(0, data[i]));
            const y = h - (val * (h - 10)) - 5;
            const x = i * step;
            
            if(i===0) this.envCtx.moveTo(x, y);
            else this.envCtx.lineTo(x, y);
        }
        this.envCtx.stroke();
    }

    // --- 2. STATIC RESULTS ---
    drawFullEnvelopes(res) {
        const w = this.envCanvas.width;
        const h = this.envCanvas.height;
        this.envCtx.fillStyle = '#0f172a'; 
        this.envCtx.fillRect(0, 0, w, h);
        
        // Высокая детализация (Min-Max)
        const drawDetailed = (data, color) => {
            this.envCtx.fillStyle = color;
            this.envCtx.strokeStyle = color;
            this.envCtx.lineWidth = 1;
            
            const step = data.length / w;
            
            this.envCtx.beginPath();
            
            for (let x = 0; x < w; x++) {
                const start = Math.floor(x * step);
                const end = Math.floor((x + 1) * step);
                if (end <= start) continue;

                let min = 1.0;
                let max = 0.0;
                for (let i = start; i < end && i < data.length; i++) {
                    if (data[i] < min) min = data[i];
                    if (data[i] > max) max = data[i];
                }
                
                const yMax = h - (max * (h - 20)) - 10;
                const yMin = h - (min * (h - 20)) - 10;
                
                this.envCtx.moveTo(x, yMin);
                this.envCtx.lineTo(x, yMax);
            }
            this.envCtx.stroke();
        };

        if (res.rms) drawDetailed(res.rms, '#3b82f6');
        if (res.hilb) drawDetailed(res.hilb, 'rgba(239, 68, 68, 0.6)');
    }

    // --- 3. DTW MATRIX ---
    drawDTWMatrix(matrixData) {
        const { matrix, rows, cols } = matrixData;
        const w = this.dtwCanvas.width;
        const h = this.dtwCanvas.height;
        
        this.dtwCtx.fillStyle = '#000'; 
        this.dtwCtx.fillRect(0, 0, w, h);
        
        const img = this.dtwCtx.createImageData(w, h);
        const d = img.data;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const my = Math.floor((y / h) * rows);
                const mx = Math.floor((x / w) * cols);
                const val = 1.0 - (matrix[my * cols + mx] || 0);
                
                const i = (y * w + x) * 4;
                d[i]   = val * 255;
                d[i+1] = val * 100;
                d[i+2] = val * 50;
                d[i+3] = 255;
            }
        }
        this.dtwCtx.putImageData(img, 0, 0);
    }

    // --- 4. CLUSTERS ---
    drawClusters(data) {
        const panel = document.getElementById('clusterVizPanel');
        if (panel) panel.classList.remove('hidden');

        if (!this.clusterCtx || !data.points) return;

        const w = this.clusterCanvas.width;
        const h = this.clusterCanvas.height;
        const ctx = this.clusterCtx;
        
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

        // Points
        data.points.forEach((pt, i) => {
            const clusterId = data.assignments[i];
            const color = colors[clusterId % colors.length];
            const x = pt[0] * w;
            const y = h - (pt[1] * h);
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        });

        // Centroids
        data.centroids.forEach((c, i) => {
            const x = c[0] * w;
            const y = h - (c[1] * h);
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.fillText(`C${i}`, x + 8, y);
        });
        
        const leg = document.getElementById('clusterLegend');
        if(leg) leg.innerHTML = `Найдено кластеров: ${data.centroids.length}`;
    }
}
