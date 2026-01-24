class ChannelStrip {
    constructor(ctx, analyser, destination) {
        this.ctx = ctx; this.analyser = analyser; this.destination = destination;
        this.lowShelf = ctx.createBiquadFilter(); this.lowShelf.type = 'lowshelf'; this.lowShelf.frequency.value = 150;
        this.midPeak = ctx.createBiquadFilter(); this.midPeak.type = 'peaking'; this.midPeak.frequency.value = 1000; this.midPeak.Q.value = 1;
        this.highShelf = ctx.createBiquadFilter(); this.highShelf.type = 'highshelf'; this.highShelf.frequency.value = 8000;
        this.gainNode = ctx.createGain(); this.gainNode.gain.value = 1.0;
        this.lowShelf.connect(this.midPeak); this.midPeak.connect(this.highShelf); this.highShelf.connect(this.gainNode);
        this.gainNode.connect(this.analyser);
        if (this.destination) this.gainNode.connect(this.destination);
        this.inputPoint = this.lowShelf; this.currentSource = null;
    }
    connectInput(sourceNode) { if (this.currentSource) try{this.currentSource.disconnect()}catch(e){}; this.currentSource = sourceNode; sourceNode.connect(this.inputPoint); }
    disconnect() { if(this.currentSource){ try{this.currentSource.disconnect()}catch(e){}; this.currentSource=null; } }
    setEQ(l, m, h) { this.lowShelf.gain.value = l; this.midPeak.gain.value = m; this.highShelf.gain.value = h; }
    setVolume(v) { this.gainNode.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
}

export class AudioEngine {
    constructor(visualizer, dsp) {
        const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
        this.viz = visualizer; this.dsp = dsp;
        this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.2;
        this.byteData = new Uint8Array(this.analyser.frequencyBinCount);
        this.floatData = new Float32Array(this.analyser.fftSize);
        this.channels = {
            file: new ChannelStrip(this.ctx, this.analyser, this.ctx.destination),
            radio: new ChannelStrip(this.ctx, this.analyser, this.ctx.destination),
            mic: new ChannelStrip(this.ctx, this.analyser, null) 
        };
        this.currentBuffer = null; this.isLive = false; this.animationId = null;
        this._radioElement = document.getElementById('streamPlayer');
    }
    updateMixer(s) { Object.values(this.channels).forEach(ch => { ch.setVolume(s.gain); ch.setEQ(s.low, s.mid, s.high); }); }
    async loadFile(file) { if(this.ctx.state==='suspended')await this.ctx.resume(); const ab=await file.arrayBuffer(); this.currentBuffer=await this.ctx.decodeAudioData(ab); return this.currentBuffer; }
    playCurrentBuffer() { if(!this.currentBuffer)return alert('No file'); this.channels.file.disconnect(); const s=this.ctx.createBufferSource(); s.buffer=this.currentBuffer; this.channels.file.connectInput(s); s.start(0); this.startLoop(); }
    async startStream(url) { if(this.ctx.state==='suspended')await this.ctx.resume(); this.channels.radio.disconnect(); if(!this._radioElement)return; this._radioElement.src=url; this._radioElement.crossOrigin="anonymous"; try{ await this._radioElement.play(); if(!this._sn)this._sn=this.ctx.createMediaElementSource(this._radioElement); this.channels.radio.connectInput(this._sn); this.startLoop(); }catch(e){alert(e.message);} }
    async startMicrophone(id) { if(this.ctx.state==='suspended')await this.ctx.resume(); this.channels.mic.disconnect(); try{ const s=await navigator.mediaDevices.getUserMedia({audio:{deviceId:id?{exact:id}:undefined, echoCancellation:false}}); const sn=this.ctx.createMediaStreamSource(s); this.channels.mic.connectInput(sn); this.startLoop(); }catch(e){alert(e.message);} }
    stop() { this.channels.file.disconnect(); this.channels.radio.disconnect(); this.channels.mic.disconnect(); if(this._radioElement){this._radioElement.pause();this._radioElement.src="";} this.isLive=false; cancelAnimationFrame(this.animationId); }
    startLoop() { if(!this.isLive){this.isLive=true; this.loop();} }
    loop() { if(!this.isLive)return; if(this.viz){this.analyser.getByteTimeDomainData(this.byteData); this.viz.drawWaveform(this.byteData);} if(this.dsp){this.analyser.getFloatTimeDomainData(this.floatData); this.dsp.processRealTime(this.floatData, this.ctx.sampleRate);} this.animationId=requestAnimationFrame(()=>this.loop()); }
}
