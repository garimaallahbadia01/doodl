# Known Limitations

- **Browser Resizing Conflicts**
  The `<canvas>` layer forces a `w/h` reset on screen `resizeEvent()`. While we attempt via a `tempCanvas` context pass to save the drawn content, certain complex scaling artifacts might blur thin line strokes. Wait briefly after entering fullscreen to resume pointing.
  
- **Heavy CPU/GPU Reliance**
  Given the local processing required for MediaPipe task resolution, mobile devices and low-tier APUs will see a marked lag in pipeline speed, throttling drawing update speeds below 60hz. The dead-zone checks ensure lines are always smooth--but they may visibly "chase" the physical hand.

- **Thumb Recognition Variance**
  Individual users hold the human thumb at different rest angles relative to the knuckles. Hand landmarks in MediaPipe can misclassify pointing for 'two fingers' if the thumb rests exceptionally high.

- **Background Interference**
  Hands overlapping with faces or very messy backgrounds (specifically, high contrast shadows) cause frequent `flickering` of the `handLandmarker.detect()`, leading to split paths during drawing. Ensure clear background lighting.
