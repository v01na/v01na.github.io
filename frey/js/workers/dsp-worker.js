self.lastAnalysis = null;

self.onmessage = function(e) {
    const { type, payload } = e.data;

    if (type === 'init') self.postMessage({ type: 'ready' });

    if (type === 'process-chunk') {
        const res = processRealTimeChunk(payload.data, payload.config);
        self.postMessage({ type: 'chunk-result', result: res });
    }

    if (type === 'analyze-file') {
        try {
            const res = analyzeFullBuffer(payload.buffer, payload.sr, payload.config);
            self.lastAnalysis = res; 
            self.postMessage({ type: 'file-result', result: res, id: payload.id });
        } catch (err) {
            self.postMessage({ type: 'error', error: err.message });
        }
    }

    if (type === 'run-dtw') {
        if (!self.lastAnalysis) return self.postMessage({type:'error', error:'Нет данных (Extract сначала)'});
        const m = calculateSelfSimilarityMatrix(self.lastAnalysis);
        self.postMessage({ type: 'dtw-result', matrix: m });
    }

    // --- КЛАСТЕРИЗАЦИЯ ---
    if (type === 'run-cluster') {
        if (!self.lastAnalysis) return self.postMessage({type:'error', error:'Нет данных (Extract сначала)'});
        
        const k = payload.k || 5;
        // Подготовка данных: вектора [RMS, Hilbert]
        const points = [];
        const n = self.lastAnalysis.frames;
        for(let i=0; i<n; i++) {
            points.push([self.lastAnalysis.rms[i], self.lastAnalysis.hilb[i]]);
        }
        
        const result = kMeans(points, k);
        self.postMessage({ type: 'cluster-result', data: result });
    }
};

// --- ALGORITHMS ---

function kMeans(points, k) {
    if (!points.length) return null;
    
    // Init centroids random
    let centroids = [];
    for(let i=0; i<k; i++) centroids.push([...points[Math.floor(Math.random()*points.length)]]);
    
    let assignments = new Array(points.length).fill(-1);
    let changed = true;
    let iter = 0;

    while(changed && iter < 50) {
        changed = false;
        // Assign
        for(let i=0; i<points.length; i++) {
            let minDist = Infinity;
            let bestC = 0;
            for(let c=0; c<k; c++) {
                const d = dist(points[i], centroids[c]);
                if(d < minDist) { minDist = d; bestC = c; }
            }
            if(assignments[i] !== bestC) {
                assignments[i] = bestC;
                changed = true;
            }
        }
        // Update
        let sums = Array(k).fill(0).map(()=>[0,0]);
        let counts = Array(k).fill(0);
        for(let i=0; i<points.length; i++) {
            const c = assignments[i];
            sums[c][0] += points[i][0];
            sums[c][1] += points[i][1];
            counts[c]++;
        }
        for(let c=0; c<k; c++) {
            if(counts[c]>0) {
                centroids[c][0] = sums[c][0]/counts[c];
                centroids[c][1] = sums[c][1]/counts[c];
            }
        }
        iter++;
    }
    return { assignments, centroids, points }; // Возвращаем точки тоже для отрисовки
}

function dist(a, b) {
    return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2);
}

function processRealTimeChunk(d, cfg) {
    let s=0, m=0;
    for(let i=0;i<d.length;i++){ s+=d[i]*d[i]; if(Math.abs(d[i])>m)m=Math.abs(d[i]); }
    const spec = magnitudeSpectrum(d);
    const c = calculateCentroid(spec.mag, cfg.sampleRate||44100, spec.N);
    return { rms: Math.sqrt(s/d.length), centroid: c, hilbertPeak: m };
}

function analyzeFullBuffer(data, sr, cfg) {
    const envSr = cfg.envSr || 120;
    const hop = Math.floor(sr/envSr);
    const frames = Math.floor(data.length/hop);
    
    // Больше точек для "подробного" графика
    const maxRes = 2000; // Увеличили разрешение
    const step = Math.ceil(frames / maxRes);
    const outLen = Math.floor(frames / step);

    const rms = new Float32Array(outLen);
    const hilb = new Float32Array(outLen);
    const cent = new Float32Array(outLen);
    const frame = new Float32Array(4096);

    for(let i=0; i<outLen; i++) {
        const idx = i*step*hop;
        const len = Math.min(4096, data.length - idx);
        for(let k=0;k<4096;k++) frame[k] = (k<len)?data[idx+k]:0;

        let s=0; for(let k=0;k<len;k++) s+=frame[k]*frame[k];
        rms[i] = Math.sqrt(s/(len||1));
        
        const spec = magnitudeSpectrum(frame);
        cent[i] = calculateCentroid(spec.mag, sr, spec.N);
        hilb[i] = calculateAnalyticEnvelopeMean(frame);
    }
    return { rms: normalize(rms), hilb: normalize(hilb), cent: normalize(cent), frames: outLen, step };
}

function calculateSelfSimilarityMatrix(f) {
    const n = f.frames;
    // Ограничим матрицу для скорости, если точек все еще много
    const mSize = Math.min(n, 200); 
    const step = Math.floor(n / mSize);
    const matrix = new Float32Array(mSize*mSize);
    
    let maxD=0;
    for(let y=0; y<mSize; y++) {
        for(let x=0; x<mSize; x++) {
            const i = y*step; const j = x*step;
            const d = Math.sqrt((f.rms[i]-f.rms[j])**2 + (f.hilb[i]-f.hilb[j])**2);
            matrix[y*mSize+x] = d;
            if(d>maxD) maxD=d;
        }
    }
    if(maxD>0) for(let k=0;k<matrix.length;k++) matrix[k]/=maxD;
    return { matrix, rows: mSize, cols: mSize };
}

// Helpers
function normalize(a){let min=Infinity,max=-Infinity;for(let i=0;i<a.length;i++){if(a[i]<min)min=a[i];if(a[i]>max)max=a[i]}const r=max-min;if(r<1e-9)return a;const o=new Float32Array(a.length);for(let i=0;i<a.length;i++)o[i]=(a[i]-min)/r;return o}
function calculateCentroid(m,sr,N){let n=0,d=0,w=sr/N;for(let i=0;i<m.length;i++){n+=m[i]*i*w;d+=m[i]}return d>0?n/d:0}
function magnitudeSpectrum(f){const N=nextPow2(f.length);const r=new Float32Array(N),im=new Float32Array(N);for(let i=0;i<f.length;i++)r[i]=f[i];fft(r,im);const m=new Float32Array(N/2+1);for(let i=0;i<m.length;i++)m[i]=Math.sqrt(r[i]**2+im[i]**2);return{mag:m,N}}
function calculateAnalyticEnvelopeMean(f){const N=nextPow2(f.length);const r=new Float32Array(N),im=new Float32Array(N);for(let i=0;i<f.length;i++)r[i]=f[i];fft(r,im);for(let i=1;i<N/2;i++){r[i]*=2;im[i]*=2;r[N-i]=0;im[N-i]=0}inverse_fft(r,im);let s=0;for(let i=0;i<f.length;i++)s+=Math.sqrt(r[i]**2+im[i]**2);return s/f.length}
function nextPow2(n){let p=1;while(p<n)p<<=1;return p}
function fft(re,im){const n=re.length;let j=0;for(let i=1;i<n;i++){let b=n>>1;while(j&b){j^=b;b>>=1}j^=b;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}for(let l=2;l<=n;l<<=1){const a=-2*Math.PI/l,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=l){let tr=1,ti=0;for(let k=0;k<l/2;k++){const ur=re[i+k],ui=im[i+k],vr=re[i+k+l/2]*tr-im[i+k+l/2]*ti,vi=re[i+k+l/2]*ti+im[i+k+l/2]*tr;re[i+k]=ur+vr;im[i+k]=ui+vi;re[i+k+l/2]=ur-vr;im[i+k+l/2]=ui-vi;const t=tr*wr-ti*wi;ti=tr*wi+ti*wr;tr=t}}}}
function inverse_fft(re,im){for(let i=0;i<im.length;i++)im[i]=-im[i];fft(re,im);const n=re.length;for(let i=0;i<n;i++){re[i]/=n;im[i]=-im[i]/n}}
