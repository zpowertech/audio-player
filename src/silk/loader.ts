import { asBytes, type SilkBytes } from './container.js';
import { createSilk, type Silk } from './core.js';
import { silkError } from './errors.js';

export interface LoadSilkOptions {
  /** Overrides `wasmUrl`. No network request is made when bytes are supplied. */
  wasmBytes?: SilkBytes;
  /** Fetched as supplied. Relative URLs resolve against the document, not the package. */
  wasmUrl?: string | URL;
}

let embeddedModule: Promise<WebAssembly.Module> | undefined;

function loadEmbedded(): Promise<WebAssembly.Module> {
  if (!embeddedModule) {
    embeddedModule = (async () => {
      const { default: base64 } = await import('./wasm-inline.js');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return WebAssembly.compile(bytes);
    })();
  }
  return embeddedModule;
}

/** Lazily compile the embedded decoder once; each call creates an independent instance. */
export async function loadSilk(options: LoadSilkOptions = {}): Promise<Silk> {
  let cached: Promise<WebAssembly.Module> | undefined;
  try {
    let module: WebAssembly.Module;
    if (options.wasmBytes !== undefined) {
      module = await WebAssembly.compile(new Uint8Array(asBytes(options.wasmBytes)));
    } else if (options.wasmUrl !== undefined) {
      const response = await fetch(options.wasmUrl);
      if (!response.ok) throw new Error(`failed to fetch WASM (${response.status} ${response.statusText})`);
      module = await WebAssembly.compile(await response.arrayBuffer());
    } else {
      cached = loadEmbedded();
      module = await cached;
    }
    return createSilk(await WebAssembly.instantiate(module, {}));
  } catch (cause) {
    if (cached && cached === embeddedModule) embeddedModule = undefined;
    throw silkError('failed to load SILK WASM', cause);
  }
}
