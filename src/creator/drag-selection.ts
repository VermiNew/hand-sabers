import { state } from './state.ts';
import { getLabelWidth, getTrackLayout, requestTimelineRender } from './timeline.ts';

export class TimelineDragSelection {
  private startX = 0;
  private startY = 0;
  private endX = 0;
  private endY = 0;

  active = false;

  begin(x: number, y: number): void {
    this.active = true;
    this.startX = x;
    this.startY = y;
    this.endX = x;
    this.endY = y;
  }

  update(canvas: HTMLCanvasElement, x: number, y: number): void {
    if (!this.active) return;
    this.endX = x;
    this.endY = y;
    this.selectAndRender(canvas);
  }

  commit(canvas: HTMLCanvasElement): void {
    if (!this.active) return;
    this.selectAndRender(canvas);
    this.active = false;
  }

  cancel(): void {
    this.active = false;
  }

  private selectAndRender(canvas: HTMLCanvasElement): void {
    const { TRACK_H, TRACK_L_Y, TRACK_R_Y, TRACK_B_Y } = getTrackLayout(canvas.height);
    const x1 = Math.min(this.startX, this.endX);
    const x2 = Math.max(this.startX, this.endX);
    const y1 = Math.min(this.startY, this.endY);
    const y2 = Math.max(this.startY, this.endY);
    state.selectedBeats.clear();
    for (const beat of state.map.beats) {
      const beatX = getLabelWidth() + (beat.t - state.viewStart) * state.pxPerSec;
      const trackY = beat.type === 'bomb' ? TRACK_B_Y : beat.side === 'left' ? TRACK_L_Y : TRACK_R_Y;
      const beatY = trackY + TRACK_H / 2;
      if (beatX >= x1 && beatX <= x2 && beatY >= y1 && beatY <= y2) state.selectedBeats.add(beat);
    }
    this.renderRect(canvas, x1, y1, x2 - x1, y2 - y1);
  }

  private renderRect(canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number): void {
    requestTimelineRender();
    const context = canvas.getContext('2d');
    if (!context) return;
    context.strokeStyle = 'rgba(255,255,255,0.55)';
    context.fillStyle = 'rgba(255,255,255,0.06)';
    context.lineWidth = 1;
    context.setLineDash([4, 3]);
    context.beginPath();
    context.rect(x, y, width, height);
    context.fill();
    context.stroke();
    context.setLineDash([]);
  }
}
