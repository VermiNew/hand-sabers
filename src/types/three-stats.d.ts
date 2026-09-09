declare module 'three/examples/jsm/libs/stats.module.js' {
  export default class Stats {
    readonly dom: HTMLDivElement;
    showPanel(panel: number): void;
    update(): void;
  }
}
