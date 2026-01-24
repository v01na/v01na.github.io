// js/workers/dsp-worker.js

// Глобальное хранилище результатов анализа для последующих операций (DTW, Cluster)
self.lastAnalysis = null;

self.onmessage = function(e) {
    const { type, payload } = e.data;

    // 1. Инициализация
    if (type === 'init') {
        self.postMessage({ type: 'ready' });
    }

    // 2. Обработка чанка реального времени (для бегущих графиков)
    if (type === 'process-chunk') {
        const result = processRealTimeChunk(payload.data, payload.config);
        self.postMessage({ type: 'chunk-result', result });
    }

    // 3. Полный анализ файла (Извлечение признаков)
    if (type === 'analyze-file') {
        try {
            const result = analyzeFullBuffer(payload.buffer, payload.sr, payload.config);
            self.lastAnalysis = result; // Сохраняем в память
            self.postMessage({ type: 'file-result', result, id: payload.id });
        } catch (err) {
            self.postMessage({ type: 'error', error: err.message });
        }
    }

    // 4. Построение матрицы DTW
    if (type === 'run-dtw') {
        if (!self.lastAnalysis) {
            return self.postMessage({ type: 'error', error: 'Сначала выполните Извлечение (Extract)' });
        }
        const matrixData = calculateSelfSimilarityMatrix(self.lastAnalysis);
        self.postMessage({ type: 'dtw-result', matrix: matrixData });
    }

    // 5. Кластеризация (K-Means)
    if (type === 'run-cluster') {
        if (!self.lastAnalysis) {
            return self.postMessage({ type: 'error', error: 'Сначала выполните Извлечение (Extract)' });
        }
        
        const k = payload.k || 5;
        
        // Подготовка данных для кластеризации (Векторы [RMS, Hilbert])
        const points = [];
        const len = self.lastAnalysis.frames;
        for(let i = 0; i < len; i++) {
            // Нормализованные значения 0..1
            points.push([
                self.lastAnalysis.rms[i], 
                self.lastAnalysis.hilb[i]
            ]);
        }
        
        const clusterResult = kMeans(points, k);
        self.postMessage({ type: 'cluster-result', data: clusterResult });
    }
};

// --- АЛГОРИТМЫ ОБРАБОТКИ ---

function processRealTimeChunk(floatData, config) {
    const sr = config.sampleRate || 44100;
    
    // RMS
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < floatData.length; i++) {
        const v = floatData[i];
        sum += v * v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    const rms = Math.sqrt(sum / floatData.length);

    // Centroid
    const spec = magnitudeSpectrum(floatData);
    const centroid = calculateCentroid(spec.mag, sr, spec.N);

    return { rms, centroid, hilbertPeak: peak };
}

function analyzeFullBuffer(channelData, sr, config) {
    const envSr = config.envSr || 120; // Частота дискретизации огибающей
    const hopSize = Math.floor(sr / envSr);
    const winSize = Math.min(4096, nextPow2(hopSize * 4));
    
    const totalFrames = Math.floor(channelData.length / hopSize);
    
    // Чтобы график был подробным, мы не сжимаем его слишком сильно здесь.
    // Сжимать будем только при отрисовке на экране.
    // Ограничим макс 5000 точек, чтобы браузер не тормозил при передаче JSON
    const maxPoints = 5000;
    const step = Math.max(1, Math.ceil(totalFrames / maxPoints));
    const finalFrames = Math.floor(totalFrames / step);

    const rmsArr = new Float32Array(finalFrames);
    const centArr = new Float32Array(finalFrames);
    const hilbArr = new Float32Array(finalFrames);
    
    const frameBuffer = new Float32Array(winSize);

    for (let i = 0; i < finalFrames; i++) {
        const originalIndex = i * step * hopSize;
        
        // Заполняем буфер окна
        const len = Math.min(winSize, channelData.length - originalIndex);
        for(let k = 0; k < winSize; k++) {
            frameBuffer[k] = (k < len) ? channelData[originalIndex + k] : 0;
        }

        // 1. RMS
        let s = 0;
        for(let k=0; k<len; k++) s += frameBuffer[k] * frameBuffer[k];
        rmsArr[i] = Math.sqrt(s / (len || 1));

        // 2. Centroid
        const spec = magnitudeSpectrum(frameBuffer);
        centArr[i] = calculateCentroid(spec.mag, sr, spec.N);

        // 3. Hilbert
        hilbArr[i] = calculateAnalyticEnvelopeMean(frameBuffer);
    }

    return {
        rms: normalize(rmsArr),
        cent: normalize(centArr),
        hilb: normalize(hilbArr),
        frames: finalFrames,
        step: step
    };
}

// --- K-MEANS CLUSTERING ---

function kMeans(points, k) {
    if (points.length === 0) return { assignments: [], centroids: [], points: [] };

    // 1. Инициализация центроидов (случайные точки)
    let centroids = [];
    for (let i = 0; i < k; i++) {
        centroids.push([...points[Math.floor(Math.random() * points.length)]]);
    }

    let assignments = new Array(points.length).fill(-1);
    let changed = true;
    let iterations = 0;
    const maxIter = 50;

    while (changed && iterations < maxIter) {
        changed = false;
        
        // Шаг Assign: Находим ближайший центроид для каждой точки
        for (let i = 0; i < points.length; i++) {
            let minDist = Infinity;
            let clusterIndex = 0;
            
            for (let c = 0; c < k; c++) {
                const dx = points[i][0] - centroids[c][0];
                const dy = points[i][1] - centroids[c][1];
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist < minDist) {
                    minDist = dist;
                    clusterIndex = c;
                }
            }
            
            if (assignments[i] !== clusterIndex) {
                assignments[i] = clusterIndex;
                changed = true;
            }
        }

        // Шаг Update: Пересчитываем центры
        const sums = Array(k).fill(0).map(() => [0, 0]);
        const counts = Array(k).fill(0);

        for (let i = 0; i < points.length; i++) {
            const c = assignments[i];
            sums[c][0] += points[i][0];
            sums[c][1] += points[i][1];
            counts[c]++;
        }

        for (let c = 0; c < k; c++) {
            if (counts[c] > 0) {
                centroids[c][0] = sums[c][0] / counts[c];
                centroids[c][1] = sums[c][1] / counts[c];
            }
        }
        
        iterations++;
    }

    return { assignments, centroids, points };
}

function calculateSelfSimilarityMatrix(features) {
    const n = features.frames;
    // Ограничиваем размер матрицы для скорости (200x200)
    const size = Math.min(n, 200);
    const step = Math.floor(n / size);
    
    const matrix = new Float32Array(size * size);
    let maxDist = 0;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = y * step;
            const j = x * step;
            
            // Расстояние между векторами признаков в моменты времени i и j
            const dRMS = features.rms[i] - features.rms[j];
            const dHilb = features.hilb[i] - features.hilb[j];
            const dist = Math.sqrt(dRMS*dRMS + dHilb*dHilb);
            
            matrix[y * size + x] = dist;
            if (dist > maxDist) maxDist = dist;
        }
    }

    // Нормализация 0..1
    if (maxDist > 0) {
        for(let k=0; k<matrix.length; k++) matrix[k] /= maxDist;
    }

    return { matrix, rows: size, cols: size };
}

// --- МАТЕМАТИЧЕСКИЕ ФУНКЦИИ ---

function normalize(arr) {
    let min = Infinity, max = -Infinity;
    for(let i=0; i<arr.length; i++) {
        if(arr[i] < min) min = arr[i];
        if(arr[i] > max) max = arr[i];
    }
    const range = max - min;
    if (range < 1e-9) return arr;
    
    const out = new Float32Array(arr.length);
    for(let i=0; i<arr.length; i++) out[i] = (arr[i] - min) / range;
    return out;
}

function calculateCentroid(mag, sr, N) {
    let num = 0, den = 0;
    const binWidth = sr / N;
    for (let k = 0; k < mag.length; k++) {
        num += mag[k] * (k * binWidth);
        den += mag[k];
    }
    return den > 0 ? num / den : 0;
}

function magnitudeSpectrum(frame) {
    const N = nextPow2(frame.length);
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for(let i=0; i<frame.length; i++) re[i] = frame[i];
    
    fft(re, im);
    
    const mag = new Float32Array(N/2 + 1);
    for(let i=0; i<mag.length; i++) {
        mag[i] = Math.sqrt(re[i]*re[i] + im[i]*im[i]);
    }
    return { mag, N };
}

function calculateAnalyticEnvelopeMean(frame) {
    const N = nextPow2(frame.length);
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for(let i=0; i<frame.length; i++) re[i] = frame[i];

    fft(re, im);

    // Преобразование Гильберта
    const half = N/2;
    for(let i=1; i<half; i++) {
        re[i] *= 2; im[i] *= 2;
        re[N-i] = 0; im[N-i] = 0;
    }

    inverse_fft(re, im);

    let sum = 0;
    for(let i=0; i<frame.length; i++) {
        sum += Math.sqrt(re[i]*re[i] + im[i]*im[i]);
    }
    return sum / frame.length;
}

function nextPow2(n) {
    let p = 1; while(p < n) p <<= 1; return p;
}

function fft(re, im) {
    const n = re.length;
    let j = 0;
    for (let i = 1; i < n; i++) {
        let bit = n >> 1;
        while (j & bit) { j ^= bit; bit >>= 1; }
        j ^= bit;
        if (i < j) {
            let t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len;
        const wlen_r = Math.cos(ang);
        const wlen_i = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let w_r = 1;
            let w_i = 0;
            for (let k = 0; k < len / 2; k++) {
                const u_r = re[i + k], u_i = im[i + k];
                const v_r = re[i + k + len / 2] * w_r - im[i + k + len / 2] * w_i;
                const v_i = re[i + k + len / 2] * w_i + im[i + k + len / 2] * w_r;
                re[i + k] = u_r + v_r;
                im[i + k] = u_i + v_i;
                re[i + k + len / 2] = u_r - v_r;
                im[i + k + len / 2] = u_i - v_i;
                const tmp = w_r * wlen_r - w_i * wlen_i;
                w_i = w_r * wlen_i + w_i * wlen_r;
                w_r = tmp;
            }
        }
    }
}

function inverse_fft(re, im) {
    for(let i=0; i<im.length; i++) im[i] = -im[i];
    fft(re, im);
    const n = re.length;
    for(let i=0; i<n; i++) {
        re[i] /= n;
        im[i] = -im[i] / n;
    }
}
