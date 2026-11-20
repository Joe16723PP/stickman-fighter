# Karate frame glide

Side view, facing right, one fighter, one ground line. Loops return to the first frame. One-shot actions end on the guard, except the knockdown, which holds the last frame. Playback is 12 frames per second.

- [x] Keep one frame size for every strip, with the same head height and the same ground line.
- [x] Redraw the idle so the chest and fists actually move between frames.
- [x] Add the two missing walk frames between the existing steps.
- [x] Split the punch into out, hold, and back instead of two nearly identical punches.
- [x] Add the halfway rise and the halfway drop of the kick.
- [x] Add the tilt and the near-ground frames so the fall does not teleport.
- [x] Export each frame as a transparent PNG, in order, with the same padding.
- [x] Play each strip at 12 frames per second on the 60 fps game loop.
- [x] Watch the walk and the punch at gameplay size before drawing more actions.
