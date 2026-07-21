export function registerMlAssetCache(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  const register = () => {
    void navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(error => {
      console.warn('MediaPipe asset cache registration failed:', error);
    });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
