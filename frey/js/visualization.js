export class Visualizer {
    constructor() {
        this.canvas = document.getElementById('waveCanvas');
        this.ctx = this.canvas.getContext('2d');
    }

    drawWaveform(dataArray) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const bufferLength = dataArray.length;

        this.ctx.fillStyle = '#020617'; // very dark slate
        this.ctx.fillRect(0, 0, width, height);
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#3b82f6'; // blue-500
        this.ctx.beginPath();

        const sliceWidth = width * 1.0 / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * height / 2;

            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);

            x += sliceWidth;
        }

        this.ctx.lineTo(width, height / 2);
        this.ctx.stroke();
    }
}
