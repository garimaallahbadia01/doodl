# Doodl

Welcome to Doodl! This is a web-based drawing application that lets you paint on your screen using just your hands and a webcam, completely touch-free. 

It uses Google's MediaPipe for real-time hand tracking and translates your physical gestures into smooth, dynamic canvas strokes.

## Features

- **Gesture-Controlled:** Draw, erase, undo, change colors, and clear the screen without touching your mouse or keyboard.
- **Smooth Drawing:** Built-in algorithms stabilize your hand movements so your drawing feels natural and removes micro-tremors (even for those with shaky hands).
- **Radial Color Picker:** Just hold up two fingers and pinch to grab a new color dynamically anywhere on the screen.
- **Adjustable Brush:** Change your stroke thickness (and eraser size!) easily with a UI slider.
- **No Heavy Install:** MediaPipe runs entirely in your browser via a fast CDN, keeping the local repository extremely lightweight.

---

## The Gestures

Here is how you control the application:

| Action | Hand Gesture | What It Does |
| :--- | :--- | :--- |
| **Draw / Erase** | Point (Only index finger up) | Draws ink on the screen. If you are in Erase mode, it deletes ink. |
| **Toggle Mode** | Open Palm (All fingers up) | Hold your palm up steady for half a second. It will switch you back and forth between "Draw" and "Erase" modes. |
| **Color Picker** | Two Fingers (Index & Middle up) | A color wheel appears where your hand is. Move your hand to highlight a color, then pinch your thumb and index together to select it. |
| **Clear Canvas** | Fist | Hold a fist for a full second. You will see a circular timer fill up, then the whole screen clears. |
| **Undo** | Thumbs Down | Undoes your last stroke. Hold it down to automatically keep undoing faster. |
| **Redo** | Thumbs Up | Redoes the last stroke you undid. Hold it down to keep redoing. |

---

## How to Run Locally

If you want to run this project on your own machine:

1. **Prerequisites:** Make sure you have Node.js installed.
2. **Setup:** Open your terminal in this directory and install the local developer toolchain:
   ```bash
   npm install
   ```
3. **Run:** Start the Vite development server:
   ```bash
   npm run dev
   ```
4. **Play:** Open the `http://localhost:X` link provided in your terminal, allow camera access, and start drawing!

---

## Project Structure

This project has been modularized logically to remain completely scalable:

- `index.html` — The main Vite entry point.
- `src/core/` — Contains the math for recognizing gestures and loading the camera wrapper.
- `src/drawing/` — Handles all the Canvas API code (rendering lines, smoothing logic, undo stacks).
- `src/ui/` — Manages the interface elements (buttons, the floating color wheel, status popups).

If you want to read deeper into exactly how the math or tracking gestures operate, check out the `docs/` folder!
