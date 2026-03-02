# Architecture Overview

Air Canvas V3 has been modularized from a monolithic single-file prototype into a scalable TypeScript application powered by Vite.

## Directory Structure
The application is organized into the following core domains within the `src/` directory:

- **`core/`**: Handles the underlying state and computations.
  - `appState.ts`: Global application state store to avoid prop drilling.
  - `gestureDetector.ts`: Math-heavy logic for determining pinches, extensions, and velocities from given hand landmarks.
  - `handTracking.ts`: Contains the MediaPipe Initialization and connection. Loaded via CDN to keep the repository lightweight.

- **`drawing/`**: Manages all interactions with the HTML Canvas API.
  - `drawingCanvas.ts`: Specifically handles the Bezier curve and smoothed path rendering logic.
  - `drawingState.ts`: Manages stack-based features like the Undo and Redo arrays by saving off ImageDatas.

- **`ui/`**: Manages the interface overlays and DOM elements.
  - `handVisualizer.ts`: Calculates the on-screen cursor position, utilizing independent smoothing buffers and deadzones to stabilize the `div` element vs the actual ink path.
  - `uiComponents.ts`: Handles the initialization and event delegation of the radial color picker, mode badges, status popups, and draggable PIP panel.

- **`main.ts`**: The glue file. It initializes everything and orchestrates the primary `requestAnimationFrame` loop `detectLoop()` that grabs video frames, computes results, and delegates updates down the pipeline.

## Build System
The project uses **Vite** for local development, providing hot-module replacement and optimal bundling for distribution. **TypeScript** is strictly enforced to ensure complex point/pose objects are safely passed between domains. The MediaPipe dependency remains externally loaded to dramatically reduce install times and bundle weight.
