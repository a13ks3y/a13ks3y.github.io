let pipe; 
let wavePhase = 0;
let paused = false;
let manifoldY = 72;

const GAS_R = 8.314; // J/(mol·K)
const GRAV_g = 9.81; // m/s^2

let manifold = { volume_m3: 0.02, n: 0, pressurePa: 101325 };
let totals = { pumpedMoles: 0, last_nOut: 0, last_nIn: 0, avg_nOut: 0 };

const cfg = {
  scalePxPerM: 120,
  waterlinePercent: 62,
  wave: { A1: 22, A2: 10, lambda1Factor: 0.8, lambda2Factor: 0.5, speed1: 1.0, speed2: 1.6, phaseSpeed: 0.016 },
  physics: {
    pipeID_mm: 100,
    manifoldVolL: 20,
    tempC: 20,
    ambientAtm: 1.0,
    rhoWater: 1000,
    buoyK_mps2_per_m: 3.0,
    waterVelK_mps2_per_mps: 2.5,
    pistonK_mps_per_MPa: 0.20, // piston speed per MPa pressure difference
    damping: 0.8,
    condOut: 2.0,
    condIn: 2.0,
  },
  visual: {
    pistonThicknessPct: 50,
  }
};

function setup() {
  createCanvas(windowWidth, windowHeight);
  // Create pipe before binding UI to avoid calling methods on undefined
  pipe = new Pipe(width * 0.5, computePipeWidthPx());
  initManifold();
  bindUI();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function keyPressed() { if (keyCode === 32) paused = !paused; }

function draw() {
  if (!paused) wavePhase += cfg.wave.phaseSpeed;
  background(10);

  drawWater();

  pipe.update();
  updateManifoldPressure();
  drawManifold();

  pipe.draw();

  drawReadout();
}

function getWaveY(x) {
  const k1 = TWO_PI / max(80, width * cfg.wave.lambda1Factor);
  const k2 = TWO_PI / max(60, width * cfg.wave.lambda2Factor);
  return waterlineY() + cfg.wave.A1 * sin(k1 * x - wavePhase * cfg.wave.speed1)
                      + cfg.wave.A2 * sin(k2 * x + wavePhase * cfg.wave.speed2);
}

function waterlineY() { return height * (cfg.waterlinePercent / 100); }

function drawWater() {
  noStroke();
  fill(20, 80, 160, 140);
  beginShape();
  const step = 8;
  for (let x = 0; x <= width; x += step) vertex(x, getWaveY(x));
  vertex(width, height);
  vertex(0, height);
  endShape(CLOSE);

  noFill();
  stroke(180, 220, 255);
  strokeWeight(3);
  strokeCap(ROUND);
  beginShape();
  for (let x = 0; x <= width; x += step) vertex(x, getWaveY(x));
  endShape();
}

function drawManifold() {
  stroke(180);
  strokeWeight(10);
  line(20, manifoldY, width - 20, manifoldY);

  const Pamb = atmToPa(cfg.physics.ambientAtm);
  const gX = width - 220;
  const gY = 16;
  const gW = 190;
  const gH = 34;
  noStroke();
  fill(30);
  rect(gX, gY, gW, gH, 6);
  const ratio = constrain(manifold.pressurePa / Pamb, 0, 3.0);
  const lvlW = ratio / 3.0 * (gW - 6);
  fill(255, 210, 60);
  rect(gX + 3, gY + 3, lvlW, gH - 6, 4);
  fill(200);
  textAlign(LEFT, CENTER);
  textSize(12);
  text('Pressure: ' + nf(manifold.pressurePa, 0, 0) + ' Pa', gX, gY + gH + 14);
}

class Pipe {
  constructor(x, w) {
    this.x = x;
    this.w = w;
    this.top = manifoldY + 10;
    this.bottom = height - 24;
    this.pistonY = (this.top + this.bottom) / 2;
    this.vy = 0; // m/s
    this.prevWaterY = getWaveY(this.x);
    this.n = 0;
    this.pressurePa = atmToPa(cfg.physics.ambientAtm);
    this.initGas();
    this.outOpen = false;
    this.inOpen = false;
  }

  initGas() {
    const V = this.currentVolumeM3();
    const T = cfg.physics.tempC + 273.15;
    const Pamb = atmToPa(cfg.physics.ambientAtm);
    this.n = (Pamb * V) / (GAS_R * T);
    this.pressurePa = Pamb;
  }

  currentVolumeM3() {
    const scale = cfg.scalePxPerM;
    const h_m = max(0, (this.pistonY - this.top) / scale);
    const d_m = cfg.physics.pipeID_mm / 1000.0;
    const area = Math.PI * (d_m * 0.5) * (d_m * 0.5);
    return area * h_m;
  }

  externalPressurePa() {
    const Pamb = atmToPa(cfg.physics.ambientAtm);
    const depth_m = max(0, (this.pistonY - getWaveY(this.x)) / cfg.scalePxPerM);
    return Pamb + cfg.physics.rhoWater * GRAV_g * depth_m;
  }

  update() {
    this.top = manifoldY + 10;
    this.bottom = height - 24;

    const dt = deltaTime * 0.001;
    const T = cfg.physics.tempC + 273.15;
    const Pext = this.externalPressurePa();
    const V = this.currentVolumeM3();
    this.pressurePa = (this.n * GAS_R * T) / max(V, 1e-9);

    // Pressure-driven motion (compression -> move down, expansion -> move up)
    const dp = this.pressurePa - Pext; // Pa
    const dpMPa = dp / 1e6; // MPa
    const K = cfg.physics.pistonK_mps_per_MPa; // m/s per MPa (acts like acceleration gain)
    const damping = cfg.physics.damping;

    // Buoyancy coupling: pull piston toward wave height (floating behavior)
    const waterY = getWaveY(this.x);
    const disp_m = (waterY - this.pistonY) / cfg.scalePxPerM; // meters
    const a_buoy = cfg.physics.buoyK_mps2_per_m * disp_m; // m/s^2

    // Align velocity with surface vertical velocity to reduce lag
    const waterVel_mps = ((waterY - this.prevWaterY) / max(dt, 1e-6)) / cfg.scalePxPerM;
    this.prevWaterY = waterY;
    const a_align = cfg.physics.waterVelK_mps2_per_mps * (waterVel_mps - this.vy);

    // Update velocity (m/s) with clamps to avoid jitter
    let a_total = K * dpMPa + a_buoy + a_align - damping * this.vy;
    const aMax = 20; // m/s^2
    a_total = constrain(a_total, -aMax, aMax);
    this.vy += a_total * dt;
    const vMax = 3.0; // m/s
    this.vy = constrain(this.vy, -vMax, vMax);
    this.pistonY += this.vy * dt * cfg.scalePxPerM; // convert m/s to px/s

    this.pistonY = constrain(this.pistonY, this.top + 4, this.bottom - 4);

    // Update pressures after motion
    const V2 = this.currentVolumeM3();
    this.pressurePa = (this.n * GAS_R * T) / max(V2, 1e-9);

    // Valve flows
    const Pman = manifold.pressurePa;
    const Pamb = atmToPa(cfg.physics.ambientAtm);

    let nOut = 0;
    if (this.pressurePa > Pman) {
      const dpOut = this.pressurePa - Pman;
      nOut = (cfg.physics.condOut * dpOut * dt) / (GAS_R * T);
      nOut = constrain(nOut, 0, max(0, this.n));
      this.n -= nOut;
      manifold.n += nOut;
      totals.pumpedMoles += nOut;
    }

    let nIn = 0;
    if (Pamb > this.pressurePa) {
      const dpIn = Pamb - this.pressurePa;
      nIn = (cfg.physics.condIn * dpIn * dt) / (GAS_R * T);
      this.n += nIn;
    }

    this.outOpen = nOut > 0;
    this.inOpen = nIn > 0;
    totals.last_nOut = nOut / dt; // mol/s
    totals.last_nIn = nIn / dt;   // mol/s
    const a = Math.min(1, dt * 2); // ~0.5 s time constant
    totals.avg_nOut = totals.avg_nOut * (1 - a) + totals.last_nOut * a;
  }

  draw() {
    const x0 = this.x - this.w * 0.5;
    const x1 = this.x + this.w * 0.5;

    stroke(120);
    strokeWeight(10);
    line(this.x, manifoldY, this.x, this.top);

    stroke(180);
    strokeWeight(max(6, this.w * 0.28));
    line(this.x - this.w / 2, this.top, this.x - this.w / 2, this.bottom - 40);
    line(this.x + this.w / 2, this.top, this.x + this.w / 2, this.bottom - 40);

    noStroke();
    const pistonH = clampPct(cfg.visual.pistonThicknessPct) * this.w;
    const pistonW = this.w - 4;
    // Shadow
    fill(30, 30, 30, 80);
    rect(this.x - pistonW / 2 + 2, this.pistonY - pistonH / 2 + 2, pistonW, pistonH, 4);
    // Body
    fill(230);
    rect(this.x - pistonW / 2, this.pistonY - pistonH / 2, pistonW, pistonH, 4);
    // Highlight
    fill(255, 255, 255, 50);
    rect(this.x - pistonW / 2, this.pistonY - pistonH / 2, pistonW, pistonH * 0.35, 4);

    const valveSize = max(10, this.w * 0.5);
    const outValvY = this.top + 10;
    const inValvY = this.top + 26; // intake valve also at the top

    fill(this.outOpen ? color(255, 200, 0) : color(90));
    triangle(x1 + 6, outValvY, x1 + 6 + valveSize, outValvY - valveSize * 0.6, x1 + 6 + valveSize, outValvY + valveSize * 0.6);

    fill(this.inOpen ? color(120, 220, 255) : color(70, 110, 150));
    triangle(x0 - 6, inValvY, x0 - 6 - valveSize, inValvY - valveSize * 0.6, x0 - 6 - valveSize, inValvY + valveSize * 0.6);
  }
}

function drawReadout() {
  updateManifoldPressure();
  const Pamb = atmToPa(cfg.physics.ambientAtm);
  const T = cfg.physics.tempC + 273.15;
  const pumped_m3 = (totals.pumpedMoles * GAS_R * T) / Pamb;
  const pumped_L = pumped_m3 * 1000.0;
  const Q_m3_s = (totals.avg_nOut * GAS_R * T) / Pamb; // volumetric flow at ambient
  const Q_L_min = Q_m3_s * 1000.0 * 60.0;
  const read = document.getElementById('readout');
  if (!read) return;
  const pipeAtm = pipe.pressurePa / 101325;
  const manAtm = manifold.pressurePa / 101325;
  read.innerHTML = `<div>Pipe P: ${nf(pipe.pressurePa,0,0)} Pa (${nf(pipeAtm,1,2)} atm)</div>`+
                   `<div>Manifold P: ${nf(manifold.pressurePa,0,0)} Pa (${nf(manAtm,1,2)} atm)</div>`+
                   `<div>n_out: ${nf(totals.last_nOut,1,3)} mol/s, n_in: ${nf(totals.last_nIn,1,3)} mol/s</div>`+
                   `<div>Total pumped: ${nf(pumped_L,1,2)} L (ambient)</div>`+
                   `<div>Pumping speed: ${nf(Q_L_min,1,1)} L/min (ambient)</div>`;
}

function initManifold() {
  manifold.volume_m3 = litersToM3(cfg.physics.manifoldVolL);
  const Pamb = atmToPa(cfg.physics.ambientAtm);
  const T = cfg.physics.tempC + 273.15;
  manifold.n = (Pamb * manifold.volume_m3) / (GAS_R * T);
  manifold.pressurePa = Pamb;
}

function updateManifoldPressure() {
  const T = cfg.physics.tempC + 273.15;
  manifold.pressurePa = (manifold.n * GAS_R * T) / max(manifold.volume_m3, 1e-9);
}

function bindUI() {
  const pair = (idRange, idNum, setter) => {
    const r = document.getElementById(idRange);
    const n = document.getElementById(idNum);
    const sync = (val) => { r.value = val; n.value = val; setter(parseFloat(val)); };
    if (!r || !n) return;
    r.addEventListener('input', () => sync(r.value));
    n.addEventListener('change', () => sync(n.value));
    sync(r.value);
  };

  pair('scalePxPerM', 'scalePxPerM_num', (v) => { cfg.scalePxPerM = v; updatePipeGeometry(); });
  pair('pipeIDmm', 'pipeIDmm_num', (v) => { cfg.physics.pipeID_mm = v; updatePipeGeometry(); if (pipe) pipe.initGas(); });
  pair('waterline', 'waterline_num', (v) => cfg.waterlinePercent = v);
  pair('amp1', 'amp1_num', (v) => cfg.wave.A1 = v);
  pair('amp2', 'amp2_num', (v) => cfg.wave.A2 = v);
  pair('lambda1', 'lambda1_num', (v) => cfg.wave.lambda1Factor = v);
  pair('lambda2', 'lambda2_num', (v) => cfg.wave.lambda2Factor = v);
  pair('speed1', 'speed1_num', (v) => cfg.wave.speed1 = v);
  pair('speed2', 'speed2_num', (v) => cfg.wave.speed2 = v);

  pair('manifoldVolL', 'manifoldVolL_num', (v) => { cfg.physics.manifoldVolL = v; initManifold(); });
  pair('tempC', 'tempC_num', (v) => cfg.physics.tempC = v);
  pair('ambientAtm', 'ambientAtm_num', (v) => { cfg.physics.ambientAtm = v; initManifold(); if (pipe) pipe.initGas(); });
  pair('rhoWater', 'rhoWater_num', (v) => cfg.physics.rhoWater = v);
  pair('buoyK', 'buoyK_num', (v) => cfg.physics.buoyK_mps2_per_m = v);
  pair('buoyK', 'buoyK_num', (v) => cfg.physics.buoyK_mps2_per_m = v);
  pair('pistonK', 'pistonK_num', (v) => cfg.physics.pistonK_mps_per_MPa = v);
  pair('damping', 'damping_num', (v) => cfg.physics.damping = v);
  pair('condOut', 'condOut_num', (v) => cfg.physics.condOut = v);
  pair('condIn', 'condIn_num', (v) => cfg.physics.condIn = v);
  pair('pistonPct', 'pistonPct_num', (v) => { cfg.visual.pistonThicknessPct = v; });

  const reset = document.getElementById('reset');
  const randomize = document.getElementById('randomize');
  if (reset) {
    reset.addEventListener('click', () => {
      cfg.scalePxPerM = 120; document.getElementById('scalePxPerM').value = 120; document.getElementById('scalePxPerM_num').value = 120; updatePipeGeometry();
      cfg.physics.pipeID_mm = 100; document.getElementById('pipeIDmm').value = 100; document.getElementById('pipeIDmm_num').value = 100; updatePipeGeometry(); pipe.initGas();
      cfg.waterlinePercent = 62; document.getElementById('waterline').value = 62; document.getElementById('waterline_num').value = 62;
      cfg.wave.A1 = 22; document.getElementById('amp1').value = 22; document.getElementById('amp1_num').value = 22;
      cfg.wave.A2 = 10; document.getElementById('amp2').value = 10; document.getElementById('amp2_num').value = 10;
      cfg.wave.lambda1Factor = 0.8; document.getElementById('lambda1').value = 0.8; document.getElementById('lambda1_num').value = 0.8;
      cfg.wave.lambda2Factor = 0.5; document.getElementById('lambda2').value = 0.5; document.getElementById('lambda2_num').value = 0.5;
      cfg.wave.speed1 = 1.0; document.getElementById('speed1').value = 1.0; document.getElementById('speed1_num').value = 1.0;
      cfg.wave.speed2 = 1.6; document.getElementById('speed2').value = 1.6; document.getElementById('speed2_num').value = 1.6;
      cfg.physics.manifoldVolL = 20; document.getElementById('manifoldVolL').value = 20; document.getElementById('manifoldVolL_num').value = 20; initManifold();
      cfg.physics.tempC = 20; document.getElementById('tempC').value = 20; document.getElementById('tempC_num').value = 20;
      cfg.physics.ambientAtm = 1.0; document.getElementById('ambientAtm').value = 1.0; document.getElementById('ambientAtm_num').value = 1.0; initManifold(); pipe.initGas();
      cfg.physics.rhoWater = 1000; document.getElementById('rhoWater').value = 1000; document.getElementById('rhoWater_num').value = 1000;
      cfg.physics.buoyK_mps2_per_m = 3.0; document.getElementById('buoyK').value = 3.0; document.getElementById('buoyK_num').value = 3.0;
      cfg.physics.pistonK_mps_per_MPa = 0.20; document.getElementById('pistonK').value = 0.20; document.getElementById('pistonK_num').value = 0.20;
      cfg.physics.damping = 0.8; document.getElementById('damping').value = 0.8; document.getElementById('damping_num').value = 0.8;
      cfg.physics.condOut = 2.0; document.getElementById('condOut').value = 2.0; document.getElementById('condOut_num').value = 2.0;
      cfg.physics.condIn = 2.0; document.getElementById('condIn').value = 2.0; document.getElementById('condIn_num').value = 2.0;
      cfg.visual.pistonThicknessPct = 50; document.getElementById('pistonPct').value = 50; document.getElementById('pistonPct_num').value = 50;
    });
  }
  if (randomize) {
    randomize.addEventListener('click', () => {
      const r = (a,b,s=1)=> Math.round((a + Math.random()*(b-a))*s)/s;
      cfg.wave.A1 = r(10, 40); document.getElementById('amp1').value = cfg.wave.A1; document.getElementById('amp1_num').value = cfg.wave.A1;
      cfg.wave.A2 = r(5, 25); document.getElementById('amp2').value = cfg.wave.A2; document.getElementById('amp2_num').value = cfg.wave.A2;
      cfg.wave.lambda1Factor = r(0.5, 2.0, 10); document.getElementById('lambda1').value = cfg.wave.lambda1Factor; document.getElementById('lambda1_num').value = cfg.wave.lambda1Factor;
      cfg.wave.lambda2Factor = r(0.3, 1.3, 10); document.getElementById('lambda2').value = cfg.wave.lambda2Factor; document.getElementById('lambda2_num').value = cfg.wave.lambda2Factor;
      cfg.wave.speed1 = r(0.6, 2.2, 100); document.getElementById('speed1').value = cfg.wave.speed1; document.getElementById('speed1_num').value = cfg.wave.speed1;
      cfg.wave.speed2 = r(0.8, 2.6, 100); document.getElementById('speed2').value = cfg.wave.speed2; document.getElementById('speed2_num').value = cfg.wave.speed2;
    });
  }
}

function atmToPa(atm) { return atm * 101325; }
function litersToM3(L) { return L / 1000.0; }

function computePipeWidthPx() {
  const d_m = cfg.physics.pipeID_mm / 1000.0;
  const innerPx = d_m * cfg.scalePxPerM;
  const wall = 6; // simple visual wall thickness
  return max(16, innerPx + wall);
}

function updatePipeGeometry() {
  if (!pipe) return;
  pipe.w = computePipeWidthPx();
}

function clampPct(p) { return constrain(p / 100.0, 0.05, 0.9); }
