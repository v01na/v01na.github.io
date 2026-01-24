// js/workers/dsp-worker.js

self.onmessage = function(e) {
    const { type, payload } = e.data;

    if (type === 'init') {
        console.log('[DSP Worker] Ready');
    }

    // Обработка кусочка аудио в реальном времени (для визуализации потока)
    if (type === 'process-chunk') {
        const result = processRealTimeChunk(payload.data, payload.config);
        self.postMessage({ type: 'chunk-result', result });
    }

    // Полный анализ файла (для кластеризации и детального разбора)
    if (type === 'analyze-file') {
        try {
            const result = analyzeFullBuffer(payload.buffer, payload.sr, payload.config);
            self.postMessage({ type: 'file-result', result, id: payload.id });
        } catch (err) {
            self.postMessage({ type: 'error', error: err.message });
        }
    }
};

// --- МАТЕМАТИЧЕСКОЕ ЯДРО ---

// 1. Быстрая обработка чанка (Real-Time)
function processRealTimeChunk(floatTimeData, config) {
    // floatTimeData - это Float32Array (амплитуда -1..1)
    
    // 1. RMS (Энергия)
    let sumSq = 0;
    for (let i = 0; i < floatTimeData.length; i++) {
        sumSq += floatTimeData[i] * floatTimeData[i];
    }
    const rms = Math.sqrt(sumSq / floatTimeData.length);

    // 2. Спектральный Центроид (Яркость звука)
    // Нужен FFT. Для скорости в RT делаем упрощенный расчет или полноценный FFT
    // Здесь используем полноценный, так как чанки небольшие (2048/4096)
    const spec = magnitudeSpectrum(floatTimeData);
    const centroid = calculateCentroid(spec.mag, config.sampleRate || 44100, spec.N);

    // 3. Огибающая Гильберта (приближенная для скорости)
    // В RT полная трансформация Гильберта тяжеловата, используем пиковый детектор
    // или упрощенную версию. Здесь оставим пик для скорости отрисовки.
    let maxAmp = 0;
    for (let i = 0; i < floatTimeData.length; i++) {
        const abs = Math.abs(floatTimeData[i]);
        if (abs > maxAmp) maxAmp = abs;
    }

    return {
        rms: rms,
        centroid: centroid,
        hilbertPeak: maxAmp // Для визуализации в реальном времени этого достаточно
    };
}

// 2. Полный анализ (Deep Dive)
function analyzeFullBuffer(channelData, sr, config) {
    // Здесь будет логика extractEnvelopes из старого скрипта
    // Разрезаем на окна, считаем FFT и Гильберта для каждого окна
    
    const envSr = config.envSr || 120; // Частота точек огибающей
    const hopSize = Math.floor(sr / envSr);
    const winSize = Math.min(2048, hopSize * 4);
    const nFrames = Math.floor(channelData.length / hopSize);

    const rms = new Float32Array(nFrames);
    const cent = new Float32Array(nFrames);
    const hilb = new Float32Array(nFrames);

    for (let i = 0; i < nFrames; i++) {
        const start = i * hopSize;
        let frame = channelData.subarray(start, start + winSize);
        
        // Zero padding если кадр неполный
        if (frame.length < winSize) {
            const tmp = new Float32Array(winSize);
            tmp.set(frame);
            frame = tmp;
        }

        // --- DSP Process Frame ---
        
        // 1. RMS
        let s = 0; 
        for(let j=0; j<frame.length; j++) s += frame[j]*frame[j];
        rms[i] = Math.sqrt(s / frame.length);

        // 2. Centroid
        const spec = magnitudeSpectrum(frame);
        cent[i] = calculateCentroid(spec.mag, sr, spec.N);

        // 3. Hilbert (Analytic Envelope)
        // Считаем полноценную огибающую через FFT
        hilb[i] = calculateAnalyticEnvelopeMean(frame);
    }

    return {
        rms: normalize(rms),
        cent: normalize(cent),
        hilb: normalize(hilb),
        frames: nFrames,
        duration: channelData.length / sr
    };
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function normalize(arr) {
    let min = Infinity, max = -Infinity;
    for(let i=0; i<arr.length; i++) {
        if(arr[i] < min) min = arr[i];
        if(arr[i] > max) max = arr[i];
    }
    const range = max - min;
    if (range < 1e-9) return arr;
    
    const out = new Float32Array(arr.length);
    for(let i=0; i<arr.length; i++) {
        out[i] = (arr[i] - min) / range;
    }
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
    
    // Копируем данные
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

    // Hilbert logic in freq domain:
    // 0, N/2 stay same. 1..N/2-1 multiply by 2. N/2+1..N-1 zero out.
    const half = N/2;
    for(let i=1; i<half; i++) {
        re[i] *= 2; im[i] *= 2;
        re[N-i] = 0; im[N-i] = 0;
    }
    
    inverse_fft(re, im);
    
    let sumEnv = 0;
    for(let i=0; i<frame.length; i++) {
        sumEnv += Math.sqrt(re[i]*re[i] + im[i]*im[i]);
    }
    return sumEnv / frame.length;
}

// --- FFT Core (Simple Radix-2) ---
function nextPow2(n) {
    let p=1; while(p<n) p<<=1; return p;
}

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
        let ang = -2 * Math.PI / len;
        let wlen_r = Math.cos(ang), wlen_i = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let w_r = 1, w_i = 0;
            for (let k = 0; k < len / 2; k++) {
                let u_r = re[i + k], u_i = im[i + k];
                let v_r = re[i + k + len / 2] * w_r - im[i + k + len / 2] * w_i;
                let v_i = re[i + k + len / 2] * w_i + im[i + k + len / 2] * w_r;
                re[i + k] = u_r + v_r; im[i + k] = u_i + v_i;
                re[i + k + len / 2] = u_r - v_r; im[i + k + len / 2] = u_i - v_i;
                let tmp = w_r * wlen_r - w_i * wlen_i;
                w_i = w_r * wlen_i + w_i * wlen_r;
                w_r = tmp;
            }
        }
    }
}

function inverse_fft(re, im) {
    // Conjugate
    for(let i=0; i<im.length; i++) im[i] = -im[i];
    fft(re, im);
    // Scale & Conjugate back
    const n = re.length;
    for(let i=0; i<n; i++) {
        re[i] /= n;
        im[i] = -im[i] / n;
    }
}
