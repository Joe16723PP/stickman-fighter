export class CombatPose {
  static idle() { return {torso:0,la:-.4,le:-.2,ra:.4,re:.2,ll:.15,lk:.1,rl:-.15,rk:-.1}; }
  static walk(t) {
    const s = Math.sin(t * 10) * .55, c = Math.cos(t * 10) * .35;
    return {torso:0,la:-.5+c*.2,le:-.3,ra:.5-c*.2,re:.3,ll:s,lk:Math.max(0,s)*.6,rl:-s,rk:Math.max(0,-s)*.6};
  }
  static jump() { return {torso:-.05,la:-2.6,le:-.5,ra:2.6,re:.5,ll:.9,lk:1.1,rl:-.9,rk:1.1}; }
  static punch() { return {torso:.15,la:-.5,le:-.2,ra:1.55,re:.2,ll:.2,lk:.1,rl:-.2,rk:.1}; }
  static kick() { return {torso:-.15,la:-.6,le:-.2,ra:.5,re:.2,ll:1.55,lk:.2,rl:-.25,rk:.2}; }
  static special() { return {torso:-.25,la:-1.1,le:-.4,ra:.8,re:.3,ll:1.85,lk:.15,rl:-.5,rk:.4}; }
  static windup() { return {torso:.1,la:-.8,le:-.3,ra:.6,re:.2,ll:-.6,lk:.9,rl:.3,rk:.2}; }
  static block() { return {torso:-.05,la:.9,le:1.2,ra:.7,re:1.1,ll:.2,lk:.15,rl:-.2,rk:.15}; }
  static hit() { return {torso:-.2,la:-1.2,le:-.4,ra:-1,re:-.3,ll:.3,lk:.2,rl:-.4,rk:.3}; }
}

export class Pose {
  static KEYS = ['chest','neck','head','la','le','ra','re','ll','lk','rl','rk','hipBob','shPull'];
  static ANGLE_KEYS = ['chest','neck','head','la','le','ra','re','ll','lk','rl','rk'];
  static deg(d) { return d * Math.PI / 180; }
  /** Shortest signed delta from a→b in radians, in (-π, π]. */
  static angleDelta(a, b) {
    let d = (b || 0) - (a || 0);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d <= -Math.PI) d += Math.PI * 2;
    return d;
  }
  static base() {
    return {chest:0, neck:0, head:0, la:0, le:0, ra:0, re:0, ll:0, lk:0, rl:0, rk:0, hipBob:0, shPull:0};
  }
  static staffGrip(chest = -6, arms = [-110,-25,24,55], legs = [34,16,-24,18], hipBob = 0) {
    const d = Pose.deg;
    const [la,le,ra,re] = arms, [ll,lk,rl,rk] = legs;
    return {chest:d(chest),neck:d(2),head:d(1),la:d(la),le:d(le),ra:d(ra),re:d(re),
      ll:d(ll),lk:d(lk),rl:d(rl),rk:d(rk),hipBob,shPull:0};
  }
  static copy(p) {
    const o = {}; for (const k of Pose.KEYS) o[k] = p[k] || 0; return o;
  }
  static lerp(a, b, t) {
    const o = {};
    for (const k of Pose.KEYS) {
      if (Pose.ANGLE_KEYS.indexOf(k) >= 0)
        o[k] = (a[k] || 0) + Pose.angleDelta(a[k], b[k]) * t;
      else
        o[k] = (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * t;
    }
    return o;
  }
  /** Step each angle toward target by at most maxStep radians (shortest path). */
  static stepAngles(from, to, maxStep) {
    const o = Pose.copy(to);
    for (const k of Pose.ANGLE_KEYS) {
      const d = Pose.angleDelta(from[k], to[k]);
      if (Math.abs(d) <= maxStep) o[k] = to[k];
      else o[k] = (from[k] || 0) + Math.sign(d) * maxStep;
    }
    return o;
  }
  static easeOut(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }
  /** Compact boxing guard, elbows tucked and fists high. */
  static idle(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip();
    if (profile?.weapon === 'blade') return {chest:d(-5),neck:d(2),head:d(1),la:d(-120),le:d(80),ra:d(-60),re:d(-80),shPull:0,ll:d(32),lk:d(22),rl:d(-36),rk:d(28),hipBob:0};
    const stances = {
      rush: {chest:d(-4),neck:d(2),head:d(2),la:d(-92),le:d(-82),ra:d(-68),re:d(-108),shPull:7,ll:d(18),lk:d(14),rl:d(-16),rk:d(18),hipBob:0},
      flame:{chest:d(-1),neck:d(1),head:d(1),la:d(-100),le:d(-104),ra:d(-62),re:d(-98),shPull:3,ll:d(24),lk:d(10),rl:d(-22),rk:d(24),hipBob:0},
      // Tae Kwon Do: upright guard, narrow stance, and a chambered lead leg.
      flash:{chest:d(-1),neck:d(1),head:d(1),la:d(-94),le:d(-72),ra:d(-72),re:d(-112),shPull:0,ll:d(28),lk:d(18),rl:d(-22),rk:d(22),hipBob:0},
      quake:{chest:d(7),neck:d(-2),head:d(4),la:d(-112),le:d(-56),ra:d(-56),re:d(-64),shPull:0,ll:d(24),lk:d(18),rl:d(-20),rk:d(24),hipBob:0},
      // Karate guard: angled torso, compact lead hand, rear fist tucked by the ribs.
      ward: {chest:d(-5),neck:d(2),head:d(1),la:d(-136),le:d(-66),ra:d(-112),re:d(-72),shPull:0,ll:d(30),lk:d(24),rl:d(-28),rk:d(26),hipBob:0},
    };
    return stances[profile?.style] || stances.rush;
  }
  static throwWindup() {
    const d = Pose.deg;
    return {chest:d(-10),neck:d(3),head:d(2),la:d(-112),le:d(-50),ra:d(148),re:d(108),ll:d(26),lk:d(18),rl:d(-24),rk:d(22),hipBob:0,shPull:7};
  }
  static throwRelease() {
    const d = Pose.deg;
    return {chest:d(-16),neck:d(2),head:d(1),la:d(-118),le:d(-54),ra:d(82),re:d(18),ll:d(34),lk:d(20),rl:d(-30),rk:d(24),hipBob:-1,shPull:0};
  }
  static throwRecovery() {
    const d = Pose.deg;
    return {chest:d(5),neck:d(-1),head:d(2),la:d(-96),le:d(-74),ra:d(52),re:d(-24),ll:d(20),lk:d(14),rl:d(-18),rk:d(18),hipBob:0,shPull:0};
  }
  static roll(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(28,[-112,-28,26,54],[58,68,-58,68],0);
    return {chest:d(32),neck:d(-6),head:d(-8),la:d(-132),le:d(58),ra:d(-102),re:d(68),ll:d(62),lk:d(72),rl:d(-72),rk:d(72),hipBob:0,shPull:0};
  }
  /** Speed-scaled gait; hip dip follows the step phase. */
  static walk(t, speed = 1, profile = null) {
    const d = Pose.deg, phase = t * Math.PI * 2 / .45;
    const stride = Math.max(0, Math.min(1, speed));
    const leg = Math.sin(phase) * d(22 + 12 * stride), arm = Math.sin(phase) * d(14 + 10 * stride);
    const dip = (1 - Math.cos(phase * 2)) * (1 + 1.5 * stride);
    const id = Pose.idle(profile);
    if (profile?.weapon === 'staff') {
      const step = Math.sin(phase) * d(18 + 7 * stride);
      return {...id,la:id.la - arm * .08,le:id.le + d(2),ra:id.ra - arm * .06,re:id.re - d(2),
        ll:step + d(10),lk:Math.max(0,Math.sin(phase)) * d(18) + d(8),
        rl:-step - d(12),rk:Math.max(0,-Math.sin(phase)) * d(18) + d(8),hipBob:dip * .35};
    }
    if (profile?.weapon === 'blade') {
      const step = Math.sin(phase) * d(16 + 6 * stride);
      return {...id,la:id.la - arm * .18,le:id.le + d(3),ra:id.ra - arm * .12,re:id.re - d(3),
        ll:step + d(12),lk:Math.max(0,Math.sin(phase)) * d(22) + d(8),
        rl:-step - d(12),rk:Math.max(0,-Math.sin(phase)) * d(20) + d(8),hipBob:dip * .4};
    }
    if (profile?.style === 'ward') {
      // Keep the fists in guard while using short, grounded karate steps.
      const step = Math.sin(phase) * d(15 + 6 * stride);
      return {...id,la:id.la - arm * .12,le:id.le + d(2),ra:id.ra - arm * .1,re:id.re - d(2),
        ll:step + d(13),lk:Math.max(0,Math.sin(phase)) * d(20) + d(10),
        rl:-step - d(13),rk:Math.max(0,-Math.sin(phase)) * d(20) + d(10),hipBob:dip * .4};
    }
    if (profile?.style === 'flash') {
      // Quick, short steps keep the ninja planted instead of swinging limbs wide.
      const step = Math.sin(phase) * d(17 + 7 * stride);
      return {...id,
        la:id.la - arm * .35, le:id.le + d(5), ra:id.ra - arm * .35, re:id.re - d(5),
        ll:step, lk:Math.max(0, Math.sin(phase)) * d(24) + d(8),
        rl:-step, rk:Math.max(0, -Math.sin(phase)) * d(24) + d(8),
        hipBob:dip * .55};
    }
    return {...id,
      la:id.la - arm, le:id.le + d(10), ra:id.ra - arm, re:id.re - d(8),
      ll:leg, lk:Math.max(0, Math.sin(phase)) * d(40) + d(8),
      rl:-leg, rk:Math.max(0, -Math.sin(phase)) * d(40) + d(8),
      hipBob:dip};
  }
  static jumpPhase(vy) {
    if (vy < -420) return 'takeoff';
    if (Math.abs(vy) < 80) return 'apex';
    return vy < 0 ? 'rise' : 'fall';
  }
  static jump(phase, profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') {
      if (phase === 'takeoff') return Pose.staffGrip(-12,[-112,-28,20,52],[42,-30,-30,44],0);
      if (phase === 'rise') return Pose.staffGrip(-8,[-110,-26,22,52],[74,-44,-58,48],0);
      if (phase === 'apex') return Pose.staffGrip(-5,[-108,-24,24,54],[78,-54,-54,54],0);
      return Pose.staffGrip(2,[-112,-28,20,52],[24,0,-24,0],0);
    }
    if (profile?.style === 'ward') {
      const poses = {
        takeoff:{chest:-7,ll:48,lk:-38,rl:-32,rk:42},
        rise:{chest:-4,ll:76,lk:-50,rl:-62,rk:54},
        apex:{chest:-2,ll:82,lk:-58,rl:-56,rk:58},
        fall:{chest:3,ll:26,lk:0,rl:-26,rk:0}
      };
      const p = poses[phase] || poses.fall;
      return {chest:d(p.chest),neck:d(2),head:d(1),la:d(-136),le:d(-66),ra:d(-112),re:d(-68),
        ll:d(p.ll),lk:d(p.lk),rl:d(p.rl),rk:d(p.rk),hipBob:0};
    }
    if (phase === 'takeoff') {
      return {chest:d(-6), neck:d(2), head:d(3),
        la:d(-98), le:d(-84), ra:d(-72), re:d(-108),
        ll:d(40), lk:d(-55), rl:d(-25), rk:d(55), hipBob:0};
    }
    if (phase === 'rise') {
      return {chest:d(-4), neck:d(2), head:d(2),
        la:d(-100), le:d(-84), ra:d(-72), re:d(-108),
        ll:d(95), lk:d(-55), rl:d(-70), rk:d(65), hipBob:0};
    }
    if (phase === 'apex') {
      return {chest:d(-2), neck:d(2), head:d(1),
        la:d(-102), le:d(-82), ra:d(-74), re:d(-108),
        ll:d(100), lk:d(-72), rl:d(-65), rk:d(68), hipBob:0};
    }
    // Bring the legs under the hips before impact and return the hands to guard.
    return {chest:d(3), neck:d(1), head:0,
      la:d(-92), le:d(-82), ra:d(-68), re:d(-108),
      ll:d(25), lk:0, rl:d(-25), rk:0, hipBob:0};
  }
  static land(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(8,[-112,-28,22,52],[40,32,-36,24],4);
    return {chest:d(6), neck:d(-1), head:d(3),
      la:d(-90), le:d(-108), ra:d(-65), re:d(-120),
      ll:d(38), lk:d(-75), rl:d(-38), rk:d(75), hipBob:4};
  }
  static punchWind(profile = null, combo = 0) {
    const d = Pose.deg;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      if (combo === 1) return Pose.staffGrip(17,[-146,-38,-94,-34],[48,30,-48,34],-3);
      if (combo === 2) return Pose.staffGrip(24,[-158,-24,-108,-42],[62,38,-60,42],-5);
      // Draw the rear hand back, keeping both hands spaced along the shaft.
      return Pose.staffGrip(8,[-130,20,-60,100],[30,22,-34,22],0);
    }
    if (profile?.weapon === 'blade') {
      if (combo === 1) return {chest:d(22),neck:d(-3),head:d(4),la:d(-118),le:d(-34),ra:d(-164),re:d(-48),ll:d(48),lk:d(28),rl:d(-56),rk:d(38),hipBob:-3,shPull:12};
      if (combo === 2) return {chest:d(28),neck:d(-5),head:d(5),la:d(-62),le:d(-72),ra:d(-148),re:d(-34),ll:d(60),lk:d(36),rl:d(-64),rk:d(44),hipBob:-5,shPull:14};
      return {chest:d(9),neck:d(2),head:d(1),la:d(-68),le:d(-38),ra:d(-142),re:d(-34),ll:d(30),lk:d(20),rl:d(-34),rk:d(26),hipBob:0,shPull:4};
    }
    if (style === 'ward' && combo === 1) return {chest:d(21),neck:d(-3),head:d(3),la:d(-134),le:d(-64),ra:d(70),re:d(132),ll:d(46),lk:d(26),rl:d(-52),rk:d(34),hipBob:-3,shPull:11};
    if (style === 'ward' && combo === 2) return {chest:d(27),neck:d(-5),head:d(5),la:d(-132),le:d(-62),ra:d(52),re:d(118),ll:d(58),lk:d(34),rl:d(-62),rk:d(42),hipBob:-5,shPull:13};
    if (combo === 1) return {chest:d(15),neck:d(-2),head:d(2),la:d(-112),le:d(-98),ra:d(52),re:d(118),ll:d(34),lk:d(25),rl:d(-38),rk:d(26),hipBob:0,shPull:7};
    if (combo === 2) return {chest:d(19),neck:d(-3),head:d(2),la:d(-126),le:d(-62),ra:d(26),re:d(28),ll:d(50),lk:d(34),rl:d(-46),rk:d(30),hipBob:-2,shPull:8};
    if (style === 'flame') return {chest:d(5),neck:d(-1),head:d(2),la:d(-104),le:d(-108),ra:d(12),re:d(142),ll:d(22),lk:d(12),rl:d(-18),rk:d(20),hipBob:0,shPull:5};
    if (style === 'flash') return {chest:d(3),neck:d(1),head:d(1),la:d(-84),le:d(-68),ra:d(48),re:d(128),ll:d(16),lk:d(14),rl:d(-18),rk:d(18),hipBob:0,shPull:4};
    if (style === 'quake') return {chest:d(19),neck:d(-5),head:d(7),la:d(-110),le:d(-58),ra:d(30),re:d(18),ll:d(27),lk:d(15),rl:d(-22),rk:d(28),hipBob:0,shPull:8};
    if (style === 'ward') return {chest:d(7),neck:d(1),head:d(2),la:d(-136),le:d(-66),ra:d(28),re:d(76),ll:d(28),lk:d(22),rl:d(-26),rk:d(24),hipBob:0,shPull:5};
    // Turn the shoulder back while keeping the lead hand high as a guard.
    return {chest:d(8), neck:d(-1), head:d(4),
      la:d(-92), le:d(-82), ra:d(75), re:d(140),
      ll:d(16), lk:d(20), rl:d(-20), rk:d(18), hipBob:0, shPull:6};
  }
  static punchStrike(over, profile = null, combo = 0) {
    const d = Pose.deg, o = over ? d(10) : 0;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      if (combo === 1) return Pose.staffGrip(-22,[-82,16,-28,-126],[48,24,-50,30],-3);
      if (combo === 2) return Pose.staffGrip(-31,[-68,20,-18,-136],[62,32,-64,38],-5);
      // Drive both hands forward together for a clear two-hand thrust.
      return Pose.staffGrip(-13,[-90,0,-30,-120],[34,18,-38,18],0);
    }
    if (profile?.weapon === 'blade') {
      if (combo === 1) return {chest:d(-28),neck:d(3),head:d(-2),la:d(-130),le:d(-60),ra:d(-84)-o,re:d(68),ll:d(54),lk:d(30),rl:d(-58),rk:d(38),hipBob:-4};
      if (combo === 2) return {chest:d(-34),neck:d(-4),head:d(4),la:d(-54),le:d(-46),ra:d(-128)-o,re:d(30),ll:d(68),lk:d(38),rl:d(-68),rk:d(44),hipBob:-6};
      return {chest:d(-18),neck:d(-1),head:0,la:d(-48),le:d(-28),ra:d(-78) - o,re:d(-18),ll:d(42),lk:d(24),rl:d(-42),rk:d(24),hipBob:0};
    }
    if (style === 'ward' && combo === 1) return {chest:d(-28),neck:d(3),head:d(-2),la:d(-132),le:d(-70),ra:d(-88)-o,re:d(74),ll:d(52),lk:d(28),rl:d(-58),rk:d(36),hipBob:-3,shPull:0};
    if (style === 'ward' && combo === 2) return {chest:d(-34),neck:d(4),head:d(4),la:d(-138),le:d(-68),ra:d(-100)-o,re:d(88),ll:d(64),lk:d(36),rl:d(-66),rk:d(42),hipBob:-6,shPull:0};
    if (combo === 1) return {chest:d(-16),neck:d(2),head:d(1),la:d(-118),le:d(-96),ra:d(-72),re:d(54),ll:d(42),lk:d(22),rl:d(-44),rk:d(22),hipBob:0};
    if (combo === 2) return {chest:d(-24),neck:d(-3),head:d(-2),la:d(-128),le:d(-60),ra:d(-94),re:d(64),ll:d(56),lk:d(28),rl:d(-52),rk:d(28),hipBob:-2};
    if (style === 'flame') return {chest:d(-3),neck:d(2),head:d(2),la:d(-102),le:d(-108),ra:d(-82),re:d(42),ll:d(20),lk:d(12),rl:d(-20),rk:d(20),hipBob:0};
    if (style === 'flash') return {chest:d(-10),neck:d(1),head:d(0),la:d(-82),le:d(-66),ra:d(-92),re:d(-22),ll:d(14),lk:d(12),rl:d(-16),rk:d(16),hipBob:0};
    if (style === 'quake') return {chest:d(-13),neck:d(3),head:d(6),la:d(-112),le:d(-58),ra:d(-105),re:d(58),ll:d(25),lk:d(14),rl:d(-24),rk:d(26),hipBob:0};
    if (style === 'ward') return {chest:d(-12),neck:d(2),head:d(1),la:d(-140),le:d(-68),ra:d(-90) - o,re:d(-2),ll:d(28),lk:d(22),rl:d(-30),rk:d(26),hipBob:0};
    return {chest:d(-8), neck:d(1), head:d(4),
      la:d(-92), le:d(-82), ra:d(-95) - o, re:d(10) + o * .3,
      ll:d(18), lk:d(16), rl:d(-22), rk:d(20), hipBob:0};
  }
  static punchRec(profile = null, combo = 0) {
    const d = Pose.deg;
    const idle = Pose.idle(profile);
    if (profile?.weapon === 'staff' && combo === 1) return Pose.staffGrip(12,[-124,-28,-76,-48],[40,26,-42,30],-2);
    if (profile?.weapon === 'staff' && combo === 2) return Pose.staffGrip(-8,[-108,-18,30,58],[50,30,-46,28],-3);
    if (profile?.weapon === 'blade' && combo === 1) return {chest:d(12),neck:d(2),head:d(2),la:d(-120),le:d(72),ra:d(-106),re:d(-66),ll:d(38),lk:d(26),rl:d(-38),rk:d(30),hipBob:-2};
    if (profile?.weapon === 'blade' && combo === 2) return {chest:d(-11),neck:d(2),head:d(1),la:d(-116),le:d(64),ra:d(-84),re:d(-50),ll:d(50),lk:d(32),rl:d(-46),rk:d(34),hipBob:-3};
    if (profile?.style === 'ward' && combo === 1) return {...idle,chest:idle.chest + Pose.deg(10),head:idle.head + Pose.deg(2),ra:Pose.deg(-122),re:Pose.deg(-62),ll:Pose.deg(38),rl:Pose.deg(-34),hipBob:-2};
    if (profile?.style === 'ward' && combo === 2) return {...idle,chest:idle.chest + Pose.deg(13),head:idle.head + Pose.deg(3),la:Pose.deg(-138),le:Pose.deg(-68),ra:Pose.deg(-102),re:Pose.deg(-38),ll:Pose.deg(50),lk:Pose.deg(32),rl:Pose.deg(-44),rk:Pose.deg(34),hipBob:-3};
    if (combo === 1) return {...idle, chest: idle.chest + Pose.deg(3), hipBob: -1};
    if (combo === 2) return {...idle, chest: idle.chest + Pose.deg(5), hipBob: -2};
    return idle;
  }
  /** Muay Thai knee chamber with both hands protecting the head. */
  static kickWind(profile = null, linked = false) {
    const d = Pose.deg;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      if (linked) return Pose.staffGrip(19,[-148,-40,-82,-54],[58,34,-54,38],-4);
      return Pose.staffGrip(12,[-132,-46,-88,-44],[48,26,-42,30],-2);
    }
    if (profile?.weapon === 'blade') {
      if (linked) return {chest:d(18),neck:d(-4),head:d(4),la:d(-104),le:d(-132),ra:d(-152),re:d(-42),ll:d(50),lk:d(30),rl:d(-52),rk:d(38),hipBob:-4,shPull:10};
      return {chest:d(11),neck:d(-1),head:d(2),la:d(-110),le:d(-160),ra:d(-100),re:d(-150),ll:d(30),lk:d(22),rl:d(-34),rk:d(26),hipBob:-1};
    }
    if (style === 'rush') return {chest:d(5),neck:d(1),head:d(2),la:d(-92),le:d(-82),ra:d(-68),re:d(-108),ll:d(102),lk:d(-70),rl:d(-20),rk:d(20),hipBob:-1};
    if (style === 'flash') return {chest:d(5),neck:d(1),head:d(1),la:d(-82),le:d(-66),ra:d(-68),re:d(-102),ll:d(72),lk:d(-82),rl:d(-22),rk:d(20),hipBob:-1};
    if (style === 'quake') return {chest:d(14),neck:d(-3),head:d(5),la:d(-110),le:d(-56),ra:d(-56),re:d(-64),ll:d(128),lk:d(-112),rl:d(-20),rk:d(24),hipBob:-2};
    if (style === 'ward' && linked) return {chest:d(16),neck:d(-4),head:d(4),la:d(-140),le:d(-66),ra:d(-118),re:d(-62),ll:d(122),lk:d(-98),rl:d(-42),rk:d(34),hipBob:-5,shPull:9};
    if (style === 'ward') return {chest:d(-9),neck:d(2),head:d(1),la:d(-136),le:d(-66),ra:d(-122),re:d(-58),ll:d(104),lk:d(-82),rl:d(-28),rk:d(26),hipBob:-2};
    return {chest:d(10), neck:d(-2), head:d(3),
      la:d(-92), le:d(-82), ra:d(-68), re:d(-108),
      ll:d(115), lk:d(-105), rl:d(-16), rk:d(20), hipBob:-2};
  }
  static kickStrike(profile = null, linked = false) {
    const d = Pose.deg;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      // Plant the feet and rotate through a two-hand staff sweep; the active
      // weapon segment is derived from these grip points in weaponGeometry().
      if (linked) return Pose.staffGrip(-25,[-84,18,-30,-130],[50,26,-54,34],-4);
      return Pose.staffGrip(-18,[-95,10,-35,-115],[36,22,-38,24],-2);
    }
    if (profile?.weapon === 'blade') {
      if (linked) return {chest:d(-27),neck:d(4),head:d(-2),la:d(-72),le:d(-108),ra:d(-116),re:d(-42),ll:d(50),lk:d(28),rl:d(-56),rk:d(40),hipBob:-5};
      return {chest:d(-16),neck:d(-2),head:d(1),la:d(-60),le:d(-120),ra:d(-90),re:d(-60),ll:d(34),lk:d(22),rl:d(-36),rk:d(28),hipBob:-2};
    }
    if (style === 'rush') return {chest:d(5),neck:d(-1),head:d(2),la:d(-92),le:d(-82),ra:d(-68),re:d(-108),ll:d(105),lk:d(-8),rl:d(-18),rk:d(20),hipBob:0};
    if (style === 'flash') return {chest:d(10),neck:d(-1),head:d(1),la:d(-86),le:d(-64),ra:d(-62),re:d(-98),ll:d(78),lk:d(-18),rl:d(-18),rk:d(16),hipBob:0};
    if (style === 'quake') return {chest:d(20),neck:d(-4),head:d(5),la:d(-112),le:d(-56),ra:d(-56),re:d(-64),ll:d(130),lk:d(-12),rl:d(-22),rk:d(24),hipBob:0};
    if (style === 'ward' && linked) return {chest:d(-16),neck:d(3),head:d(2),la:d(-130),le:d(-62),ra:d(-34),re:d(-24),ll:d(116),lk:d(-2),rl:d(-50),rk:d(42),hipBob:-4,shPull:0};
    if (style === 'ward') return {chest:d(2),neck:d(1),head:d(1),la:d(-136),le:d(-66),ra:d(-126),re:d(-48),ll:d(78),lk:d(-8),rl:d(-28),rk:d(26),hipBob:0};
    // Turn the hip through and extend the chambered shin across at waist height.
    return {chest:d(16), neck:d(-2), head:d(3),
      la:d(-92), le:d(-82), ra:d(-68), re:d(-108),
      ll:d(110), lk:d(-20), rl:d(-18), rk:d(22), hipBob:0};
  }
  static kickRec(profile = null, linked = false) {
    const d = Pose.deg;
    const idle = Pose.idle(profile);
    if (profile?.weapon === 'staff' && linked) return Pose.staffGrip(-7,[-112,-26,18,50],[48,30,-46,30],-2);
    if (profile?.weapon === 'blade' && linked) return {chest:d(-8),neck:d(2),head:d(1),la:d(-120),le:d(74),ra:d(-94),re:d(-58),ll:d(42),lk:d(28),rl:d(-42),rk:d(32),hipBob:-2};
    if (profile?.style === 'ward' && linked) return {...idle,chest:idle.chest + Pose.deg(9),head:idle.head + Pose.deg(2),la:Pose.deg(-138),le:Pose.deg(-68),ra:Pose.deg(-112),re:Pose.deg(-54),ll:Pose.deg(56),lk:Pose.deg(34),rl:Pose.deg(-42),rk:Pose.deg(32),hipBob:-2};
    return idle;
  }
  static specialWind(profile = null, comboFinisher = false) {
    const d = Pose.deg;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      if (comboFinisher) return Pose.staffGrip(21,[-150,-34,-104,-42],[64,36,-62,40],-5);
      return Pose.staffGrip(-10,[-126,-26,18,48],[38,22,-40,22],0);
    }
    if (profile?.weapon === 'blade') {
      if (comboFinisher) return {chest:d(24),neck:d(-5),head:d(4),la:d(-118),le:d(-146),ra:d(-160),re:d(-42),ll:d(62),lk:d(38),rl:d(-64),rk:d(44),hipBob:-5,shPull:13};
      return {chest:d(-12),neck:d(2),head:d(1),la:d(-48),le:d(-30),ra:d(-150),re:d(-28),ll:d(34),lk:d(22),rl:d(-40),rk:d(28),hipBob:0};
    }
    if (style === 'flame') return {chest:d(17),neck:d(-3),head:d(3),la:d(-110),le:d(-100),ra:d(28),re:d(150),ll:d(115),lk:d(-104),rl:d(-24),rk:d(20),hipBob:-2};
    if (style === 'flash') return {chest:d(8),neck:d(1),head:d(1),la:d(-84),le:d(-72),ra:d(-36),re:d(112),ll:d(68),lk:d(-76),rl:d(-24),rk:d(20),hipBob:0};
    if (style === 'quake') return {chest:d(22),neck:d(-6),head:d(7),la:d(25),le:d(30),ra:d(-110),re:d(-65),ll:d(130),lk:d(-100),rl:d(-24),rk:d(24),hipBob:-3};
    if (style === 'ward' && comboFinisher) return {chest:d(23),neck:d(-5),head:d(5),la:d(-142),le:d(-76),ra:d(52),re:d(126),ll:d(52),lk:d(34),rl:d(-58),rk:d(40),hipBob:-5,shPull:12};
    if (style === 'ward') return {chest:d(-9),neck:d(2),head:d(1),la:d(-140),le:d(-68),ra:d(-112),re:d(-68),ll:d(30),lk:d(24),rl:d(-28),rk:d(26),hipBob:0};
    return {chest:d(10), neck:d(-4), head:d(-6),
      la:d(-90), le:d(-50), ra:d(30), re:d(-100),
      ll:d(-40), lk:d(95), rl:d(20), rk:d(25), hipBob:0};
  }
  static specialDash(profile = null, comboFinisher = false) {
    const d = Pose.deg;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      if (comboFinisher) return Pose.staffGrip(-29,[-74,18,-20,-136],[74,-36,-62,40],-5);
      return Pose.staffGrip(-20,[-140,-18,-8,48],[76,-46,-48,34],0);
    }
    if (profile?.weapon === 'blade') {
      if (comboFinisher) return {chest:d(-34),neck:d(5),head:d(3),la:d(-86),le:d(-112),ra:d(-126),re:d(18),ll:d(74),lk:d(-36),rl:d(-66),rk:d(44),hipBob:-6};
      return {chest:d(-18),neck:d(2),head:0,la:d(-38),le:d(-22),ra:d(-86),re:d(-12),ll:d(78),lk:d(-44),rl:d(-48),rk:d(32),hipBob:0};
    }
    if (style === 'flame') return {chest:d(22),neck:d(-5),head:d(-3),la:d(80),le:d(32),ra:d(-90),re:d(60),ll:d(125),lk:d(-15),rl:d(-28),rk:d(36),hipBob:0};
    if (style === 'flash') return {chest:d(15),neck:d(1),head:d(0),la:d(68),le:d(24),ra:d(-38),re:d(102),ll:d(86),lk:d(-14),rl:d(-34),rk:d(28),hipBob:0};
    if (style === 'quake') return {chest:d(28),neck:d(-8),head:d(8),la:d(35),le:d(40),ra:d(-105),re:d(-62),ll:d(145),lk:d(-14),rl:d(-18),rk:d(25),hipBob:0};
    if (style === 'ward' && comboFinisher) return {chest:d(-32),neck:d(5),head:d(3),la:d(-138),le:d(-66),ra:d(-102),re:d(72),ll:d(54),lk:d(30),rl:d(-62),rk:d(42),hipBob:-5};
    if (style === 'ward') return {chest:d(-10),neck:d(1),head:d(1),la:d(-138),le:d(-64),ra:d(-92),re:d(-8),ll:d(30),lk:d(22),rl:d(-28),rk:d(26),hipBob:0};
    return {chest:d(18), neck:d(-6), head:d(-4),
      la:d(100), le:d(35), ra:d(-70), re:d(40),
      ll:d(110), lk:d(5), rl:d(-35), rk:d(40), hipBob:0};
  }
  static bladeSuperVertical(profile = null) {
    const d = Pose.deg;
    return {chest:d(16),neck:d(-2),head:d(-4),la:d(-118),le:d(-42),ra:d(-138),re:d(-26),ll:d(22),lk:d(18),rl:d(-24),rk:d(22),hipBob:0,shPull:2};
  }
  /** Strike 2 ready: blade raised over the rear shoulder (hasso), torso coiled back. */
  static bladeSuperDiagonalReady(profile = null) {
    const d = Pose.deg;
    return {chest:d(-8),neck:d(2),head:d(1),la:d(-152),le:d(-38),ra:d(-144),re:d(-46),ll:d(28),lk:d(20),rl:d(-30),rk:d(24),hipBob:-1,shPull:5};
  }
  /** Strike 2 finish: kesa-giri follow-through, arms extended low-forward, deep lunge. */
  static bladeSuperDiagonal(profile = null) {
    const d = Pose.deg;
    return {chest:d(24),neck:d(-4),head:d(-4),la:d(-62),le:d(-10),ra:d(-52),re:d(-16),ll:d(44),lk:d(18),rl:d(-42),rk:d(34),hipBob:-5,shPull:0};
  }
  static bladeSuperPause(profile = null) {
    const d = Pose.deg;
    return {chest:d(4),neck:d(-1),head:d(-2),la:d(-98),le:d(-70),ra:d(-124),re:d(-48),ll:d(18),lk:d(16),rl:d(-18),rk:d(18),hipBob:0,shPull:4};
  }
  static specialFinish(profile = null, comboFinisher = false, face = 1) {
    if (profile?.weapon === 'staff') return Pose.staffSuperFinish(profile, face);
    if (profile?.weapon === 'blade') return Pose.specialDash(profile, comboFinisher);
    if (profile?.style === 'ward') return Pose.karateSuperKickHigh(profile);
    return Pose.specialDash(profile, comboFinisher);
  }
  /** Karate super hit 1: lunge punch — rear fist drives straight forward at shoulder height. */
  static karateSuperPunch(profile = null) {
    const d = Pose.deg;
    return {chest:d(-26),neck:d(3),head:d(2),la:d(-136),le:d(-68),ra:d(-104),re:d(-6),ll:d(58),lk:d(32),rl:d(-62),rk:d(40),hipBob:-4,shPull:0};
  }
  /** Karate super hit 2: snap front kick — kicking foot snaps out at hip height. */
  static karateSuperKickMid(profile = null) {
    const d = Pose.deg;
    return {chest:d(6),neck:d(1),head:d(1),la:d(-136),le:d(-66),ra:d(-120),re:d(-50),ll:d(80),lk:d(-14),rl:d(-24),rk:d(24),hipBob:0,shPull:0};
  }
  /** Karate super hit 3: spin heel high kick — kicking foot reaches head height. */
  static karateSuperKickHigh(profile = null) {
    const d = Pose.deg;
    return {chest:d(-14),neck:d(2),head:d(1),la:d(-150),le:d(-70),ra:d(-40),re:d(-30),ll:d(158),lk:d(-10),rl:d(-20),rk:d(22),hipBob:0,shPull:0};
  }
  static block(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(-10,[-132,-22,18,48],[38,20,-40,22],0);
    if (profile?.weapon === 'blade') return {chest:d(-8),neck:d(2),head:d(1),la:d(-120),le:d(80),ra:d(-60),re:d(-80),shPull:0,ll:d(34),lk:d(24),rl:d(-34),rk:d(26),hipBob:0};
    if (profile?.style === 'flame') return {chest:d(-1),neck:d(1),head:d(1),la:d(-100),le:d(-112),ra:d(-62),re:d(-104),shPull:3,ll:d(22),lk:d(12),rl:d(-20),rk:d(22),hipBob:0};
    if (profile?.style === 'flash') return {chest:d(-7),neck:d(2),head:d(1),la:d(-78),le:d(-62),ra:d(-66),re:d(-98),shPull:0,ll:d(16),lk:d(14),rl:d(-18),rk:d(18),hipBob:0};
    if (profile?.style === 'quake') return {chest:d(7),neck:d(-2),head:d(4),la:d(-108),le:d(-62),ra:d(-56),re:d(-68),shPull:0,ll:d(24),lk:d(18),rl:d(-20),rk:d(24),hipBob:0};
    if (profile?.style === 'ward') return {chest:d(-6),neck:d(2),head:d(1),la:d(-136),le:d(-66),ra:d(-112),re:d(-68),shPull:0,ll:d(28),lk:d(22),rl:d(-28),rk:d(26),hipBob:0};
    // Tight high guard under fv=-face, matching the boxing idle stance.
    return {chest:d(-2), neck:d(1), head:d(3),
      la:d(-88), le:d(-112), ra:d(-62), re:d(-120), shPull:5,
      ll:d(14), lk:d(22), rl:d(-16), rk:d(20), hipBob:0};
  }
  static hit(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(18,[-124,-18,12,56],[28,36,-34,40],0);
    // Chest/neck/head signs flipped for fv so torso recoils AWAY (~15°); arms stay toward foe
    return {chest:d(15), neck:d(8), head:d(15),
      la:d(-100), le:d(-40), ra:d(-90), re:d(-35),
      ll:d(22), lk:d(28), rl:d(-30), rk:d(35), hipBob:0};
  }
  static ragdoll(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(46,[-98,-40,30,74],[48,54,-56,62],0);
    return {chest:d(8),neck:d(4),head:d(8),la:d(-25),le:d(-82),ra:d(18),re:d(76),ll:d(26),lk:d(38),rl:d(-34),rk:d(48),hipBob:0};
  }
  static koSprawl(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(58,[-92,-20,24,38],[76,26,-82,38],8);
    // Fall away from attacker under fv; arms ~horizontal toward foe (compensate lean)
    return {chest:d(55), neck:d(20), head:d(25),
      la:d(-95), le:d(-20), ra:d(-95), re:d(-20),
      ll:d(70), lk:d(20), rl:d(-80), rk:d(30), hipBob:8};
  }
  /** Place both hands along a rigid staff axis with a two-link arm solve. */
  static staffSuperGrip(profile, angle, face = 1, chest = -6, legs = [32,18,-32,18], hipBob = 0) {
    const limb = 18 * 1.2, gripHalf = 14, facing = face || 1, fv = -facing;
    const axisX = Math.cos(angle) * facing, axisY = Math.sin(angle);
    const solve = (x, y, bend) => {
      const distance = Math.hypot(x, y);
      const elbow = bend * Math.acos(Math.max(-1, Math.min(1, (distance * distance - 2 * limb * limb) / (2 * limb * limb))));
      const shoulder = Math.atan2(x, y) - Math.atan2(Math.sin(elbow), 1 + Math.cos(elbow));
      return [shoulder / fv * 180 / Math.PI, elbow / fv * 180 / Math.PI];
    };
    const left = solve(-axisX * gripHalf, -axisY * gripHalf, -1);
    const right = solve(axisX * gripHalf, axisY * gripHalf, 1);
    return Pose.staffGrip(chest, [left[0], left[1], right[0], right[1]], legs, hipBob);
  }
  /** Dragon Staff Spin poses: windup, two rotating sweeps, slam, and finish. */
  static staffSuperWind(profile = null) {
    return Pose.staffGrip(-6,[-128,-30,16,52],[40,22,-42,22],0);
  }
  static staffSuperSpin(profile = null, angle = 0, face = 1, secondSweep = false) {
    return Pose.staffSuperGrip(profile, angle, face, secondSweep ? 5 : -8,
      secondSweep ? [48,22,-48,22] : [40,20,-40,20], secondSweep ? -4 : -2);
  }
  static staffSuperSlam(profile = null, face = 1) {
    return Pose.staffSuperGrip(profile, Math.PI / 3, face, 18, [46,22,-46,22], -4);
  }
  static staffSuperFinish(profile = null, face = 1) {
    return Pose.staffSuperGrip(profile, -Math.PI / 5, face, -4, [28,14,-28,14], 0);
  }
}

