// Karate body drawn on the live pose bones. Classic script so game.js can call it.
var KarateSprite = (function () {
  var CLOTH = '#243049';
  var CLOTH_EDGE = '#0C1018';
  var SKIN = '#E6B089';
  var HAIR = '#16181F';
  var SHOE = '#F4F7FB';
  var STRIPE = '#F4F7FB';

  function segment(ctx, a, b, width, fill, edge) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = edge;
    ctx.lineWidth = width + 2.4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function band(ctx, a, b, t, color, span) {
    var x = a.x + (b.x - a.x) * t;
    var y = a.y + (b.y - a.y) * t;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len * span;
    var ny = dx / len * span;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(x - nx, y - ny);
    ctx.lineTo(x + nx, y + ny);
    ctx.stroke();
  }

  function limb(ctx, root, joint, tip, width, fill, edge, shoe) {
    segment(ctx, root, joint, width, fill, edge);
    segment(ctx, joint, tip, width * 0.92, fill, edge);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(joint.x, joint.y, width * 0.48, 0, Math.PI * 2);
    ctx.fill();
    if (shoe) {
      var sx = tip.x - joint.x;
      var sy = tip.y - joint.y;
      var sl = Math.hypot(sx, sy) || 1;
      var toeX = tip.x + sx / sl * 5;
      var toeY = tip.y + sy / sl * 3;
      ctx.fillStyle = shoe === true ? SHOE : shoe;
      ctx.beginPath();
      ctx.ellipse(toeX, toeY, 8, 4.2, Math.atan2(sy, sx), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function torso(ctx, b, fill, edge) {
    var dx = b.chest.x - b.hip.x;
    var dy = b.chest.y - b.hip.y;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len;
    var ny = dx / len;
    var hipW = 11;
    var chestW = 13.5;
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.moveTo(b.hip.x + nx * (hipW + 1.6), b.hip.y + ny * (hipW + 1.6));
    ctx.lineTo(b.chest.x + nx * (chestW + 1.6), b.chest.y + ny * (chestW + 1.6));
    ctx.lineTo(b.neck.x + nx * 5, b.neck.y + ny * 5);
    ctx.lineTo(b.neck.x - nx * 5, b.neck.y - ny * 5);
    ctx.lineTo(b.chest.x - nx * (chestW + 1.6), b.chest.y - ny * (chestW + 1.6));
    ctx.lineTo(b.hip.x - nx * (hipW + 1.6), b.hip.y - ny * (hipW + 1.6));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(b.hip.x + nx * hipW, b.hip.y + ny * hipW);
    ctx.lineTo(b.chest.x + nx * chestW, b.chest.y + ny * chestW);
    ctx.lineTo(b.neck.x + nx * 4, b.neck.y + ny * 4);
    ctx.lineTo(b.neck.x - nx * 4, b.neck.y - ny * 4);
    ctx.lineTo(b.chest.x - nx * chestW, b.chest.y - ny * chestW);
    ctx.lineTo(b.hip.x - nx * hipW, b.hip.y - ny * hipW);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.hip.x - nx * 7, b.hip.y - ny * 7);
    ctx.lineTo(b.hip.x + nx * 7, b.hip.y + ny * 7);
    ctx.stroke();
  }

  function head(ctx, b, face, skin, hair) {
    var hr = b.hr;
    ctx.fillStyle = '#0C1018';
    ctx.beginPath();
    ctx.arc(b.head.x, b.head.y, hr + 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(b.head.x, b.head.y, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.head.x, b.head.y, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = hair;
    ctx.fillRect(b.head.x - hr, b.head.y - hr - 1, hr * 2, hr * 0.52);
    ctx.fillRect(b.head.x - face * hr * 0.95, b.head.y - hr * 0.15, hr * 0.55, hr * 0.7);
    ctx.restore();
    if (skin !== '#FFFFFF') {
      ctx.fillStyle = '#1A120E';
      var eyeY = b.head.y + hr * 0.05;
      ctx.beginPath();
      ctx.arc(b.head.x + face * hr * 0.28, eyeY, 1.35, 0, Math.PI * 2);
      ctx.arc(b.head.x + face * hr * 0.62, eyeY, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function depth(face, joint, tip) {
    return ((joint.x + tip.x) * 0.5) * face;
  }

  return {
    ready: true,
    draw: function (ctx, fighter, b, white) {
      if (!b || !b.laJ || !b.llJ) return;
      var face = fighter.face || 1;
      var cloth = white ? '#FFFFFF' : CLOTH;
      var edge = white ? '#D8D8D8' : CLOTH_EDGE;
      var skin = white ? '#FFFFFF' : SKIN;
      var hair = white ? '#FFFFFF' : HAIR;
      var shoe = white ? '#FFFFFF' : SHOE;
      var stripe = white ? '#FFFFFF' : STRIPE;
      var legs = [
        { z: depth(face, b.llJ, b.ll), root: b.hip, joint: b.llJ, tip: b.ll },
        { z: depth(face, b.rlJ, b.rl), root: b.hip, joint: b.rlJ, tip: b.rl }
      ].sort(function (p, q) { return p.z - q.z; });
      var arms = [
        { z: depth(face, b.laJ, b.la), root: b.shL || b.sh, joint: b.laJ, tip: b.la },
        { z: depth(face, b.raJ, b.ra), root: b.shR || b.sh, joint: b.raJ, tip: b.ra }
      ].sort(function (p, q) { return p.z - q.z; });

      ctx.save();
      limb(ctx, legs[0].root, legs[0].joint, legs[0].tip, 9.2, cloth, edge, shoe);
      limb(ctx, arms[0].root, arms[0].joint, arms[0].tip, 7.4, cloth, edge, false);
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(arms[0].tip.x, arms[0].tip.y, 4.6, 0, Math.PI * 2);
      ctx.fill();
      torso(ctx, b, cloth, edge);
      limb(ctx, legs[1].root, legs[1].joint, legs[1].tip, 9.2, cloth, edge, shoe);
      limb(ctx, arms[1].root, arms[1].joint, arms[1].tip, 7.4, cloth, edge, false);
      band(ctx, arms[1].root, arms[1].joint, 0.62, stripe, 4.2);
      band(ctx, arms[1].root, arms[1].joint, 0.78, stripe, 4.2);
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(arms[1].tip.x, arms[1].tip.y, 5, 0, Math.PI * 2);
      ctx.fill();
      head(ctx, b, face, skin, hair);
      ctx.restore();
    }
  };
})();
