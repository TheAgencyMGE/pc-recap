import { pathToFileURL } from 'node:url';

const LOCAL_DEVELOPMENT_URL = 'http://127.0.0.1:5173/';

interface RendererTargetOptions {
  isPackaged: boolean;
  developmentUrl?: string;
  rendererFile: string;
}

export type RendererTarget = {
  kind: 'url' | 'file';
  location: string;
  trustedUrl: string;
};

export function resolveRendererTarget({
  isPackaged, developmentUrl, rendererFile,
}: RendererTargetOptions): RendererTarget {
  if (!isPackaged && developmentUrl) {
    try {
      const normalized = new URL(developmentUrl).href;
      if (normalized === LOCAL_DEVELOPMENT_URL) {
        return { kind: 'url', location: normalized, trustedUrl: normalized };
      }
    } catch {
      // Invalid or non-local development URLs fall through to the bundled renderer.
    }
  }
  return { kind: 'file', location: rendererFile, trustedUrl: pathToFileURL(rendererFile).href };
}

export function isTrustedNavigation(url: string, target: RendererTarget) {
  return url === target.trustedUrl;
}
