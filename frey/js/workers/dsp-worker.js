// js/workers/dsp-worker.js

self.onmessage = function(e) {
    const { type, payload } = e.data;

    if (type === 'init') {
        self.postMessage({ type: 'ready' });
    }

    // 1. Обработка кусочка аудио в реальном времени
    if (type === 'process-chunk') {
        const result = processRealTimeChunk(payload.data, payload.config);
        self.postMessage({ type: 'chunk-result', result });
    }

    // 2. Глубокий анализ целого файла
    if (type === 'analyze-file') {
        try {
            const result = analyzeFullBuffer(payload.buffer, payload.sr, payload.config);
            self.postMessage({ type: 'file-result', result, id: payload.id });
        } catch (err) {
            self.postMessage({ type: 'error', error: err.message });
        }
    }
};

// --- ALGORITHMS ---

// Быстрый анализ короткого буфера (для визуализации)
function processRealTimeChunk(floatTimeData, config) {
    const sr = config.sampleRate || 44100;
    
    // 1. RMS (Энергия)
    let sumSq = 0;
    let maxAmp = 0;
    for (let i = 0; i < floatTimeData.length; i++) {
        const val = floatTimeData[i];
        sumSq += val * val;
        if (Math.abs(val) > maxAmp) maxAmp = Math.abs(val);
    }
    const rms = Math.sqrt(sumSq / floatTimeData.length);

    // 2. Spectral Centroid (через FFT)
    const spec = magnitudeSpectrum(floatTimeData);
    const centroid = calculateCentroid(spec.mag, sr, spec.N);

    return {
        rms: rms,
        centroid: centroid,
        hilbertPeak: maxAmp // Упрощение для RT
    };
}

// Полный анализ длинного буфера
function analyzeFullBuffer(channelData, sr, config) {
    const envSr = config.envSr || 120;
    const hopSize = Math.floor(sr / envSr);
    const winSize = Math.min(4096, nextPow2(hopSize * 4));
    const nFrames = Math.floor(channelData.length / hopSize);

    const rmsArr = new Float32Array(nFrames);
    const centArr = new Float32Array(nFrames);
    const hilbArr = new Float32Array(nFrames);

    // Временный буфер для окна
    const frameBuffer = new Float32Array(winSize);

    for (let i = 0; i < nFrames; i++) {
        const start = i * hopSize;
        
        // Копируем данные в окно с zero-padding
        const end = Math.min(start + winSize, channelData.length);
        const len = end - start;
        
        for(let k=0; k<winSize; k++) {
            frameBuffer[k] = (k < len) ? channelData[start + k] : 0;
        }

        // 1. RMS
        let s = 0;
        for(let j=0; j<len; j++) s += frameBuffer[j] * frameBuffer[j];
        rmsArr[i] = Math.sqrt(s / (len || 1));

        // 2. Centroid
        const spec = magnitudeSpectrum(frameBuffer);
        centArr[i] = calculateCentroid(spec.mag, sr, spec.N);

        // 3. Hilbert (Analytic Envelope Mean)
        hilbArr[i] = calculateAnalyticEnvelopeMean(frameBuffer);
    }

    return {
        rms: normalize(rmsArr),
        cent: normalize(centArr),
        hilb: normalize(hilbArr),
        frames: nFrames,
        duration: channelData.length / sr
    };
}

// --- MATH HELPERS ---

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
        const val = mag[k];
        num += val * (k * binWidth);
        den += val;
    }
    return den > 1e-9 ? num / den : 0;
}

function magnitudeSpectrum(frame) {
    const N = nextPow2(frame.length);
    // Подготовка для FFT
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

    // Hilbert Transform in Frequency Domain:
    // H(f) = X(f) * -j*sgn(f)
    // Analytic Signal Z(f) = X(f) * (1 + sgn(f))
    // DC stays, Pos freqs * 2, Neg freqs * 0
    const half = N/2;
    for(let i=1; i<half; i++) {
        re[i] *= 2; 
        im[i] *= 2;
        re[N-i] = 0; 
        im[N-i] = 0;
    }
    // Nyquist (N/2) stays same (technically)

    inverse_fft(re, im);

    let sum = 0;
    for(let i=0; i<frame.length; i++) {
        // Envelope is magnitude of analytic signal
        sum += Math.sqrt(re[i]*re[i] + im[i]*im[i]);
    }
    return sum / frame.length;
}

// --- FFT CORE (Radix-2 In-Place Cooley-Tukey) ---
function nextPow2(n) {
    let p=1; while(p<n) p<<=1; return p;
}

function fft(re, im) {
    const n = re.length;
    // Bit Reversal
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
    // Butterfly
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len;
        const wlen_r = Math.cos(ang);
        const wlen_i = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let w_r = 1;
            let w_i = 0;
            for (let k = 0; k < len / 2; k++) {
                const u_r = re[i + k];
                const u_i = im[i + k];
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
    // Conjugate input
    for(let i=0; i<im.length; i++) im[i] = -im[i];
    
    fft(re, im);
    
    // Scale & Conjugate output
    const n = re.length;
    for(let i=0; i<n; i++) {
        re[i] /= n;
        im[i] = -im[i] / n;
    }
}
