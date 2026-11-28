import { BossHardness } from './config.js';
import { Fighter } from './fighter.js';

export const Moves = {
  punch: {
    su: 9, ac: 3, re: 14,          // x1.3 pacing pass (was 7/3/11)
    dmg: 5, kb: 160, stun: 10,
    chainMax: 3,
    chainDmg: [5, 7, 9, 11],       // confirmed links reward follow-up hits; Karate adds a 4th (Rising Palm)
    chainKb: [160, 220, 380, 420],
    chainStun: [10, 15, 24, 24],
    chainSu: [4, 4, 7], chainAc: [3, 3, 4], chainRe: [10, 10, 20],
    chainWindow: 10,               // frames into recovery when a follow-up is allowed
    reach: 95,
  },
  kick: {
    su: 14, ac: 5, re: 23,         // x1.3 pacing pass (was 11/5/18)
    dmg: 15, kb: 260, stun: 22,    // Heavy strike: high payoff, with a hit-confirm window for a follow-up string
    chainWindow: 18,
    reach: 175,
  },
  special: {
    su: 14, ac: 10, re: 18,
    dmg: 22, chip: 6, kb: 390, stun: 22,
  },
  staffPunch: {
    su: 17, ac: 4, re: 29,
    dmg: 6, kb: 160, stun: 10,
    chainMax: 2,
    chainDmg: [6, 8],
    chainKb: [160, 220],
    chainStun: [10, 15],
    chainSu: [14], chainAc: [4], chainRe: [26],
    chainWindow: 10,
    reach: 130, front: 80,
  },
  staffKick: {
    su: 23, ac: 6, re: 36,
    dmg: 23, kb: 260, stun: 22,
    chainWindow: 18,
    reach: 210, front: 180,
    knockdown: true,
  },
  staffSpecial: {
    su: 16, ac: 19, re: 22,
    dmg: 22, chip: 6, kb: 390, stun: 22,
    hitCount: 3,
    hitDurations: [4, 4, 5],
    hitDelays: [0, 7, 14],
    hitDamages: [24, 24, 38],
    reach: 210, spinFront: 130, slamFront: 180,
    slamGroundCrackReach: 52,
  },
  // Boss normals — base values before BossHardness / difficulty multipliers.
  // Pacing pass (2026-11-15): boss normals startup/recovery x1.3 (active unchanged); signatures and tells unchanged.
  bossBlockJab:   { su: 8, ac: 3, re: 13, dmg: 5,  kb: 120, stun: 8,  reach: 95 },
  bossBlockHook:  { su: 12, ac: 4, re: 17, dmg: 9,  kb: 180, stun: 12, reach: 95 },
  bossDockLash:   { su: 10, ac: 4, re: 18, dmg: 10, kb: 140, stun: 10, reach: 230 },
  bossDockSwing:  { su: 14, ac: 5, re: 21, dmg: 12, kb: 200, stun: 14, reach: 230 },
  bossMarketChop: { su: 8, ac: 3, re: 13, dmg: 6,  kb: 130, stun: 8,  reach: 100 },
  bossMarketCross:{ su: 12, ac: 4, re: 16, dmg: 8,  kb: 160, stun: 11, reach: 100 },
  bossIronOverhead:{ su: 18, ac: 5, re: 26, dmg: 16, kb: 260, stun: 18, reach: 150, armored: true },
  bossIronSweep:  { su: 13, ac: 4, re: 20, dmg: 12, kb: 220, stun: 14, reach: 150 },
  bossTunnelBaton:{ su: 9, ac: 3, re: 14, dmg: 8,  kb: 140, stun: 10, reach: 110 },
  bossTunnelBash: { su: 14, ac: 4, re: 20, dmg: 10, kb: 190, stun: 13, reach: 110 },
  // Boss B2 (PR A) normals: base frames x1.3 startup/recovery like the pacing pass (bases in comments).
  bossSniperStock:{ su: 9, ac: 3, re: 14, dmg: 8,  kb: 140, stun: 10, reach: 100 },  // base 7/3/11
  bossSniperKick: { su: 13, ac: 4, re: 20, dmg: 10, kb: 200, stun: 12, reach: 100 }, // base 10/4/15
  bossKageThrust: { su: 12, ac: 4, re: 18, dmg: 10, kb: 160, stun: 11, reach: 200 }, // base 9/4/14
  bossKageWheel:  { su: 16, ac: 5, re: 21, dmg: 12, kb: 220, stun: 13, reach: 200 }, // base 12/5/16
  bossBreakerSwing:{ su: 21, ac: 5, re: 29, dmg: 18, kb: 280, stun: 18, reach: 210 }, // base 16/5/22 (slow)
  bossBreakerShove:{ su: 13, ac: 4, re: 20, dmg: 10, kb: 260, stun: 12, reach: 210 }, // base 10/4/15
  // Boss B2 (PR B) normals, same x1.3 convention. Director baton hits stun 0.3 s (18 f).
  bossDirectorJab: { su: 9, ac: 3, re: 14, dmg: 8,  kb: 140, stun: 18, reach: 115 }, // base 7/3/11
  bossDirectorSweep:{ su: 13, ac: 4, re: 20, dmg: 10, kb: 190, stun: 18, reach: 115 }, // base 10/4/15
  bossChiefSlash:  { su: 9, ac: 3, re: 14, dmg: 9,  kb: 150, stun: 10, reach: 110 }, // phase 1 twin blades, base 7/3/11
  bossChiefCross:  { su: 12, ac: 4, re: 16, dmg: 11, kb: 180, stun: 12, reach: 110 }, // base 9/4/12
  bossChiefSmash:  { su: 18, ac: 5, re: 26, dmg: 16, kb: 260, stun: 18, reach: 150, armored: true }, // phase 2 hammer, base 14/5/20
  bossChiefSweep:  { su: 13, ac: 4, re: 20, dmg: 12, kb: 220, stun: 14, reach: 150 }, // base 10/4/15
  bossChiefJab:    { su: 8, ac: 3, re: 13, dmg: 8,  kb: 150, stun: 10, reach: 90 },  // phase 3 gauntlets, base 6/3/10
  bossChiefHook:   { su: 12, ac: 4, re: 17, dmg: 12, kb: 220, stun: 13, reach: 90 },  // base 9/4/13
  // Boss signatures — base values before BossHardness / difficulty multipliers.
  bossBlockParty:  { su: 10, ac: 9,  re: 16, dmg: 24, kb: 200, stun: 14, reach: 95,  hitCount: 3 },
  bossDockHaulIn:  { su: 14, ac: 24, re: 16, dmg: 14, kb: 240, stun: 16, reach: 230, hitCount: 1 },
  bossMarketToss:  { su: 12, ac: 60, re: 18, dmg: 28, kb: 180, stun: 12, reach: 100, hitCount: 4 },
  bossForgeQuake:  { su: 16, ac: 18, re: 20, dmg: 16, kb: 260, stun: 18, reach: 150, hitCount: 0 },
  bossShieldCharge:{ su: 18, ac: 20, re: 18, dmg: 14, kb: 240, stun: 16, reach: 110, hitCount: 1 },
  bossLaserLock:   { su: 36, ac: 1,  re: 24, dmg: 18, kb: 160, stun: 12, reach: 100, hitCount: 0 }, // ac 31 in phase 3 (3 bolts 15 f apart)
  bossShadowStep:  { su: 30, ac: 8,  re: 20, dmg: 16, kb: 220, stun: 14, reach: 200, hitCount: 1 },
  bossRoadblock:   { su: 36, ac: 39, re: 30, dmg: 20, kb: 300, stun: 18, reach: 210, hitCount: 1 }, // throw f1, charge f20-39
  bossLiveBroadcast:{ su: 30, ac: 43, re: 24, dmg: 14, kb: 200, stun: 18, reach: 115, hitCount: 0 }, // glitch 0.5 s, mark f1, lightning f43 (0.7 s later)
  bossColiseumFinale:{ su: 30, ac: 35, re: 30, dmg: 70, kb: 300, stun: 18, reach: 150, hitCount: 5 }, // 10/10/12/14/24, one hit per 7 f, last knocks down
};

/** Resolved attack snapshot used by Fighter (reads Moves). */
export class Atk {
  static staffTable(kind) { return { punch: 'staffPunch', kick: 'staffKick', special: 'staffSpecial' }[kind]; }
  static of(kind, chain = 0, chainMax = null, profile = null) {
    const table = profile?.weapon === 'staff' ? Atk.staffTable(kind) : kind;
    const m = Moves[table] || Moves[kind];
    if (!m) return null;
    if (kind === 'punch') {
      const max = chainMax || m.chainMax;
      const n = Math.max(0, Math.min(chain, max - 1));
      const follow = n > 0;
      return {
        su: follow ? m.chainSu[n - 1] : m.su,
        ac: follow ? m.chainAc[n - 1] : m.ac,
        re: follow ? m.chainRe[n - 1] : m.re,
        dmg: m.chainDmg[n],
        kb: m.chainKb[n], stun: m.chainStun[n],
        chain: n, kind: 'punch',
        chainMax: max, chainWindow: m.chainWindow,
        reach: m.reach,
      };
    }
    if (kind === 'kick') {
      return {
        su: m.su, ac: m.ac, re: m.re,
        dmg: m.dmg, kb: m.kb, stun: m.stun,
        kind: 'kick', chainWindow: m.chainWindow,
        reach: m.reach, knockdown: !!m.knockdown,
      };
    }
    return {
      su: m.su, ac: m.ac, re: m.re,
      dmg: m.dmg, chip: m.chip || 0, kb: m.kb, stun: m.stun,
      kind: 'special',
      reach: m.reach,
    };
  }
  // Back-compat mirrors for any Atk.punch.su style reads.
  static get punch() { return Atk.of('punch', 0); }
  static get kick() { return Atk.of('kick'); }
  static get special() { return Atk.of('special'); }
}

