import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Simple K-Means clustering for color extraction in the browser
export async function extractColorsFromImage(imageUrl: string, k: number = 3): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      // Resize for performance
      const MAX_SIZE = 100;
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height).data;
      const pixels: number[][] = [];

      for (let i = 0; i < imageData.length; i += 4) {
        // Ignore highly transparent pixels
        if (imageData[i + 3] >= 125) {
          pixels.push([imageData[i], imageData[i + 1], imageData[i + 2]]);
        }
      }

      resolve(kMeans(pixels, k).map(rgbToHex));
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

function kMeans(pixels: number[][], k: number, maxIterations: number = 10): number[][] {
  if (pixels.length === 0) return Array(k).fill([0, 0, 0]);

  // Initialize centroids randomly
  let centroids = Array.from({ length: k }, () => pixels[Math.floor(Math.random() * pixels.length)]);

  for (let iter = 0; iter < maxIterations; iter++) {
    const clusters: number[][][] = Array.from({ length: k }, () => []);

    // Assign pixels to nearest centroid
    for (const pixel of pixels) {
      let minDist = Infinity;
      let clusterIdx = 0;
      for (let i = 0; i < k; i++) {
        const dist = colorDistance(pixel, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          clusterIdx = i;
        }
      }
      clusters[clusterIdx].push(pixel);
    }

    // Recalculate centroids
    let changed = false;
    for (let i = 0; i < k; i++) {
      if (clusters[i].length > 0) {
        const newCentroid = [0, 0, 0];
        for (const pixel of clusters[i]) {
          newCentroid[0] += pixel[0];
          newCentroid[1] += pixel[1];
          newCentroid[2] += pixel[2];
        }
        newCentroid[0] = Math.round(newCentroid[0] / clusters[i].length);
        newCentroid[1] = Math.round(newCentroid[1] / clusters[i].length);
        newCentroid[2] = Math.round(newCentroid[2] / clusters[i].length);

        if (colorDistance(centroids[i], newCentroid) > 1) {
          changed = true;
          centroids[i] = newCentroid;
        }
      }
    }

    if (!changed) break;
  }

  return centroids;
}

function colorDistance(c1: number[], c2: number[]): number {
  // Simple Euclidean distance in RGB space
  return Math.sqrt(
    Math.pow(c1[0] - c2[0], 2) +
    Math.pow(c1[1] - c2[1], 2) +
    Math.pow(c1[2] - c2[2], 2)
  );
}

function rgbToHex(rgb: number[]): string {
  return '#' + rgb.map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}
