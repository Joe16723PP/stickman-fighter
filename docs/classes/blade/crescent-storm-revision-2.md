# Crescent Storm Revision 2

This note records the isolated Blade Super update. The original Blade class revision, Parry, and Counter Draw remain outside this change.

## Sequence

- Blade holds position during the 24-frame charge and the rest of the Super.
- The sword draw is active for two frames. Its sword-aligned hitbox deals 28 damage and registers once per target.
- On draw release, a crescent wave launches in the locked facing direction and lane. It travels forward at 900 px/s, up to 420 px or the stage edge, and can hit each valid target once for 46 damage.
- Melee and wave hit tracking are independent, so a target can receive both for 74 total damage.
- Wave hits hold targets in hitstun without the damage-burst knockdown. The Noto beat at frame 50 triggers their knockdown. A wave that reaches a target after Noto applies the same finish on impact.

## Implementation boundaries

- The existing special meter activation and consumption remain in `Fighter.startAtk`.
- `BladeSuper` owns wave travel, lane checks, per-target wave registration, and the Noto finish. Existing combat resolvers own the melee slash registration.
- No Parry, Counter Draw, normal-chain, Scabbard Kick, Karate, or Staff behavior is changed by the Blade-specific state path.
- Device visual QA and real-device gameplay review remain required before merge.
