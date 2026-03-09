# Gesture Dictionary

Doodle maps distinct hand poses to actions via sophisticated geometric filtering and bounding box heuristics.

### Base Modifiers
- **Fast Movement Filtering**: If a hand moves faster than `FAST_MOVEMENT_THRESHOLD` per second, gestures are ignored, and the pose falls back to `NEUTRAL`. This drastically limits accidental triggering during gross arm sweeps.

### Interaction Map
- **Point (Index Extended Only)**
  - Action: Draws or erases ink (dependent on current Mode).
  - Caveats: Employs a unique smoothing buffer (`CURSOR_SMOOTHING_BUFFER_SIZE`) paired with a tight `CURSOR_DEAD_ZONE` check to lock the on-screen UI dot precisely to the bezier curve ink layer.

- **Open Palm (All Fingers Extended)**
  - Action: Hold stable for `PALM_HOLD_TIME` to flip between **Draw** and **Erase** modes.
  - Caveats: To switch, the palm center must remain within a tight pixel cluster to verify intentionality.

- **Fist (All Fingers Curled)**
  - Action: Clear the Canvas.
  - Caveats: Renders an accelerating arc clock overlay directly at the finger position. Sustained for `FIST_HOLD_TIME`.

- **Pinch (Thumb & Index)**
  - Action: Confirm Color Selection.
  - Caveats: Activated when distance between tips and normalized hand size drop below `PINCH_START_THRESHOLD`. Exits cleanly when past `PINCH_END_THRESHOLD`. Snaps you out of Erase mode back to Draw.

- **Two Fingers (Index & Middle Extended)**
  - Action: "Pen Up" / Explicit pause. Stops drawing instantly.
  - Caveats: Also acts as an explicit gesture block to prevent accidental color picker opening when making other gestures.

- **Thumbs Down / Thumbs Up (Others Curled)**
  - Action: Undo (Down) and Redo (Up).
  - Caveats: Fires immediately on pose entry, and repeats continually (`UNDO_REPEAT_INTERVAL`) if the pose is maintained past the initial `UNDO_REPEAT_DELAY`.
