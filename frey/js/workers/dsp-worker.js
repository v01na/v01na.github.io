// js/workers/dsp-worker.js

// Кэш для хранения результата анализа, чтобы DTW мог использовать его позже
self.lastAnalysis = null;

self.onmessage = function(e) {
    const { type, payload } = e.data;

    if (type === 'init') {
        self.postMessage({ type: 'ready' });
    }

    // 1. Обработка чанка в реальном времени (для бегущих графиков)
    if (type === 'process-chunk') {
        const result = processRealTimeChunk(payload.data, payload.config);
        self.postMessage({ type: 'chunk-result', result });
    }

    // 2. Глубокий анализ всего файла (для "Извлечь")
    if (type === 'analyze-file') {
        try {
            const result = analyzeFullBuffer(payload.buffer, payload.sr, payload.config);
            self.lastAnalysis = result; // Сохраняем в память воркера
            self.postMessage({ type: 'file-result', result, id: payload.id });
        } catch (err) {
            self.postMessage({ type: 'error', error: err.message });
        }
    }

    // 3. Расчет матрицы DTW (требует предварительного анализа)
    if (type === 'run-dtw') {
        if (!self.lastAnalysis) {
            self.postMessage({ type: 'error', error: 'Нет данных для матрицы. Сначала нажмите "Извлечь".' });
            return;
        }
        // Считаем матрицу
        const matrixData = calculateSelfSimilarityMatrix(self.lastAnalysis);
        self.postMessage({ type: 'dtw-result', matrix: matrixData });
    }
};

// --- ОСНОВНЫЕ АЛГОРИТМЫ ---

function processRealTimeChunk(floatTimeData, config) {
    const sr = config.sampleRate || 44100;

    // 1. RMS (Энергия)
    let sumSq = 0;
    let maxPeak = 0;
    for (let i = 0; i < floatTimeData.length; i++) {
        const val = floatTimeData[i];
        sumSq += val * val;
        if (Math.abs(val) > maxPeak) maxPeak = Math.abs(val);
    }
    const rms = Math.sqrt(sumSq / floatTimeData.length);

    // 2. Centroid (Спектральная яркость)
    const spec = magnitudeSpectrum(floatTimeData);
    const centroid = calculateCentroid(spec.mag, sr, spec.N);

    return {
        rms: rms,
        centroid: centroid,
        hilbertPeak: maxPeak // Для RT используем пиковый детектор как простую замену Гильберту
    };
}

function analyzeFullBuffer(channelData, sr, config) {
    const envSr = config.envSr || 120; // Частота дискретизации огибающей
    const hopSize = Math.floor(sr / envSr);
    const winSize = Math.min(4096, nextPow2(hopSize * 4));
    
    // Определяем кол-во фреймов
    const totalFrames = Math.floor(channelData.length / hopSize);
    
    // Ограничение разрешения для отрисовки матрицы (иначе браузер зависнет рисовать 10000x10000)
    // Мы усредняем данные, чтобы получить ~300-400 точек для матрицы
    const targetResolution = 400; 
    const step = Math.max(1, Math.floor(totalFrames / targetResolution));
    const finalFrames = Math.floor(totalFrames / step);

    const rmsArr = new Float32Array(finalFrames);
    const centArr = new Float32Array(finalFrames);
    const hilbArr = new Float32Array(finalFrames);
    
    // Временный буфер окна
    const frameBuffer = new Float32Array(winSize);

    for (let i = 0; i < finalFrames; i++) {
        // Индекс начала окна в исходном массиве
        const originalIndex = i * step * hopSize;
        
        // Копируем данные в окно (с Zero padding)
        const len = Math.min(winSize, channelData.length - originalIndex);
        for(let k=0; k<winSize; k++) {
            frameBuffer[k] = (k < len) ? channelData[originalIndex + k] : 0;
        }

        // 1. RMS
        let s = 0;
        for(let k=0; k<len; k++) s += frameBuffer[k] * frameBuffer[k];
        rmsArr[i] = Math.sqrt(s / (len || 1));

        // 2. Centroid
        const spec = magnitudeSpectrum(frameBuffer);
        centArr[i] = calculateCentroid(spec.mag, sr, spec.N);

        // 3. Hilbert (Аналитическая огибающая)
        hilbArr[i] = calculateAnalyticEnvelopeMean(frameBuffer);
    }

    return {
        rms: normalize(rmsArr),
        cent: normalize(centArr),
        hilb: normalize(hilbArr),
        frames: finalFrames,
        step: step,
        duration: channelData.length / sr
    };
}

// Расчет Матрицы Самоподобия (Self-Similarity Matrix)
// Используется для визуализации структуры сигнала (повторяющиеся паттерны)
function calculateSelfSimilarityMatrix(features) {
    const n = features.frames;
    const matrix = new Float32Array(n * n);

    // Подготовка векторов признаков [RMS, Hilbert]
    // Можно добавить Centroid, но он часто шумный
    const vectors = [];
    for(let i=0; i<n; i++) {
        vectors.push([features.rms[i], features.hilb[i]]);
    }

    let maxDist = 0;

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const v1 = vectors[i];
            const v2 = vectors[j];
            
            // Евклидово расстояние
            const dx = v1[0] - v2[0];
            const dy = v1[1] - v2[1];
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            matrix[i * n + j] = dist;
            if (dist > maxDist) maxDist = dist;
        }
    }

    // Нормализация матрицы 0..1
    if (maxDist > 1e-9) {
        for(let k=0; k<matrix.length; k++) matrix[k] /= maxDist;
    }

    return { matrix, rows: n, cols: n };
}

// --- ВСПОМОГАТЕЛЬНАЯ МАТЕМАТИКА ---

function normalize(arr) {
    let min = Infinity, max = -Infinity;
    for(let i=0; i<arr.length; i++) {
        if(arr[i] < min) min = arr[i];
        if(arr[i] > max) max = arr[i];
    }
    const range = max - min;
    if (range < 1e-9) return arr; // Избегаем деления на 0
    
    const out = new Float32Array(arr.length);
    for(let i=0; i<arr.length; i++) out[i] = (arr[i] - min) / range;
    return out;
}

function calculateCentroid(mag, sr, N) {
    let num = 0, den = 0;
    const binWidth = sr / N;
    for (let k = 0; k < mag.length; k++) {
        const val = mag[k];
        num += val * (k * binWidth); // Амплитуда * Частоту
        den += val;                  // Сумма амплитуд
    }
    return den > 1e-9 ? num / den : 0;
}

function magnitudeSpectrum(frame) {
    const N = nextPow2(frame.length);
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    
    // Копирование
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

    // Преобразование Гильберта в частотной области:
    // Удваиваем положительные частоты, обнуляем отрицательные
    const half = N/2;
    for(let i=1; i<half; i++) {
        re[i] *= 2; 
        im[i] *= 2;
        re[N-i] = 0; 
        im[N-i] = 0;
    }

    inverse_fft(re, im);

    let sum = 0;
    for(let i=0; i<frame.length; i++) {
        // Огибающая = Модуль аналитического сигнала
        sum += Math.sqrt(re[i]*re[i] + im[i]*im[i]);
    }
    return sum / frame.length;
}

// --- FFT CORE (Radix-2 In-Place Cooley-Tukey) ---
function nextPow2(n) { let p=1; while(p<n) p<<=1; return p; }

function fft(re, im) {
    const n = re.length;
    let j = 0;
    for (let i = 1; i < n; i++) {
        let bit = n >> 1;
        while (j & bit) { j ^= bit; bit >>= 1; }
        j ^= bit;
        if (i < j) {
            let tr = re[i]; re[i] = re[j]; re[j] = tr;
            tr = im[i]; im[i] = im[j]; im[j] = tr;
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
                re[i + k] = u_r + v_r; im[i + k] = u_i + v_i;
                re[i + k + len / 2] = u_r - v_r; im[i + k + len / 2] = u_i - v_i;
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
