self.lastAnalysis = null; // Кэш

self.onmessage = function(e) {
    const { type, payload } = e.data;

    if (type === 'init') self.postMessage({ type: 'ready' });

    // Real-Time Chunk
    if (type === 'process-chunk') {
        const res = processChunk(payload.data, payload.config);
        self.postMessage({ type: 'chunk-result', result: res });
    }

    // Extract Features (Full File)
    if (type === 'analyze-file') {
        try {
            const res = analyzeFull(payload.buffer, payload.sr, payload.config);
            self.lastAnalysis = res; // Сохраняем для DTW
            self.postMessage({ type: 'file-result', result: res, id: payload.id });
        } catch (err) {
            self.postMessage({ type: 'error', error: err.message });
        }
    }

    // Matrix Calculation
    if (type === 'run-dtw') {
        if (!self.lastAnalysis) {
            self.postMessage({ type: 'error', error: 'Нет данных. Нажмите Извлечь (Extract) сначала.' });
            return;
        }
        const matrix = calcMatrix(self.lastAnalysis);
        self.postMessage({ type: 'dtw-result', matrix });
    }
};

// --- LOGIC ---

function processChunk(data, cfg) {
    let sum=0, max=0;
    for(let i=0;i<data.length;i++) { 
        sum+=data[i]*data[i]; 
        if(Math.abs(data[i])>max) max=Math.abs(data[i]); 
    }
    return { rms: Math.sqrt(sum/data.length), centroid: 0, hilbertPeak: max }; 
    // Центроид убран для скорости в RT, если нужно - можно вернуть FFT
}

function analyzeFull(data, sr, cfg) {
    const envSr = cfg.envSr || 120;
    const hop = Math.floor(sr/envSr);
    const frames = Math.floor(data.length/hop);
    
    // Ограничиваем разрешение для матрицы (макс 200x200 точек для скорости отрисовки)
    const maxRes = 200;
    const step = Math.ceil(frames / maxRes);
    const outLen = Math.floor(frames / step);

    const rms = new Float32Array(outLen);
    const hilb = new Float32Array(outLen);

    for(let i=0; i<outLen; i++) {
        // Берем окно
        const idx = i * step * hop;
        const win = data.subarray(idx, idx + 2048); // Фиксированное окно анализа
        
        // Simple RMS
        let s=0; for(let k=0;k<win.length;k++) s+=win[k]*win[k];
        rms[i] = Math.sqrt(s/win.length);

        // Simple Envelope Follower (approx Hilbert)
        let max=0; for(let k=0;k<win.length;k++) if(Math.abs(win[k])>max) max=Math.abs(win[k]);
        hilb[i] = max;
    }

    return { rms, hilb, cent: rms, frames: outLen }; // Centroid пока дублируем RMS для теста
}

function calcMatrix(feats) {
    const n = feats.frames;
    const m = new Float32Array(n*n);
    
    // Самоподобие: евклидово расстояние между векторами [rms, hilb]
    let maxD = 0;
    for(let y=0; y<n; y++) {
        for(let x=0; x<n; x++) {
            const d1 = feats.rms[y] - feats.rms[x];
            const d2 = feats.hilb[y] - feats.hilb[x];
            const dist = Math.sqrt(d1*d1 + d2*d2);
            m[y*n + x] = dist;
            if(dist>maxD) maxD=dist;
        }
    }
    // Нормализация
    if(maxD>0) for(let i=0; i<m.length; i++) m[i] /= maxD;
    
    return { matrix: m, rows: n, cols: n };
}
