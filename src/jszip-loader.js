let jsZipPromise = null;

function isUsableJSZip(candidate) {
  return typeof candidate === 'function' && typeof candidate.loadAsync === 'function';
}

function resolveGlobalJSZip() {
  const candidate = globalThis.JSZip;
  if (isUsableJSZip(candidate)) return candidate;
  return null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-jszip-loader="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Nie udało się załadować JSZip z ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.jszipLoader = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Nie udało się załadować JSZip z ${src}`));
    document.head.appendChild(script);
  });
}

export async function getJSZip() {
  const alreadyLoaded = resolveGlobalJSZip();
  if (alreadyLoaded) return alreadyLoaded;

  if (!jsZipPromise) {
    jsZipPromise = (async () => {
      const localVendorUrl = new URL('./vendor/jszip.min.js', import.meta.url).href;
      const fallbacks = [
        localVendorUrl,
        './node_modules/jszip/dist/jszip.min.js',
      ];

      let lastError = null;
      for (const src of fallbacks) {
        try {
          await loadScript(src);
          const loaded = resolveGlobalJSZip();
          if (loaded) return loaded;
        } catch (err) {
          lastError = err;
        }
      }

      throw lastError || new Error('JSZip załadowany, ale globalThis.JSZip nie jest konstruktorem.');
    })();
  }

  return jsZipPromise;
}
