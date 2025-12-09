(function(){
  'use strict';

  /* ===========================
     Общие DOM/состояние/логика
     =========================== */

  // Переключатель левой панели
  var toggleBtn = document.getElementById('btnToggleSidebar');
  if (toggleBtn) toggleBtn.addEventListener('click', function(){
    document.body.classList.toggle('sidebar-collapsed');
  });

  // Базовый CDN со словами; для букв можно заменить на .../samples_letters/
  var basePath='https://cryptq.github.io/audio/samples_test/samples/';

  // Узлы интерфейса
  var btnRetryList=document.getElementById('btnRetryList');
  var fileInput=document.getElementById('fileInput');
  var urlList=document.getElementById('urlList');
  var btnLoadUrls=document.getElementById('btnLoadUrls');
  var btnLoadDemo=document.getElementById('btnLoadDemo');
  var btnClearList=document.getElementById('btnClearList');
  var sampleSelect=document.getElementById('sampleSelect');
  var btnPlay=document.getElementById('btnPlay');
  var btnStop=document.getElementById('btnStop');
  var btnExtract=document.getElementById('btnExtract');
  var btnMatch=document.getElementById('btnMatch');
  var btnExport=document.getElementById('btnExport');
  var btnSelfTest=document.getElementById('btnSelfTest');
  var btnUnitTests=document.getElementById('btnUnitTests');

  // Параметры извлечения
  var env_sr_input=document.getElementById('env_sr');
  var use_rms=document.getElementById('use_rms');
  var use_centroid=document.getElementById('use_centroid');
  var use_hilbert=document.getElementById('use_hilbert');

  // Предобработка
  var pp_dc=document.getElementById('pp_dc');
  var pp_pre=document.getElementById('pp_pre');
  var pp_hp=document.getElementById('pp_hp');
  var pp_lp=document.getElementById('pp_lp');
  var pp_gate=document.getElementById('pp_gate');
  var pp_gate_init=document.getElementById('pp_gate_init');
  var pp_gate_mul=document.getElementById('pp_gate_mul');
  var pp_gate_red=document.getElementById('pp_gate_red');
  var pp_vad=document.getElementById('pp_vad');
  var pp_vad_q=document.getElementById('pp_vad_q');
  var pp_vad_cf=document.getElementById('pp_vad_cf');

  // Параметры сопоставления
  var dtw_len_input=document.getElementById('dtw_len');
  var topk_input=document.getElementById('topk');
  var dtw_band_input=document.getElementById('dtw_band');
  var use_znorm=document.getElementById('use_znorm');

  // Прочее
  var sampleInfo=document.getElementById('sampleInfo');
  var logEl=document.getElementById('log');
  var resultsEl=document.getElementById('results');
  var decodeHTML=document.getElementById('decodeHTML');

  // Канвасы
  var waveCanvas=document.getElementById('waveCanvas');
  var envCanvas=document.getElementById('envCanvas');
  var dtwCanvas=document.getElementById('dtwCanvas');
  var waveCtx=waveCanvas.getContext('2d');
  var envCtx=envCanvas.getContext('2d');
  var dtwCtx=dtwCanvas.getContext('2d');

  // Прогресс-бар
  var progressBox=document.getElementById('progress');
  var progressFill=document.getElementById('progressFill');
  var progressPhase=document.getElementById('progressPhase');
  var progressPct=document.getElementById('progressPct');
  var progressElapsed=document.getElementById('progressElapsed');
  var progressEta=document.getElementById('progressEta');

  // Аудио контексты
  var audioCtx=null, offlineCtx=null, sourceNode=null;

  // Данные
  var samples=[], currentIndex=-1, lastExtract=null, lastMatchRes=null;
  
  // ========================
  // НОВЫЕ ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
  // ========================
  var clusterResults = null; // {clusters: [], centroids: [], samplesByCluster: {}}
  var featureVectors = [];   // Векторы признаков для всех образцов
  
  // Новые DOM элементы
  var btnCluster = document.getElementById('btnCluster');
  var btnVisualizeClusters = document.getElementById('btnVisualizeClusters');
  var btnExtractAll = document.getElementById('btnExtractAll');
  var clusterResultsDiv = document.getElementById('clusterResults');
  var clusterCanvas = document.getElementById('clusterCanvas');
  var clusterCtx = clusterCanvas ? clusterCanvas.getContext('2d') : null;
  var clusterVizPanel = document.getElementById('clusterVizPanel');
  var clusterDetailsPanel = document.getElementById('clusterDetailsPanel');
  var clusterDetailsDiv = document.getElementById('clusterDetails');
  var clusterLegend = document.getElementById('clusterLegend');
  
  // ChatGPT элементы
  var openaiKeyInput = document.getElementById('openaiKey');
  var gptContextInput = document.getElementById('gptContext');
  var btnInterpretClusters = document.getElementById('btnInterpretClusters');
  var btnClearGPT = document.getElementById('btnClearGPT');
  var gptResponseDiv = document.getElementById('gptResponse');

  // Глобальные ловушки ошибок
  window.addEventListener('error', function(ev){
    setLog('Error: '+(ev.message||String(ev.error||'unknown')));
    console.error('[Global]', ev.error||ev.message, ev);
  });
  window.addEventListener('unhandledrejection', function(ev){
    var msg=(ev.reason&&ev.reason.message)?ev.reason.message:String(ev.reason);
    setLog('Unhandled rejection: '+msg); console.error('[Promise]', ev.reason);
  });

  // Инициализация
  try{
    bindUI();
    addDemoSamples();      // демо-сэмплы локально
    populateSelect();
    onFetchServerList();   // подхват с CDN
    setLog('UI ready (v3.1.0 + Clustering)');
  }catch(e){ console.error('Fatal init', e); alert('Fatal init: '+(e&&e.message?e.message:e)); }

  function bindUI(){
    if(btnRetryList) btnRetryList.addEventListener('click', onFetchServerList);
    if(btnLoadDemo) btnLoadDemo.addEventListener('click', function(){ addDemoSamples(true); populateSelect(); setLog('Демо-сэмплы добавлены'); });
    if(fileInput) fileInput.addEventListener('change', onFilesSelected);
    if(btnLoadUrls) btnLoadUrls.addEventListener('click', onUrlsLoad);
    if(btnClearList) btnClearList.addEventListener('click', function(){ samples=[]; populateSelect(); setLog('Список очищен'); });
    if(sampleSelect) sampleSelect.addEventListener('change', function(){ currentIndex=Number(sampleSelect.value); sampleInfo.textContent=samples[currentIndex]?samples[currentIndex].name:'—'; });
    if(btnPlay) btnPlay.addEventListener('click', function(){ if(currentIndex>=0) playIndex(currentIndex); else alert('Выберите образец'); });
    if(btnStop) btnStop.addEventListener('click', stopPlayback);
    if(btnExtract) btnExtract.addEventListener('click', onExtract);
    if(btnMatch) btnMatch.addEventListener('click', function(){ matchSelected().catch(function(e){ console.error(e); alert('Match failed: '+(e&&e.message?e.message:e)); }); });
    if(btnExport) btnExport.addEventListener('click', onExport);
    if(btnSelfTest) btnSelfTest.addEventListener('click', runSelfTest);
    if(btnUnitTests) btnUnitTests.addEventListener('click', runUnitTests);
    
    // Новые обработчики
    if(btnExtractAll) btnExtractAll.addEventListener('click', extractAllFeaturesForSamples);
    if(btnCluster) btnCluster.addEventListener('click', performClustering);
    if(btnVisualizeClusters) btnVisualizeClusters.addEventListener('click', visualizeClusters2D);
    if(btnInterpretClusters) btnInterpretClusters.addEventListener('click', interpretClustersWithGPT);
    if(btnClearGPT) btnClearGPT.addEventListener('click', function() { 
      if(gptResponseDiv) {
        gptResponseDiv.style.display = 'none';
        gptResponseDiv.innerHTML = '';
      }
    });
  }

  /* ===========================
     Прогресс/лог/блокировка
     =========================== */
  var __progressTimer=null, __progressStart=0, __progressCur=0, __progressMax=1;
  function progressStart(phase, maxUnits){
    try{
      __progressStart=performance.now(); __progressCur=0; __progressMax=Math.max(1, maxUnits||1);
      progressBox.style.display='block';
      progressFill.style.width='0%';
      progressPhase.textContent=String(phase||'подготовка');
      progressPct.textContent='0%';
      progressElapsed.textContent='0.0s';
      progressEta.textContent='ETA —';
      if(__progressTimer) clearInterval(__progressTimer);
      __progressTimer=setInterval(function(){
        var elapsed=(performance.now()-__progressStart)/1000;
        progressElapsed.textContent=elapsed.toFixed(1)+'s';
        var frac=__progressCur/Math.max(1,__progressMax);
        var pct=Math.max(0,Math.min(100,Math.round(frac*100)));
        progressPct.textContent=pct+'%'; progressFill.style.width=pct+'%';
        if(frac>0){ var eta=elapsed*(1-frac)/Math.max(1e-6,frac); progressEta.textContent='ETA '+eta.toFixed(1)+'s'; }
      },100);
    }catch(e){ console.warn('progressStart',e); }
  }
  function progressStep(inc, phase){ try{ __progressCur+=Math.max(0,inc||1); if(phase) progressPhase.textContent=String(phase); }catch(e){ console.warn('progressStep',e); } }
  function progressDone(finalPhase){ try{ __progressCur=__progressMax; progressFill.style.width='100%'; if(finalPhase) progressPhase.textContent=String(finalPhase); if(__progressTimer){ clearInterval(__progressTimer); __progressTimer=null; } setTimeout(function(){ progressBox.style.display='none'; },400); }catch(e){ console.warn('progressDone',e); } }
  function setDisabledDuringWork(flag){
    var buttons = [btnExtract,btnMatch,btnExport,btnSelfTest,btnUnitTests,btnRetryList,btnLoadDemo,btnLoadUrls,btnClearList,btnPlay,btnStop,btnExtractAll,btnCluster,btnVisualizeClusters,btnInterpretClusters];
    buttons.forEach(function(b){ if(!b) return; b.disabled=!!flag; });
  }
  function setLog(msg){ if(logEl) logEl.textContent=new Date().toLocaleTimeString()+' — '+msg; console.log('[V2K v3.1]', msg); }

  /* ===========================
     Загрузка/буферизация аудио
     =========================== */
  function ensureAudioCtx(){ if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }
  function safeDecodeAudioData(ab){
    ensureAudioCtx();
    return new Promise(function(resolve,reject){
      try{
        var p=audioCtx.decodeAudioData(ab.slice(0));
        if(p&&typeof p.then==='function'){ p.then(resolve).catch(reject); return; }
      }catch(_){}
      try{ audioCtx.decodeAudioData(ab.slice(0), resolve, reject); }catch(err){ reject(err); }
    });
  }
  function isAbsUrl(s){ return /^https?:\/\//i.test(s||''); }
  function isAudioName(name){ return /\.(wav|mp3|flac|ogg)$/i.test(name||''); }

  async function onFetchServerList(){
    try{ var ok=await fetchServerList(); if(!ok) alert('Не удалось загрузить samples/LIST.json (CORS/404).'); }
    catch(e){ console.error(e); alert('Ошибка загрузки списка: '+(e&&e.message?e.message:e)); }
  }
  async function fetchServerList(){
    try{
      var r=await fetch(basePath+'LIST.json');
      if(!r.ok) throw new Error('HTTP '+r.status);
      var arr=await r.json();
      if(!Array.isArray(arr)) throw new Error('Invalid JSON');
      var add = arr.map(function(p){
        var ps=String(p && (p.url||p.src||p.name||p)).trim();
        if(!ps) return null;
        if(isAbsUrl(ps)){
          var n1=ps.split('/').pop();
          return isAudioName(n1) ? {name:n1, src:ps, type:'server'} : null;
        }
        ps=ps.replace(/^\.?\/+/, '');
        var fname=ps.split('/').pop();
        if(!isAudioName(fname)) return null;
        var enc=encodeURIComponent(fname);
        return {name:fname, src:basePath+enc, type:'server'};
      }).filter(Boolean);
      samples=samples.concat(add);
      populateSelect();
      setLog('Server list loaded: '+add.length);
      return true;
    }catch(e){ setLog('fetchServerList failed: '+(e&&e.message?e.message:e)); return false; }
  }

  function onFilesSelected(ev){
    try{
      var files=Array.from(ev.target.files||[]);
      if(!files.length){ setLog('Файлы не выбраны'); return; }
      var items=files.map(function(f){ return {name:f.name, src:f.name, type:'file', file:f};});
      samples=samples.concat(items);
      populateSelect();
      setLog('Loaded local files: '+files.length);
    }catch(e){ setLog('fileInput error: '+(e&&e.message?e.message:e)); }
  }
  function onUrlsLoad(){
    try{
      var lines=(urlList.value||'').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);
      if(!lines.length){ alert('Вставьте по одному URL на строке'); return; }
      var items=lines.map(function(u){ return {name:String(u).split('/').pop()||u, src:u, type:'url'};});
      samples=samples.concat(items);
      populateSelect();
      setLog('Loaded URLs: '+items.length);
    }catch(e){ setLog('btnLoadUrls error: '+(e&&e.message?e.message:e)); alert('Ошибка при обработке URL-ов'); }
  }
  function populateSelect(){
    sampleSelect.innerHTML='';
    samples.forEach(function(s,i){
      var opt=document.createElement('option');
      opt.value=String(i);
      var tag=s.type==='demo'?'demo':(s.type||'src');
      opt.textContent=s.name+' ['+tag+']';
      sampleSelect.appendChild(opt);
    });
    if(samples.length>0){ sampleSelect.selectedIndex=0; currentIndex=0; sampleInfo.textContent=sampleSelect.options[0].textContent; }
    else { currentIndex=-1; sampleInfo.textContent='Список пуст.'; }
  }
  async function loadBufferFor(i){
    if(!samples[i]) throw new Error('Index out of range');
    var e=samples[i];
    if(e.buffer) return e.buffer;
    if(e.type==='file'){
      var ab=await e.file.arrayBuffer(); e.buffer=await safeDecodeAudioData(ab); return e.buffer;
    }
    if(e.type==='demo'){ return e.buffer; }
    var r=await fetch(e.src);
    if(!r.ok) throw new Error('HTTP '+r.status+' for '+e.src);
    var ab=await r.arrayBuffer(); e.buffer=await safeDecodeAudioData(ab); return e.buffer;
  }

  /* ===========================
     Проигрывание и отрисовка
     =========================== */
  async function playIndex(i){
    try{
      var buf=await loadBufferFor(i);
      ensureAudioCtx();
      stopPlayback();
      var node=audioCtx.createBufferSource();
      sourceNode=node; node.buffer=buf; node.connect(audioCtx.destination); node.start();
      node.onended=function(){ if(sourceNode===node) sourceNode=null; setLog('Playback ended'); };
      drawWaveform(buf);
      setLog('Playing: '+samples[i].name);
    }catch(e){ setLog('playIndex error: '+(e&&e.message?e.message:e)); alert('Play failed: '+(e&&e.message?e.message:e)); }
  }
  function stopPlayback(){ try{ if(sourceNode){ sourceNode.stop(); sourceNode.disconnect(); sourceNode=null; setLog('Stopped'); } }catch(e){ console.warn(e); } }

  function clearCanvas(ctx,W,H){ ctx.clearRect(0,0,W,H); ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,W,H); }
  function toMono(buf){
    if(!buf) return new Float32Array(0);
    if(buf.numberOfChannels===1) return buf.getChannelData(0).slice(0);
    var L=buf.length,out=new Float32Array(L);
    for(var ch=0; ch<buf.numberOfChannels; ch++){
      var d=buf.getChannelData(ch); for(var i=0;i<L;i++) out[i]+=d[i]/buf.numberOfChannels;
    }
    return out;
  }
  function drawWaveform(buffer){
    try{
      clearCanvas(waveCtx, waveCanvas.width, waveCanvas.height);
      if(!buffer) return;
      var mono=toMono(buffer); var W=waveCanvas.width,H=waveCanvas.height;
      waveCtx.beginPath(); waveCtx.strokeStyle='#3b82f6'; waveCtx.lineWidth=2;
      for(var x=0;x<W;x++){
        var i=Math.floor(x*(mono.length-1)/(W-1)); var v=mono[i]||0;
        var y=Math.round((1-(v+1)/2)*H);
        if(x===0) waveCtx.moveTo(x,y); else waveCtx.lineTo(x,y);
      }
      waveCtx.stroke();
    }catch(e){ console.error('drawWave',e); }
  }

  /* ===========================
     DSP и новые алгоритмы
     =========================== */

  // Нормировка 0..1
  function normalize(a){ if(!a||!a.length) return a; var mn=Infinity,mx=-Infinity; for(var i=0;i<a.length;i++){ var v=a[i]; if(v<mn) mn=v; if(v>mx) mx=v; } var den=Math.max(1e-9,mx-mn), out=new Float32Array(a.length); for(var j=0;j<a.length;j++) out[j]=(a[j]-mn)/den; return out; }
  // z-нормализация (0 среднее, 1 std)
  function znorm(a){ var n=a.length; if(!n) return a; var s=0, s2=0; for(var i=0;i<n;i++){ s+=a[i]; s2+=a[i]*a[i]; } var mu=s/n; var varr=Math.max(1e-9, s2/n - mu*mu); var sd=Math.sqrt(varr); var out=new Float32Array(n); for(i=0;i<n;i++) out[i]=(a[i]-mu)/sd; return out; }
  // Линейная ресемплинг-интерполяция
  function linearResample(arr,N){ var out=new Float32Array(N); if(!arr||arr.length===0) return out; var L=arr.length; for(var i=0;i<N;i++){ var t=(N===1?0:i/(N-1)); var pos=t*(L-1); var i0=Math.floor(pos), i1=Math.min(L-1,i0+1); var w=pos-i0; out[i]=(1-w)*(arr[i0]||0)+w*(arr[i1]||0); } return out; }
  // БПФ/ОБПФ
  function nextPow2(v){ var p=1; while(p<v) p<<=1; return p; }
  function fft_inplace(re,im){ var n=re.length,j=0; for(var i=1;i<n;i++){ var bit=n>>1; for(; (j&bit); bit>>=1) j^=bit; j^=bit; if(i<j){ var tr=re[i]; re[i]=re[j]; re[j]=tr; var ti=im[i]; im[i]=im[j]; im[j]=ti; } } for(var len=2; len<=n; len<<=1){ var ang=-2*Math.PI/len, wrlen=Math.cos(ang), wilen=Math.sin(ang); for(i=0;i<n;i+=len){ var wr=1, wi=0; for(var k=0;k<len/2;k++){ var ur=re[i+k], ui=im[i+k]; var vr=re[i+k+len/2]*wr - im[i+k+len/2]*wi; var vi=re[i+k+len/2]*wi + im[i+k+len/2]*wr; re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi; var tmp=wr*wrlen - wi*wilen; wi=wr*wilen + wi*wrlen; wr=tmp; } } } }
  function ifft_inplace(re,im){ for(var i=0;i<im.length;i++) im[i]=-im[i]; fft_inplace(re,im); for(i=0;i<re.length;i++){ re[i]/=re.length; im[i]=-im[i]/re.length; } }
  // Спектр амплитуд
  function magnitudeSpectrum(frame){ var L=frame.length,N=nextPow2(L); var re=new Float64Array(N), im=new Float64Array(N); for(var i=0;i<L;i++){ re[i]=frame[i]; im[i]=0; } for(i=L;i<N;i++){ re[i]=0; im[i]=0; } fft_inplace(re,im); var M=Math.floor(N/2)+1, mag=new Float32Array(M); for(var k=0;k<M;k++) mag[k]=Math.hypot(re[k],im[k]); return {mag:mag,N:N}; }
  // Аналитическая огибающая (Гильберт)
  function analyticEnvelope(frame){ var L=frame.length,N=nextPow2(L); var re=new Float64Array(N), im=new Float64Array(N); for(var i=0;i<L;i++){ re[i]=frame[i]; im[i]=0; } for(i=L;i<N;i++){ re[i]=0; im[i]=0; } fft_inplace(re,im); var half=Math.floor(N/2); for(var k=1;k<half;k++){ re[k]*=2; im[k]*=2; re[N-k]=0; im[N-k]=0; } ifft_inplace(re,im); var env=new Float32Array(L); for(var n=0;n<L;n++) env[n]=Math.hypot(re[n],im[n]); return env; }
  // Спектральный центроид
  function spectralCentroidFromFrame(frame, sr){ try{ var spec=magnitudeSpectrum(frame), mag=spec.mag, N=spec.N; var wsum=0,sum=0; for(var k=0;k<mag.length;k++){ var a=mag[k]; var f=k*(sr/N); wsum+=a; sum+=a*f; } return wsum>0?sum/wsum:0; }catch(e){ return 0; } }

  // --- Предобработка в частотной области (HP/LP/Gate) + Pre-emph/DC ---
  function preprocessFrame(frame, sr, cfg, noiseProfile){
    var L=frame.length;
    // DC-remove
    if(cfg.dc){ var s=0; for(var i=0;i<L;i++) s+=frame[i]; var mu=s/Math.max(1,L); for(i=0;i<L;i++) frame[i]-=mu; }
    // Pre-emphasis (y[n]=x[n]-a*x[n-1])
    if(cfg.pre){ var a=0.97, prev=0; for(i=0;i<L;i++){ var x=frame[i]; var y=x - a*prev; frame[i]=y; prev=x; } }
    // Спектральная фильтрация + noise-gate (множитель профиля шума)
    var spec=magnitudeSpectrum(frame); var mag=spec.mag, N=spec.N;
    var hp=Math.max(0, cfg.hp|0), lp=Math.max(hp+1, cfg.lp|0);
    for(var k=0;k<mag.length;k++){
      var f=k*(sr/N);
      // Узкополосный пропуск по HP/LP
      var pass=(f>=hp && f<=lp);
      var gain= pass ? 1.0 : 0.0;
      if(cfg.gate && noiseProfile){
        var n = noiseProfile[k]||0;
        var thr = n * cfg.gateMul;
        if(mag[k] < thr){ // подавление ниже порога
          var red = Math.pow(10, -cfg.gateRed/20); // ослабление в линейной шкале
          gain *= red;
        }
      }
      mag[k] *= gain;
    }
    // Обратное преобразование для получения очищенного временного кадра
    var re=new Float64Array(N), im=new Float64Array(N);
    for(i=0;i<mag.length;i++){ re[i]=mag[i]; im[i]=0; }
    for(i=mag.length;i<N;i++){ re[i]=0; im[i]=0; }
    // восстановление «симметрии» спектра
    for(i=1;i<mag.length-1;i++){ re[N-i]=re[i]; im[N-i]=-im[i]; }
    ifft_inplace(re,im);
    var out=new Float32Array(L);
    for(i=0;i<L;i++) out[i]=re[i];
    return out;
  }

  // Оценка профиля шума по начальному числу «тихих» кадров
  function learnNoiseProfile(frames, sr){
    if(!frames.length) return null;
    var specSum=null, count=0;
    for(var i=0;i<frames.length;i++){
      var ms=magnitudeSpectrum(frames[i]);
      if(!specSum){ specSum=new Float64Array(ms.mag.length); }
      for(var k=0;k<ms.mag.length;k++) specSum[k]+=ms.mag[k];
      count++;
    }
    if(!specSum) return null;
    var avg=new Float32Array(specSum.length);
    for(var k=0;k<avg.length;k++) avg[k]=specSum[k]/Math.max(1,count);
    return avg;
  }

  // Простейший VAD: порог по энергии и центроиду
  function vadMask(energies, centroids, thrQ, cf){
    var n=energies.length;
    var sorted=Array.from(energies).sort(function(a,b){return a-b;});
    var eThr = sorted[Math.max(0, Math.min(n-1, Math.floor(thrQ*(n-1))))] || 0;
    var mask=new Array(n);
    for(var i=0;i<n;i++){
      mask[i] = (energies[i]>=eThr) && (centroids[i]>=cf);
    }
    return {mask:mask, eThr:eThr};
  }

  // Извлечение огибающих с учётом предобработки/шумоподавления/VAD
  async function extractEnvelopes(buffer, env_sr, ppCfg){
    if(!buffer) throw new Error('empty buffer');
    var sr=buffer.sampleRate||44100;
    var mono=toMono(buffer);

    // Размер/шаг окна по желаемой частоте «кадров»
    var hop=Math.max(1, Math.floor(sr/env_sr));
    var win=Math.min(2048, hop*4);
    var nFrames=Math.max(1, Math.ceil(mono.length/hop));

    var rms=new Float32Array(nFrames),
        cent=new Float32Array(nFrames),
        hilb=new Float32Array(nFrames);

    // Предварительная оценка профиля шума на старте (если включен Gate)
    var forNoise=[];
    if(ppCfg.gate){
      var initCount=Math.min(nFrames, Math.max(4, ppCfg.gateInit|0));
      for(var i0=0;i0<initCount;i0++){
        var st=i0*hop; var fr0= mono.subarray(st, Math.min(st+win, mono.length));
        forNoise.push(fr0);
      }
    }
    var noiseProfile = ppCfg.gate ? learnNoiseProfile(forNoise, sr) : null;

    // Основной проход
    var energies=new Float32Array(nFrames), centroids=new Float32Array(nFrames);
    for(var i=0;i<nFrames;i++){
      var start=i*hop; var frame=mono.subarray(start, Math.min(start+win, mono.length));
      if(frame.length===0){ rms[i]=cent[i]=hilb[i]=0; continue; }

      // Предобработка
      var clean = preprocessFrame(frame.slice(0), sr, {
        dc: !!ppCfg.dc,
        pre: !!ppCfg.pre,
        hp:  Math.max(0, ppCfg.hp|0),
        lp:  Math.max(50, ppCfg.lp|0),
        gate: !!ppCfg.gate,
        gateMul: Number(ppCfg.gateMul)||1.8,
        gateRed: Number(ppCfg.gateRed)||18
      }, noiseProfile);

      // Признаки по кадру
      var s=0; for(var j=0;j<clean.length;j++) s+=clean[j]*clean[j];
      var e=Math.sqrt(s/Math.max(1,clean.length));
      var c=spectralCentroidFromFrame(clean, sr);
      var aenv=analyticEnvelope(clean), es=0; for(j=0;j<aenv.length;j++) es+=Math.abs(aenv[j]);
      var h=es/Math.max(1,aenv.length);

      rms[i]=e; cent[i]=c; hilb[i]=h;
      energies[i]=e; centroids[i]=c;
    }

    // VAD-маска и замаскированные огибающие
    if(ppCfg.vad){
      var vm=vadMask(energies, centroids, Number(ppCfg.vadQ)||0.25, Number(ppCfg.vadCF)||250);
      for(var i2=0;i2<nFrames;i2++){
        if(!vm.mask[i2]){ rms[i2]*=0.2; hilb[i2]*=0.2; /* центроид оставляем информативным */ }
      }
    }

    return {
      rms: normalize(rms),
      cent: normalize(cent),
      hilb: normalize(hilb),
      sr: sr,
      frames: nFrames
    };
  }

  /* ===========================
     DTW + визуализация матрицы
     =========================== */
  function l2dist(a,b){ var N=Math.min(a.length,b.length); if(N===0) return Infinity; var s=0; for(var i=0;i<N;i++){ var d=a[i]-b[i]; s+=d*d; } return Math.sqrt(s/N); }

  // DTW с окном Сакоэ—Чиба (bandPct % от m)
  function dtw1d_band(a,b,bandPct){
    var n=a.length,m=b.length;
    if(n===0||m===0) return {cost:Infinity,path:[]};
    var band=Math.max(0, Math.floor((bandPct||0)/100*m));
    var D=new Array(n+1);
    for(var i=0;i<=n;i++){ D[i]=new Float64Array(m+1); for(var j=0;j<=m;j++) D[i][j]=Infinity; }
    D[0][0]=0;
    for(i=1;i<=n;i++){
      var jmin=Math.max(1, i-band), jmax=Math.min(m, i+band);
      for(var j=jmin;j<=jmax;j++){
        var d=a[i-1]-b[j-1]; var c=d*d;
        var v=Math.min(D[i-1][j],D[i][j-1],D[i-1][j-1]);
        D[i][j]=c+v;
      }
    }
    var ii=n,jj=m,path=[];
    while(ii>0&&jj>0){
      path.push([ii-1,jj-1]);
      var up=D[ii-1][jj], left=D[ii][jj-1], diag=D[ii-1][jj-1];
      if(diag<=up && diag<=left){ ii--; jj--; }
      else if(up<left){ ii--; } else { jj--; }
    }
    path.reverse();
    return {cost:D[n][m], path:path};
  }

  function drawDTWMatrix(a,b,path){
    try{
      clearCanvas(dtwCtx, dtwCanvas.width, dtwCanvas.height);
      if(!a||!b||a.length===0||b.length===0) return;
      var n=a.length,m=b.length,W=dtwCanvas.width,H=dtwCanvas.height;
      // Матрица абсолютных разностей |a_i-b_j|
      var maxv=0, C=new Float32Array(n*m);
      for(var ii=0;ii<n;ii++){
        for(var jj=0;jj<m;jj++){
          var v=Math.abs(a[ii]-b[jj]);
          C[ii*m+jj]=v; if(v>maxv) maxv=v;
        }
      }
      var cellW=Math.max(1,Math.floor(W/m)), cellH=Math.max(1,Math.floor(H/n));
      for(ii=0;ii<n;ii++){
        for(jj=0;jj<m;jj++){
          var vv=C[ii*m+jj]/(maxv+1e-9);
          var col=Math.floor(255*(1-vv));
          dtwCtx.fillStyle='rgb('+col+','+col+','+col+')';
          dtwCtx.fillRect(jj*cellW, ii*cellH, cellW, cellH);
        }
      }
      if(path&&path.length){
        dtwCtx.strokeStyle='#0fb'; dtwCtx.lineWidth=2; dtwCtx.beginPath();
        for(var k=0;k<path.length;k++){
          var p=path[k];
          var x=p[1]*cellW+cellW/2; var y=p[0]*cellH+cellH/2;
          if(k===0) dtwCtx.moveTo(x,y); else dtwCtx.lineTo(x,y);
        }
        dtwCtx.stroke();
      }
    }catch(e){ console.error('drawDTWMatrix',e); }
  }

  // Комбинированный признак (с учетом z-norm)
  function combineFeature(env, dtwLen, use, zn){
    var parts=[];
    if(use.rms&&env.rms) parts.push(linearResample(env.rms,dtwLen));
    if(use.cent&&env.cent) parts.push(linearResample(env.cent,dtwLen));
    if(use.hilb&&env.hilb) parts.push(linearResample(env.hilb,dtwLen));
    if(parts.length===0) parts=[new Float32Array(dtwLen)];
    var out=new Float32Array(dtwLen);
    for(var i=0;i<parts.length;i++){
      var p = zn ? znorm(parts[i]) : normalize(parts[i]);
      for(var j=0;j<dtwLen;j++) out[j]+=p[j]||0;
    }
    var L=parts.length||1;
    for(var j2=0;j2<dtwLen;j2++) out[j2]/=L;
    return out;
  }

  /* ===========================
     Пайплайн извлечения/сопоставления
     =========================== */

  async function onExtract(){
    try{
      if(currentIndex<0){ alert('Выберите образец'); return; }
      setDisabledDuringWork(true);
      progressStart('Извлечение огибающих', 3);
      var buf=await loadBufferFor(currentIndex); progressStep(1,'Загружен буфер');
      drawWaveform(buf);
      var env_sr=Math.max(20, parseInt(env_sr_input.value,10)||120);
      var env=await extractEnvelopes(buf, env_sr, {
        dc:pp_dc.checked, pre:pp_pre.checked,
        hp:Number(pp_hp.value)||80, lp:Number(pp_lp.value)||4000,
        gate:pp_gate.checked, gateInit:Number(pp_gate_init.value)||12,
        gateMul:Number(pp_gate_mul.value)||1.8, gateRed:Number(pp_gate_red.value)||18,
        vad:pp_vad.checked, vadQ:Number(pp_vad_q.value)||0.25, vadCF:Number(pp_vad_cf.value)||250
      });
      progressStep(2,'Расчёт признаков');
      lastExtract={index:currentIndex, env:env}; window.__last_extract=lastExtract;
      drawEnvelopes(env, []);
      resultsEl.textContent='Extracted envelopes for '+samples[currentIndex].name+
        ': rms='+env.rms.length+', cent='+env.cent.length+', hilb='+env.hilb.length;
      // Скрываем таблицу результатов, если она была показана
      if(decodeHTML) {
        decodeHTML.classList.add('hidden');
        decodeHTML.innerHTML='';
      }
      setLog('Extract done');
    }catch(e){ console.error('extract error', e); alert('Ошибка извлечения: '+(e&&e.message?e.message:e)); }
    finally{ progressDone('Готово'); setDisabledDuringWork(false); }
  }

  // Быстрый L2-ранжир + DTW shortlist
  async function matchSelected(){
    if(currentIndex<0){ alert('Выберите образец'); return; }
    var t0=performance.now();
    setDisabledDuringWork(true);

    var env_sr = Math.max(20, parseInt(env_sr_input.value,10)||120);
    var dtwLen = Math.max(16, parseInt(dtw_len_input.value,10)||96);
    var topK   = Math.max(1, parseInt(topk_input.value,10)||10);
    var band   = Math.max(0, parseInt(dtw_band_input.value,10)||15);
    var useFlags = {rms:use_rms.checked, cent:use_centroid.checked, hilb:use_hilbert.checked};
    var zn = !!use_znorm.checked;

    var entry=samples[currentIndex];
    var N=Math.max(1, samples.length-1);
    progressStart('Подготовка', 1 + 3 + 3*N + 4*topK);

    try{
      setLog('Matching for: '+entry.name);
      progressStep(1,'Загрузка запроса');
      var bufQ=await loadBufferFor(currentIndex); drawWaveform(bufQ);

      // Запрос: извлечь с предобработкой
      progressStep(1,'Огибающие запроса');
      var qenv=await extractEnvelopes(bufQ, env_sr, {
        dc:pp_dc.checked, pre:pp_pre.checked,
        hp:Number(pp_hp.value)||80, lp:Number(pp_lp.value)||4000,
        gate:pp_gate.checked, gateInit:Number(pp_gate_init.value)||12,
        gateMul:Number(pp_gate_mul.value)||1.8, gateRed:Number(pp_gate_red.value)||18,
        vad:pp_vad.checked, vadQ:Number(pp_vad_q.value)||0.25, vadCF:Number(pp_vad_cf.value)||250
      });

      // Пул кандидатов
      progressStep(1,'Подготовка кандидатов');
      var pool=[];
      for(var i=0;i<samples.length;i++){
        if(i===currentIndex) continue;
        try{
          var b=await loadBufferFor(i); progressStep(1,'Кандидат #'+i);
          var env=await extractEnvelopes(b, env_sr, {
            dc:pp_dc.checked, pre:pp_pre.checked,
            hp:Number(pp_hp.value)||80, lp:Number(pp_lp.value)||4000,
            gate:pp_gate.checked, gateInit:Number(pp_gate_init.value)||12,
            gateMul:Number(pp_gate_mul.value)||1.8, gateRed:Number(pp_gate_red.value)||18,
            vad:pp_vad.checked, vadQ:Number(pp_vad_q.value)||0.25, vadCF:Number(pp_vad_cf.value)||250
          });
          pool.push({index:i, name:samples[i].name, env:env});
        }catch(e){ console.warn('skip candidate', samples[i]&&samples[i].src, e&&e.message?e.message:e); }
        if(pool.length>=300) break;
      }
      setLog('Candidates: '+pool.length);

      // Быстрая фильтрация (L2 по RMS, приведенной к env_sr)
      progressPhase.textContent='L2 фильтрация';
      var coarse=pool.map(function(p){
        progressStep(1);
        var qv = linearResample(qenv.rms, Math.min(qenv.rms.length, Math.max(1, Math.floor(env_sr))));
        var pv = linearResample(p.env.rms, qv.length);
        return { index:p.index, name:p.name, score:l2dist(zn?znorm(qv):qv, zn?znorm(pv):pv), env:p.env };
      });
      coarse.sort(function(a,b){ return a.score-b.score; });
      var shortlist=coarse.slice(0, Math.min(topK, coarse.length));

      // DTW по комбинированному признаку
      var dtwResults=[], qCombo=combineFeature(qenv, dtwLen, useFlags, zn);
      progressPhase.textContent='DTW shortlist';
      for(var si=0; si<shortlist.length; si++){
        var s=shortlist[si];
        try{
          var b2=combineFeature(s.env, dtwLen, useFlags, zn);
          var r=dtw1d_band(qCombo,b2,band);
          dtwResults.push({name:s.name, index:s.index, coarse_score:s.score, dtw_cost:r.cost, path:r.path});
        }catch(e){ console.warn('dtw fail', e); }
        progressStep(4,'DTW '+(si+1)+'/'+shortlist.length);
      }
      dtwResults.sort(function(A,B){return A.dtw_cost-B.dtw_cost;});

      // Визуализации
      var topCandidates=[];
      for(var ti=0; ti<Math.min(6, dtwResults.length); ti++){
        var d=dtwResults[ti], envF=null;
        for(var pi=0; pi<pool.length; pi++){ if(pool[pi].index===d.index){ envF=pool[pi]; break; } }
        if(envF) topCandidates.push({name:d.name, env:envF.env});
      }
      drawEnvelopes(qenv, topCandidates);
      if(dtwResults.length>0){
        var best=dtwResults[0], cand=null;
        for(var pi2=0; pi2<pool.length; pi2++){ if(pool[pi2].index===best.index){ cand=pool[pi2]; break; } }
        if(cand){
          var b3=combineFeature(cand.env, dtwLen, useFlags, zn);
          drawDTWMatrix(qCombo,b3,best.path);
        }
      }

      // Текстовый отчёт
      var out=[
        'Query: '+entry.name,
        'Candidates: '+dtwResults.length,
        '',
        'Top results (combined DTW '+(band|0)+'%, z-norm '+(zn?'on':'off')+'):',
        'No  Name                          DTW_cost     L2(score)']
        .join('\n');
      for(var ri=0; ri<Math.min(10, dtwResults.length); ri++){
        var rline=dtwResults[ri];
        var no=String(ri+1);
        var namePad=(rline.name+Array(31).join(' ')).slice(0,30);
        out += '\n' + (no.length<3?no+Array(4-no.length).join(' '):no+' ') + ' ' +
               namePad + ' ' + rline.dtw_cost.toFixed(6) + '   ' + rline.coarse_score.toFixed(6);
      }
      resultsEl.textContent=out;

      // HTML-таблица с детализацией (RMS/Cent/Hilb)
      renderDecodeTable(entry.name, dtwResults, qenv, pool, dtwLen);

      lastMatchRes={query:entry.name, results:dtwResults}; window.__last_match=lastMatchRes;
      var t1=performance.now(); setLog('Match complete in '+((t1-t0)/1000).toFixed(2)+'s');
    }catch(e){ console.error('Match failed', e); alert('Match failed: '+(e&&e.message?e.message:e)); }
    finally{ progressDone('Готово'); setDisabledDuringWork(false); }
  }

  // Визуализация огибающих и кандидатов
  function drawEnvelopes(env, candidates){
    try{
      clearCanvas(envCtx, envCanvas.width, envCanvas.height);
      if(!env) return;
      var W=envCanvas.width,H=envCanvas.height;
      var methods=[];
      if(use_rms && use_rms.checked && env.rms) methods.push({key:'rms',col:'#3b82f6',label:'RMS'});
      if(use_centroid && use_centroid.checked && env.cent) methods.push({key:'cent',col:'#10b981',label:'Centroid'});
      if(use_hilbert && use_hilbert.checked && env.hilb) methods.push({key:'hilb',col:'#ef4444',label:'Hilbert'});
      methods.forEach(function(m){
        var arr=env[m.key]; if(!arr) return; var samp=linearResample(arr, W);
        envCtx.beginPath(); envCtx.lineWidth=(m.key==='rms'?2:1.6); envCtx.strokeStyle=m.col;
        for(var x=0;x<W;x++){ var y=H - samp[x]*(H-30) - 10; if(x===0) envCtx.moveTo(x,y); else envCtx.lineTo(x,y); }
        envCtx.stroke();
      });
      if(Array.isArray(candidates)){
        var cols=['#f59e0b','#8b5cf6','#ec4899','#06b6d4'], ci=0;
        candidates.slice(0,4).forEach(function(c){
          var col=cols[ci++%cols.length];
          ['rms','cent','hilb'].forEach(function(k){
            if(!c.env[k]) return; var samp=linearResample(c.env[k], W);
            envCtx.beginPath(); envCtx.lineWidth=1; envCtx.strokeStyle=col;
            for(var x=0;x<W;x++){ var y=H - samp[x]*(H-30) - 10; if(x===0) envCtx.moveTo(x,y); else envCtx.lineTo(x,y); }
            envCtx.stroke();
          });
        });
      }
      envCtx.fillStyle='#0f172a'; envCtx.font='12px Arial'; var lx=10;
      methods.forEach(function(m){ envCtx.fillStyle=m.col; envCtx.fillRect(lx,8,14,8); envCtx.fillStyle='#cbd5e1'; envCtx.fillText(m.label, lx+20, 16); lx+=120; });
    }catch(e){ console.error('drawEnvelopes',e); }
  }

  // Таблица «как расшифровалось»
  function escapeHTML(s){ var map={ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }; return String(s).replace(/[&<>"']/g, function(ch){ return map[ch]||ch; }); }
  function fmt(x){ return isFinite(x)?Number(x).toFixed(6):'—'; }
  function perMethodDTW(qenv,cenv,dtwLen,zn,use){
    var a_r=linearResample(qenv.rms,dtwLen), b_r=linearResample(cenv.rms,dtwLen);
    var a_c=linearResample(qenv.cent,dtwLen), b_c=linearResample(cenv.cent,dtwLen);
    var a_h=linearResample(qenv.hilb,dtwLen), b_h=linearResample(cenv.hilb,dtwLen);
    if(zn){ a_r=znorm(a_r); b_r=znorm(b_r); a_c=znorm(a_c); b_c=znorm(b_c); a_h=znorm(a_h); b_h=znorm(b_h); }
    var band=Math.max(0, parseInt(dtw_band_input.value,10)||15);
    return {
      rms: use.rms? dtw1d_band(a_r,b_r,band).cost : NaN,
      cent: use.cent? dtw1d_band(a_c,b_c,band).cost : NaN,
      hilb: use.hilb? dtw1d_band(a_h,b_h,band).cost : NaN
    };
  }
  function renderDecodeTable(queryName, dtwResults, qenv, pool, dtwLen){
    if(!decodeHTML) return;
    if(!dtwResults||!dtwResults.length){ decodeHTML.innerHTML='<div>Нет результатов.</div>'; return; }
    var best=dtwResults[0], zn=use_znorm.checked, use= {rms:use_rms.checked, cent:use_centroid.checked, hilb:use_hilbert.checked};
    
    // Показываем контейнер таблицы
    decodeHTML.classList.remove('hidden');
    
    var html='<table><thead><tr><th>#</th><th>Сэмпл</th><th>DTW (комб.)</th><th>RMS</th><th>Centroid</th><th>Hilbert</th><th>L2</th><th>Действия</th></tr></thead><tbody>';
    for(var i=0;i<Math.min(10,dtwResults.length);i++){
      var d=dtwResults[i], cenv=null;
      for(var pi=0;pi<pool.length;pi++){ if(pool[pi].index===d.index){ cenv=pool[pi].env; break; } }
      var pm=cenv? perMethodDTW(qenv,cenv,dtwLen,zn,use) : {rms:NaN,cent:NaN,hilb:NaN};
      html+='<tr><td>'+(i+1)+'</td><td>'+escapeHTML(d.name)+'</td><td>'+fmt(d.dtw_cost)+'</td>'+
            '<td>'+fmt(pm.rms)+'</td><td>'+fmt(pm.cent)+'</td><td>'+fmt(pm.hilb)+'</td>'+
            '<td>'+fmt(d.coarse_score)+'</td><td><span class="play" style="color:#3b82f6;cursor:pointer;text-decoration:underline" data-play-index="'+d.index+'">▶ прослушать</span></td></tr>';
    }
    html+='</tbody></table>';
    decodeHTML.innerHTML=html;
    var links=decodeHTML.querySelectorAll('[data-play-index]');
    for(var k=0;k<links.length;k++){
      links[k].addEventListener('click', function(ev){
        var idx=Number(ev.currentTarget.getAttribute('data-play-index'));
        if(!isNaN(idx)) playIndex(idx);
      });
    }
  }

  /* ===========================
     НОВЫЕ ФУНКЦИИ: КЛАСТЕРИЗАЦИЯ И CHATGPT
     =========================== */
  
  // Функция извлечения признаков для всех образцов
  async function extractAllFeaturesForSamples() {
    try {
      setDisabledDuringWork(true);
      progressStart('Извлечение признаков для всех образцов', samples.length);
      
      for (var i = 0; i < samples.length; i++) {
        try {
          progressStep(1, 'Образец ' + (i+1) + '/' + samples.length + ': ' + samples[i].name);
          
          if (!samples[i].env) {
            var buf = await loadBufferFor(i);
            var env_sr = Math.max(20, parseInt(env_sr_input.value,10)||120);
            samples[i].env = await extractEnvelopes(buf, env_sr, {
              dc:pp_dc.checked, pre:pp_pre.checked,
              hp:Number(pp_hp.value)||80, lp:Number(pp_lp.value)||4000,
              gate:pp_gate.checked, gateInit:Number(pp_gate_init.value)||12,
              gateMul:Number(pp_gate_mul.value)||1.8, gateRed:Number(pp_gate_red.value)||18,
              vad:pp_vad.checked, vadQ:Number(pp_vad_q.value)||0.25, vadCF:Number(pp_vad_cf.value)||250
            });
          }
        } catch (e) {
          console.warn('Ошибка извлечения для образца', i, samples[i].name, e);
        }
      }
      
      progressDone('Извлечение завершено');
      setLog('Признаки извлечены для ' + samples.filter(s => s.env).length + ' образцов');
      
    } catch (error) {
      console.error('Ошибка извлечения всех признаков:', error);
      alert('Ошибка: ' + error.message);
    } finally {
      setDisabledDuringWork(false);
    }
  }
  
  // Евклидово расстояние
  function euclideanDistance(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }
  
  // Проверка равенства массивов
  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  
  // K-means алгоритм
  function kMeans(vectors, k, maxIterations = 100) {
    if (vectors.length === 0 || k <= 0) return null;
    
    // 1. Инициализация центроидов случайными точками
    var centroids = [];
    for (var i = 0; i < k; i++) {
      var randomIdx = Math.floor(Math.random() * vectors.length);
      centroids.push(vectors[randomIdx].slice());
    }
    
    var assignments = new Array(vectors.length).fill(-1);
    var prevAssignments = new Array(vectors.length).fill(-1);
    
    for (var iter = 0; iter < maxIterations; iter++) {
      // 2. Назначение точек ближайшим центроидам
      for (var i = 0; i < vectors.length; i++) {
        var minDist = Infinity;
        var bestCluster = 0;
        
        for (var j = 0; j < k; j++) {
          var dist = euclideanDistance(vectors[i], centroids[j]);
          if (dist < minDist) {
            minDist = dist;
            bestCluster = j;
          }
        }
        assignments[i] = bestCluster;
      }
      
      // Проверка на сходимость
      if (arraysEqual(assignments, prevAssignments)) {
        break;
      }
      prevAssignments = assignments.slice();
      
      // 3. Пересчет центроидов
      var clusterSums = new Array(k);
      var clusterCounts = new Array(k).fill(0);
      
      for (var j = 0; j < k; j++) {
        clusterSums[j] = new Array(vectors[0].length).fill(0);
      }
      
      for (var i = 0; i < vectors.length; i++) {
        var cluster = assignments[i];
        clusterCounts[cluster]++;
        for (var dim = 0; dim < vectors[i].length; dim++) {
          clusterSums[cluster][dim] += vectors[i][dim];
        }
      }
      
      for (var j = 0; j < k; j++) {
        if (clusterCounts[j] > 0) {
          for (var dim = 0; dim < centroids[j].length; dim++) {
            centroids[j][dim] = clusterSums[j][dim] / clusterCounts[j];
          }
        }
      }
    }
    
    return {assignments: assignments, centroids: centroids};
  }
  
  // Метод локтя для определения оптимального k
  function findOptimalK(vectors, maxK = 10) {
    var distortions = [];
    maxK = Math.min(maxK, vectors.length - 1);
    
    for (var k = 1; k <= maxK; k++) {
      var result = kMeans(vectors, k, 50);
      if (!result) continue;
      
      // Вычисляем distortion (среднее расстояние до центроида)
      var distortion = 0;
      for (var i = 0; i < vectors.length; i++) {
        var cluster = result.assignments[i];
        distortion += euclideanDistance(vectors[i], result.centroids[cluster]);
      }
      distortion /= vectors.length;
      distortions.push({k: k, distortion: distortion});
    }
    
    // Находим "локоть" - точку, где уменьшение distortion замедляется
    var optimalK = 2;
    if (distortions.length >= 3) {
      var bestRatio = 0;
      for (var i = 1; i < distortions.length - 1; i++) {
        var prevDrop = distortions[i-1].distortion - distortions[i].distortion;
        var nextDrop = distortions[i].distortion - distortions[i+1].distortion;
        var ratio = nextDrop / prevDrop;
        
        if (ratio < 0.7 && prevDrop > 0) { // Резкое замедление
          optimalK = distortions[i].k;
          break;
        }
      }
    }
    
    return optimalK;
  }
  
  // Основная функция кластеризации

   async function performClustering() {
    try {
      setDisabledDuringWork(true);
      progressStart('Кластеризация образцов', 3);
      
      // 1. Извлекаем признаки для всех образцов
      progressStep(1, 'Извлечение признаков');
      
      // Проверяем, есть ли уже извлеченные признаки
      var samplesWithFeatures = 0;
      for (var i = 0; i < samples.length; i++) {
        if (samples[i].env) {
          samplesWithFeatures++;
        }
      }
      
      // Если нет извлеченных признаков или их меньше 3, предлагаем извлечь
      if (samplesWithFeatures < 3) {
        progressDone();
        setDisabledDuringWork(false);
        alert('Нужно хотя бы 3 образца с извлеченными признаками! Нажмите кнопку "Извлечь все" или "Извлечь огибающие" для отдельных образцов.');
        return;
      }
      
      // 2. Определяем оптимальное число кластеров
      progressStep(1, 'Определение оптимального k');
      var maxClusters = parseInt(document.getElementById('maxClusters').value) || 5;
      var method = document.getElementById('clusterMethod').value;
      
      // Извлекаем признаки для кластеризации
      var features = extractAllFeatures();
      
      if (features.vectors.length < 3) {
        alert('Нужно хотя бы 3 образца с извлеченными признаками! Сначала нажмите "Извлечь все" или "Извлечь огибающие" для отдельных образцов.');
        progressDone();
        setDisabledDuringWork(false);
        return;
      }
      
      var k;
      if (method === 'elbow') {
        k = findOptimalK(features.vectors, maxClusters);
        setLog('Оптимальное число кластеров (метод локтя): ' + k);
      } else {
        k = Math.min(maxClusters, features.vectors.length);
      }
      
      // 3. Запускаем K-means
      progressStep(1, 'Выполнение K-means');
      var result = kMeans(features.vectors, k);
      
      if (!result) {
        throw new Error('Ошибка кластеризации');
      }
      
      // 4. Формируем результаты
      clusterResults = {
        k: k,
        assignments: result.assignments,
        centroids: result.centroids,
        samplesByCluster: {},
        featureIndices: features.indices
      };
      
      // Группируем образцы по кластерам
      for (var i = 0; i < result.assignments.length; i++) {
        var cluster = result.assignments[i];
        var sampleIdx = features.indices[i];
        
        if (!clusterResults.samplesByCluster[cluster]) {
          clusterResults.samplesByCluster[cluster] = [];
        }
        clusterResults.samplesByCluster[cluster].push({
          index: sampleIdx,
          name: samples[sampleIdx].name,
          distance: euclideanDistance(features.vectors[i], result.centroids[cluster])
        });
      }
      
      // 5. Отображаем результаты
      displayClusterResults();
      if (clusterVizPanel) clusterVizPanel.style.display = 'block';
      
      progressDone('Кластеризация завершена');
      setLog('Найдено ' + k + ' кластеров');
      
    } catch (error) {
      console.error('Ошибка кластеризации:', error);
      alert('Ошибка кластеризации: ' + error.message);
      progressDone();
    } finally {
      setDisabledDuringWork(false);
    }
  }
  
  // Извлечение признаков для всех образцов
  function extractAllFeatures() {
    featureVectors = [];
    var validSamples = [];
    
    for (var i = 0; i < samples.length; i++) {
      if (samples[i].env) {
        var vector = combineFeature(
          samples[i].env, 
          parseInt(dtw_len_input.value) || 96,
          {
            rms: use_rms.checked,
            cent: use_centroid.checked,
            hilb: use_hilbert.checked
          },
          use_znorm.checked
        );
        featureVectors.push(vector);
        validSamples.push(i);
      }
    }
    
    return {vectors: featureVectors, indices: validSamples};
  }
  
  // Отображение результатов кластеризации
  function displayClusterResults() {
    if (!clusterResults || !clusterResultsDiv) return;
    
    var html = '<h4 style="color:#cbd5e1;margin-bottom:12px">Результаты кластеризации:</h4>';
    html += '<p style="color:#94a3b8;margin-bottom:16px">Найдено <strong>' + clusterResults.k + '</strong> кластеров</p>';
    
    // Сводная таблица
    html += '<table style="width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden">';
    html += '<tr style="background:#334155"><th style="padding:8px 12px;text-align:left;color:#cbd5e1">Кластер</th><th style="padding:8px 12px;text-align:left;color:#cbd5e1">Образцов</th><th style="padding:8px 12px;text-align:left;color:#cbd5e1">Примеры</th><th style="padding:8px 12px;text-align:left;color:#cbd5e1">Среднее расстояние</th></tr>';
    
    var colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    
    for (var c = 0; c < clusterResults.k; c++) {
      var samplesInCluster = clusterResults.samplesByCluster[c] || [];
      var exampleNames = samplesInCluster.slice(0, 3).map(function(s) { return s.name; }).join(', ');
      var avgDist = samplesInCluster.length > 0 ? 
        (samplesInCluster.reduce(function(sum, s) { return sum + s.distance; }, 0) / samplesInCluster.length).toFixed(4) : '—';
      
      html += '<tr style="border-bottom:1px solid #334155">';
      html += '<td style="padding:8px 12px;color:#cbd5e1"><span style="display:inline-block;padding:4px 12px;border-radius:12px;background:' + colors[c % colors.length] + ';color:white;font-weight:bold">Кластер ' + c + '</span></td>';
      html += '<td style="padding:8px 12px;color:#94a3b8">' + samplesInCluster.length + '</td>';
      html += '<td style="padding:8px 12px;color:#94a3b8">' + (exampleNames || '—') + '</td>';
      html += '<td style="padding:8px 12px;color:#94a3b8">' + avgDist + '</td>';
      html += '</tr>';
    }
    
    html += '</table>';
    clusterResultsDiv.innerHTML = html;
  }
  
  function displayClusterDetails() {
    if (!clusterResults || !clusterDetailsDiv) return;
    
    var html = '<div style="display: flex; flex-wrap: wrap; gap: 15px;">';
    
    for (var c = 0; c < clusterResults.k; c++) {
      var samplesInCluster = clusterResults.samplesByCluster[c] || [];
      
      html += '<div style="flex: 1; min-width: 300px; background: #f8f9fa; padding: 12px; border-radius: 8px;">';
      html += '<h4 style="margin-top:0;color:#333">Кластер ' + c + ' (' + samplesInCluster.length + ' образцов)</h4>';
      html += '<ul style="font-size: 13px; max-height: 200px; overflow-y: auto;">';
      
      // Сортируем по расстоянию до центра
      samplesInCluster.sort(function(a, b) { return a.distance - b.distance; });
      
      samplesInCluster.forEach(function(sample) {
        html += '<li style="margin: 4px 0; padding: 4px; background: white; border-radius: 4px;">';
        html += '<strong>' + sample.name + '</strong><br>';
        html += '<span class="small">Расст. до центра: ' + sample.distance.toFixed(4) + '</span>';
        html += '</li>';
      });
      
      html += '</ul>';
      html += '</div>';
    }
    
    html += '</div>';
    clusterDetailsDiv.innerHTML = html;
  }
  
  // Визуализация кластеров в 2D
  function visualizeClusters2D() {
    if (!clusterResults || !featureVectors.length || !clusterCtx) {
      alert('Сначала выполните кластеризацию!');
      return;
    }
    
    // Упрощенная PCA проекция на 2D
    var vectors = featureVectors;
    if (vectors.length === 0 || vectors[0].length < 2) return;
    
    // Проецируем на первые две главные компоненты (упрощенно)
    var projected = vectors.map(function(v) { return [v[0] || 0, v[1] || 0]; });
    
    // Находим границы
    var minX = Math.min.apply(null, projected.map(function(p) { return p[0]; }));
    var maxX = Math.max.apply(null, projected.map(function(p) { return p[0]; }));
    var minY = Math.min.apply(null, projected.map(function(p) { return p[1]; }));
    var maxY = Math.max.apply(null, projected.map(function(p) { return p[1]; }));
    
    var width = clusterCanvas.width;
    var height = clusterCanvas.height;
    
    // Очищаем canvas
    clusterCtx.clearRect(0, 0, width, height);
    clusterCtx.fillStyle = '#0f172a';
    clusterCtx.fillRect(0, 0, width, height);
    
    // Цвета для кластеров
    var colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    
    // Рисуем точки
    for (var i = 0; i < projected.length; i++) {
      var cluster = clusterResults.assignments[i];
      var x = ((projected[i][0] - minX) / (maxX - minX || 1)) * (width - 40) + 20;
      var y = height - 20 - ((projected[i][1] - minY) / (maxY - minY || 1)) * (height - 40);
      
      clusterCtx.beginPath();
      clusterCtx.arc(x, y, 6, 0, Math.PI * 2);
      clusterCtx.fillStyle = colors[cluster % colors.length];
      clusterCtx.fill();
      clusterCtx.strokeStyle = '#334155';
      clusterCtx.lineWidth = 1;
      clusterCtx.stroke();
    }
    
    // Легенда
    if (clusterLegend) {
      var legendHTML = '<strong style="color:#cbd5e1">2D проекция кластеров:</strong> ';
      for (var c = 0; c < clusterResults.k; c++) {
        legendHTML += '<span style="margin-right:10px;color:#94a3b8"><span style="display:inline-block;width:12px;height:12px;background:' + 
                     colors[c % colors.length] + ';border-radius:50%;margin-right:4px;"></span>Кластер ' + c + '</span>';
      }
      clusterLegend.innerHTML = legendHTML;
    }
  }
  
  // Интерпретация кластеров через ChatGPT
  async function interpretClustersWithGPT() {
    if (!clusterResults) {
      alert('Сначала выполните кластеризацию!');
      return;
    }
    
    var apiKey = openaiKeyInput.value.trim();
    if (!apiKey) {
      alert('Введите OpenAI API ключ!');
      return;
    }
    
    try {
      setDisabledDuringWork(true);
      progressStart('Запрос к ChatGPT', 1);
      
      // Формируем промпт
      var prompt = buildClusterPrompt();
      
      // Отправляем запрос к OpenAI API
      var response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo', // Можно изменить на 'gpt-4' если доступно
          messages: [
            {
              role: 'system',
              content: 'Ты — эксперт по анализу акустических сигналов, нейронаукам и эффекту Фрея. Отвечай на русском языке.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1500
        })
      });
      
      if (!response.ok) {
        throw new Error('Ошибка API: ' + response.status);
      }
      
      var data = await response.json();
      var gptResponse = data.choices[0].message.content;
      
      // Отображаем ответ
      if (gptResponseDiv) {
        gptResponseDiv.style.display = 'block';
        gptResponseDiv.innerHTML = '<strong style="color:#10b981">Декодированная информация:</strong><br><br>' + 
                                  gptResponse.replace(/\n/g, '<br>');
      }
      
      progressDone('Получен ответ');
      setLog('Интерпретация кластеров завершена');
      
    } catch (error) {
      console.error('Ошибка запроса к ИИ:', error);
      if (gptResponseDiv) {
        gptResponseDiv.style.display = 'block';
        gptResponseDiv.innerHTML = '<strong style="color:#ef4444">Ошибка:</strong> ' + error.message + 
                                 '<br>Проверьте API ключ и подключение к интернету.';
      }
    } finally {
      setDisabledDuringWork(false);
    }
  }
  
  function buildClusterPrompt() {
    if (!clusterResults) return '';
    
    var prompt = (gptContextInput ? gptContextInput.value : '') + '\n\n';
    
    prompt += 'Детали кластеризации акустических сигналов:\n';
    prompt += '- Всего образцов: ' + clusterResults.assignments.length + '\n';
    prompt += '- Число кластеров: ' + clusterResults.k + '\n';
    prompt += '- Метод: K-means с автоматическим определением оптимального k\n';
    prompt += '- Признаки: огибающие RMS, спектральный центроид, огибающая Гильберта\n\n';
    
    prompt += 'Состав кластеров:\n';
    
    for (var c = 0; c < clusterResults.k; c++) {
      var samplesInCluster = clusterResults.samplesByCluster[c] || [];
      var sampleNames = samplesInCluster.map(function(s) { return s.name; }).join(', ');
      
      prompt += '--- Кластер ' + c + ' (' + samplesInCluster.length + ' образцов) ---\n';
      prompt += 'Образцы: ' + (sampleNames || 'нет') + '\n';
      
      // Добавляем акустические характеристики
      if (samplesInCluster.length > 0) {
        prompt += 'Характеристики (первые 3 образца):\n';
        
        for (var i = 0; i < Math.min(3, samplesInCluster.length); i++) {
          var sampleIdx = samplesInCluster[i].index;
          if (samples[sampleIdx] && samples[sampleIdx].env) {
            var env = samples[sampleIdx].env;
            prompt += '  • ' + samplesInCluster[i].name + ': ';
            prompt += 'RMS=' + env.rms.length + ' точек, ';
            prompt += 'Centroid=' + env.cent.length + ' точек, ';
            prompt += 'Hilbert=' + env.hilb.length + ' точек\n';
          }
        }
      }
      prompt += '\n';
    }
    
    prompt += 'Вопросы для анализа:\n';
    prompt += '1. Какие лингвистические единицы (фонемы, слоги, просодические паттерны) могут соответствовать каждому кластеру?\n';
    prompt += '2. Могут ли эти кластеры соответствовать определённым акустическим паттернам (тональные, импульсные, шумовые, модулированные)?\n';
    prompt += '3. Как эти кластеры могут быть связаны с эффектом Фрея и возможной модуляцией речи в микроволновом диапазоне?\n';
    prompt += '4. Какие дополнительные эксперименты или анализы ты рекомендуешь для проверки гипотез?\n';
    prompt += '5. Есть ли в этой кластеризации признаки систематической структуры, похожей на языковую?\n';
    
    return prompt;
  }

  /* ===========================
     Экспорт/тесты
     =========================== */
  function onExport(){
    try{
      var payload={ 
        samples:samples.map(function(s){return {name:s.name, src:s.src, type:s.type};}), 
        lastExtract:lastExtract, 
        lastMatchRes:lastMatchRes,
        clusterResults: clusterResults
      };
      var blob=new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a'); a.href=url; a.download='v2k_export.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setLog('Export saved');
    }catch(e){ console.error('export',e); alert('Export failed: '+(e&&e.message?e.message:e)); }
  }

  async function runSelfTest(){
    try{
      addDemoSamples(true); populateSelect(); currentIndex=0; sampleSelect.value='0';
      var bufQ=await loadBufferFor(currentIndex);
      var env_sr=120, dtwLen=64;
      var qenv=await extractEnvelopes(bufQ, env_sr, {dc:true,pre:true,hp:80,lp:4000,gate:true,gateInit:8,gateMul:1.8,gateRed:18,vad:true,vadQ:0.25,vadCF:250});
      function comb(env){ return combineFeature(env, dtwLen, {rms:true, cent:true, hilb:true}, true); }
      var a=comb(qenv);
      var b1=comb(await extractEnvelopes(await loadBufferFor(1), env_sr, {dc:true,pre:true,hp:80,lp:4000,gate:true,gateInit:8,gateMul:1.8,gateRed:18,vad:true,vadQ:0.25,vadCF:250}));
      var b2=comb(await extractEnvelopes(await loadBufferFor(2), env_sr, {dc:true,pre:true,hp:80,lp:4000,gate:true,gateInit:8,gateMul:1.8,gateRed:18,vad:true,vadQ:0.25,vadCF:250}));
      var d1=dtw1d_band(a,b1,15).cost, d2=dtw1d_band(a,b2,15).cost;
      resultsEl.textContent = 'Self-test:\n DTW(a, demo[1])='+d1.toFixed(4)+'\n DTW(a, demo[2])='+d2.toFixed(4);
      setLog('Self-test done');
    }catch(e){ console.error('self-test',e); alert('Self-test failed: '+(e&&e.message?e.message:e)); }
  }
  
  function runUnitTests(){
    var tests=[];
    try{
      var syntaxOk=false; try{ new Function('return 1')(); syntaxOk=true; }catch(e){ syntaxOk=false; }
      tests.push(['Syntax engine alive', syntaxOk]);
      var rs=linearResample(Float32Array.from([0,1,0,1]),5); tests.push(['linearResample len=5', rs.length===5]);
      var emptyCost=dtw1d_band(new Float32Array(0), new Float32Array(10),15).cost; tests.push(['DTW guard empty', emptyCost===Infinity]);
      var mres=magnitudeSpectrum(Float32Array.from([1,0,0,0])); tests.push(['magnitudeSpectrum ok', !!(mres&&mres.mag&&mres.mag.length>0)]);
      var norm=normalize(Float32Array.from([2,2,2])); tests.push(['normalize const->zeros', norm[0]===0 && norm[1]===0 && norm[2]===0]);
      var ae=analyticEnvelope(Float32Array.from([0,1,0,1,0,1])); tests.push(['analyticEnvelope length=6', !!ae && ae.length===6]);
      var demoText='http://a\nhttp://b\nhttp://c'; var splitOk = demoText.split(/\r?\n/).length===3; tests.push(['split /\\r?\\n/ works', splitOk]);
      var expectedEsc='&lt;div title=&quot;x&quot;&gt;O&#39;K&lt;/div&gt;'; var actualEsc=escapeHTML('<div title="x">O\'K</div>'); tests.push(['escapeHTML', expectedEsc===actualEsc]);
      var znv=znorm(Float32Array.from([1,2,3])); tests.push(['znorm length', znv.length===3]);
      var bandRes=dtw1d_band(Float32Array.from([0,1,2]), Float32Array.from([0,1,2]), 10).cost; tests.push(['DTW equal ~0', bandRes<1e-9]);
      var ok=tests.filter(function(t){return t[1];}).length;
      var report=tests.map(function(t){return (t[1]?'[OK] ':'[FAIL] ')+t[0];}).join('\n');
      resultsEl.textContent='Unit-tests:\n'+report+'\nTotal: '+ok+'/'+tests.length;
      setLog('Unit-tests done');
    }catch(e){ console.error('Unit-tests fatal', e); alert('Unit-tests fatal: '+(e&&e.message?e.message:e)); }
  }

  /* ===========================
     Демо-сэмплы (офлайн)
     =========================== */
  function addDemoSamples(force){
    if(window.__demoAdded && !force) return;
    if(!offlineCtx) offlineCtx=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1, 48000*2, 48000);
    var sr=offlineCtx.sampleRate;
    function synthTone(freq,dur,amFreq,name){
      freq=freq||440; dur=dur||0.9; amFreq=amFreq||6; name=name||'тон';
      var length=Math.floor(dur*sr), buf=offlineCtx.createBuffer(1,length,sr), ch=buf.getChannelData(0);
      for(var n=0;n<length;n++){ var t=n/sr; var am=0.5*(1+Math.sin(2*Math.PI/Math.max(1,amFreq)*t)); ch[n]=0.6*am*Math.sin(2*Math.PI/Math.max(1,freq)*t); }
      return {name:name, buffer:buf};
    }
    function synthClickTrain(rate,dur,name){
      rate=rate||7; dur=dur||1.1; name=name||'щелчки';
      var length=Math.floor(dur*sr), buf=offlineCtx.createBuffer(1,length,sr), ch=buf.getChannelData(0);
      var step=Math.max(1,Math.floor(sr/Math.max(1,rate)));
      for(var n=0;n<length;n++){ if(n%step===0){ ch[n]=1.0; if(n+1<length) ch[n+1]=-0.8; } ch[n]*=0.6; }
      return {name:name, buffer:buf};
    }
    function synthSweep(f0,f1,dur,name){
      f0=Math.max(1,f0||250); f1=Math.max(f0+1,f1||2200); dur=dur||1.2; name=name||'свип';
      var length=Math.floor(dur*sr), buf=offlineCtx.createBuffer(1,length,sr), ch=buf.getChannelData(0);
      for(var n=0;n<length;n++){ var t=n/sr; var f=f0*Math.pow(f1/f0, t/dur); ch[n]=0.55*Math.sin(2*Math.PI*f*t); }
      return {name:name, buffer:buf};
    }
    var bank=[
      synthTone(440,0.9,6,'демо-A (низкий тон)'),
      synthTone(880,0.9,5,'демо-B (высокий тон)'),
      synthSweep(250,2200,1.2,'демо-C (свип)'),
      synthClickTrain(7,1.1,'демо-D (щелчки)'),
      synthTone(660,0.9,12,'демо-E (AM тон)')
    ];
    var items=bank.map(function(b){ return {name:b.name, src:'demo:'+b.name, type:'demo', buffer:b.buffer}; });
    samples = items.concat(samples);
    window.__demoAdded=true;
  }

})();