let pipes = [];
let waterlineY = 0;
let wavePhase = 0;
let paused = false;

let manifoldY = 72;
// Real-units manifold state
const GAS_R = 8.314; // J/(mol·K)
let manifold = { volume_m3: 0.02, n: 0, pressurePa: 101325 };
let totalPumpedMoles = 0; // cumulative moles delivered to manifold
let instPowerW = 0; // instantaneous power
let avgPowerW = 0;  // EMA of power
let instFlowLpm = 0; // instantaneous pumped flow (L/min)
let avgFlowLpm = 0;  // EMA of pumped flow (L/min)

const cfg = {
  numPipes: 9,      // Will be calculated dynamically
  pipeWidth: 60,    // Visual width
  spacing_m: 0.8,   // Spacing between pipe centers (meters)
  marginRatio: 0.08,
  waterlinePercent: 62,
  physics: {
    scalePxPerM: 100,       // pixels per meter
    pipeID_mm: 50,          // inner diameter in mm (affects physics)
    manifoldVolL: 20,       // manifold volume in liters
    tempC: 20,              // ambient temperature
    ambientAtm: 1.0,        // ambient pressure
    condOut: 2.0,           // valve conductance
    condIn: 2.0,
    manifoldMaxAtm: 5.0     // threshold to auto-empty manifold
  },
  wave: {
    A1: 0.22,
    A2: 0.10,
    lambda1Factor: 0.7, 
    lambda2Factor: 0.4,
    speed1: 1.0,
    speed2: 1.6,
    phaseSpeed: 0.016,
  }
};

function setup() {
  createCanvas(windowWidth - 8, windowHeight - 8);
  bindUI();
  computeLayout();
  buildPipes();
  initManifold();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeLayout();
  buildPipes(); // Rebuild to fit new width
}

function keyPressed() {
  if (keyCode === 32) paused = !paused;
}

function draw() {
  if (!paused) wavePhase += cfg.wave.phaseSpeed;
  background(10);

  drawWater();

  // Update pipe states and gas flows
  for (const p of pipes) p.update();

  // Update manifold pressure based on total moles
  updateManifoldPressure();
  drawManifold();

  for (const p of pipes) p.draw();

  drawHUD();
  drawReadout();
}

function getWaveY(x, phaseOffset = 0) {
  const A1 = cfg.wave.A1;
  const A2 = cfg.wave.A2;
  const k1 = TWO_PI / max(80, width * cfg.wave.lambda1Factor);
  const k2 = TWO_PI / max(60, width * cfg.wave.lambda2Factor);
  const w1 = cfg.wave.speed1;
  const w2 = cfg.wave.speed2;
  const ph = wavePhase + phaseOffset;
  const scale = cfg.physics.scalePxPerM;
  return waterlineY + (A1 * scale) * sin(k1 * x - ph * w1) + (A2 * scale) * sin(k2 * x + ph * w2);
}

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
  strokeWeight(2);
  beginShape();
  for (let x = 0; x <= width; x += step) vertex(x, getWaveY(x));
  endShape();
}

function drawManifold() {
  stroke(180);
  strokeWeight(10);
  line(20, manifoldY, width - 20, manifoldY);

  // Gauge
  const Pamb = atmToPa(cfg.physics.ambientAtm);
  const gX = width - 220;
  const gY = 16;
  const gW = 190;
  const gH = 34;
  noStroke();
  fill(30);
  rect(gX, gY, gW, gH, 6);
  // Color code pressure: Green (low), Yellow (med), Red (high)
  const ratio = manifold.pressurePa / Pamb;
  const displayRatio = constrain((ratio - 1) / 4.0, 0, 1); // Display 1atm to 5atm
  
  const barW = displayRatio * (gW - 6);
  
  if (ratio < 1.5) fill(100, 255, 100);
  else if (ratio < 3.0) fill(255, 210, 60);
  else fill(255, 60, 60);
  
  rect(gX + 3, gY + 3, barW, gH - 6, 4);
  fill(200);
  textAlign(LEFT, CENTER);
  textSize(12);
  const atmVal = manifold.pressurePa / 101325;
  text('P: ' + nf(manifold.pressurePa, 0, 0) + ' Pa (' + nf(atmVal,1,2) + ' atm)', gX, gY + gH + 14);
}

class Pipe {
  constructor(x, w, id_mm) {
    this.x = x;
    this.w = w;
    this.id_mm = id_mm; // Each pipe stores its own physics ID
    this.top = manifoldY + 10;
    this.bottom = ~~(height / 2) - 24;
    this.pistonY = getWaveY(x) - 6;
    this.prevY = this.pistonY;
    this.inOpen = false;
    this.outOpen = false;
    this.n = 0; // moles
    this.pressurePa = atmToPa(cfg.physics.ambientAtm);
    this.initGas();
    this.lastPowerW = 0;
    this.lastOutFlow_m3ps = 0;
    this.lastInFlow_m3ps = 0;
    this.lastPressureAtm = cfg.physics.ambientAtm;
  }

  update(dtOverride) {
    this.top = manifoldY + 10;
    this.bottom = height - 24;

    const target = getWaveY(this.x) - 6;
    
    // IF we are in optimization mode (dtOverride exists), snap directly to physics target
    // IF we are drawing, use lerp for smooth animation
    if (dtOverride !== undefined) {
        this.pistonY = target;
    } else {
        this.pistonY = lerp(this.pistonY, target, 0.2);
    }

    const dy = this.prevY - this.pistonY;
    const up = dy > 0.01;   
    const down = dy < -0.01;
    const dt = (dtOverride !== undefined) ? dtOverride : (deltaTime * 0.001);

    // Physics Update
    const V = this.currentVolumeM3();
    const T = cfg.physics.tempC + 273.15;
    
    // Ideal Gas Law: P = nRT/V
    this.pressurePa = (this.n > 0 && V > 1e-9) ? (this.n * GAS_R * T) / V : atmToPa(cfg.physics.ambientAtm);
    this.lastPressureAtm = this.pressurePa / 101325;

    const Pamb = atmToPa(cfg.physics.ambientAtm);
    const Pman = manifold.pressurePa;
    
    // Valve gating by piston direction, but indicators reflect one-way flow possibility
    const outCanFlow = up && (this.pressurePa > Pman);
    const inCanFlow = down && (atmToPa(cfg.physics.ambientAtm) > this.pressurePa);
    this.outOpen = outCanFlow;
    this.inOpen = inCanFlow;

    // Outlet flow occurs only when out valve is open; use positive ΔP
    let nOut = 0;
    if (outCanFlow) {
      const dp = max(0, this.pressurePa - Pman);
      if (dp > 0) {
        const cond = cfg.physics.condOut;
        nOut = (cond * dp * dt) / (GAS_R * T);
        nOut = constrain(nOut, 0, max(0, this.n));
        this.n -= nOut;
        // Accumulate delivered moles into manifold storage
        manifold.n += nOut;
        totalPumpedMoles += nOut;

        // Power Calculation: Power = ΔP * FlowRate
        const flowRate_m3ps = (nOut / dt) * GAS_R * T / this.pressurePa;
        this.lastPowerW = dp * flowRate_m3ps;
        this.lastOutFlow_m3ps = flowRate_m3ps;
      } else {
        this.lastPowerW = 0;
        this.lastOutFlow_m3ps = 0;
      }
    } else {
      this.lastPowerW = 0;
      this.lastOutFlow_m3ps = 0;
    }

    // Inlet flow occurs only when intake valve is open; use positive ΔP
    let nIn = 0;
    if (inCanFlow) {
      const dp = max(0, Pamb - this.pressurePa);
      if (dp > 0) {
        const cond = cfg.physics.condIn;
        nIn = (cond * dp * dt) / (GAS_R * T);
        this.n += nIn;
        const inFlow_m3ps = (nIn / dt) * GAS_R * T / max(this.pressurePa, 1);
        this.lastInFlow_m3ps = inFlow_m3ps;
      }
    } else {
      this.lastInFlow_m3ps = 0;
    }
    this.prevY = this.pistonY;
  }

  draw() {
    const x0 = this.x - this.w * 0.5;
    const x1 = this.x + this.w * 0.5;

    stroke(160);
    strokeWeight(8);
    line(this.x, manifoldY, this.x, this.top);

    stroke(150);
    strokeWeight(4);
    line(this.x - this.w / 2, this.top, this.x - this.w / 2, this.bottom * 0.8);
    line(this.x + this.w / 2, this.top, this.x + this.w / 2, this.bottom * 0.8);

    noStroke();
    const pistonH = 40;
    fill(220);
    rect(this.x - this.w / 2, this.pistonY - pistonH / 2, this.w, pistonH, 3);

    const valveSize = min(12, this.w * 0.4);
    const outValvY = this.top + 10;
    const inValvY = this.top + 10;

    fill(this.outOpen ? color(255, 200, 0) : color(90));
    ellipse(this.x + this.w/4, outValvY, valveSize);

    fill(this.inOpen ? color(120, 220, 255) : color(70, 110, 150));
    ellipse(this.x - this.w/4, inValvY, valveSize);

    if (this.outOpen) {
      stroke(255, 210, 60);
      strokeWeight(3);
      line(this.x, this.top - 8, this.x + this.w/2, manifoldY);
    }
  }

  initGas() {
    const V = this.currentVolumeM3();
    const T = cfg.physics.tempC + 273.15;
    const Pamb = atmToPa(cfg.physics.ambientAtm);
    this.n = (Pamb * V) / (GAS_R * T);
    this.pressurePa = Pamb;
  }

  currentVolumeM3() {
    const scale = cfg.physics.scalePxPerM;
    const h_m = max(0, (this.pistonY - this.top) / scale);
    const d_m = this.id_mm / 1000.0; // Use local pipe ID
    const area = Math.PI * (d_m * 0.5) * (d_m * 0.5);
    return area * h_m;
  }
}

function drawHUD() {
  noStroke();
  fill(255, 255, 255, 40);
  textAlign(LEFT, TOP);
  textSize(13);
  text('Space: Pause / Resume', 18, height - 28);
}

function computeLayout() {
  waterlineY = height * (cfg.waterlinePercent / 100);
  manifoldY = 72;
}

// Rebuilds pipes array completely based on current Spacing and Width
function buildPipes() {
  pipes = [];
  const margin = width * cfg.marginRatio;
  const availableW = width - margin * 2;
  const widthPx = computePipeVisualWidthPx(cfg.physics.pipeID_mm, cfg.physics.scalePxPerM);
  
  // Calculate how many pipes fit with current spacing
  // Ensure spacing is at least pipeWidth + padding
  const safeSpacingPx = max(cfg.spacing_m * cfg.physics.scalePxPerM, widthPx + 10);
  const count = floor(availableW / safeSpacingPx);
  
  // Center the block of pipes
  const totalSpan = (count - 1) * safeSpacingPx;
  const startX = (width - totalSpan) / 2;

  for (let i = 0; i < count; i++) {
    const x = startX + i * safeSpacingPx;
    pipes.push(new Pipe(x, widthPx, cfg.physics.pipeID_mm));
  }
  
  // Update global to reflect actual count
  cfg.numPipes = count;
  
  // Update UI if it exists
  const el = document.getElementById('numPipesDisplay');
  if(el) el.innerText = count;
}

function bindUI() {
  const byId = (id) => document.getElementById(id);
  
  // Visual Params
  const pipeSpacingEl = byId('pipeSpacing');
  const waterlineEl = byId('waterline');
  
  // Wave Params
  const amp1El = byId('amp1');
  const amp2El = byId('amp2');
  const lambda1El = byId('lambda1');
  const lambda2El = byId('lambda2');
  const speed1El = byId('speed1');
  const speed2El = byId('speed2');
  
  const resetBtn = byId('reset');
  const randomBtn = byId('randomize');
  
  // Physics Params
  const idEl = byId('pipeIDmm');
  const volEl = byId('manifoldVolL');
  const ambEl = byId('ambientAtm');
  
  // Optimization Params
  const runOptBtn = byId('runOpt');

  if (!pipeSpacingEl) return; 

  const rebuild = () => { computeLayout(); buildPipes(); initManifold(); };

  pipeSpacingEl.addEventListener('input', () => {
    cfg.spacing_m = float(pipeSpacingEl.value);
    rebuild();
  });
  
  waterlineEl.addEventListener('input', () => {
    cfg.waterlinePercent = int(waterlineEl.value);
    computeLayout();
  });

  amp1El.addEventListener('input', () => { cfg.wave.A1 = float(amp1El.value); });
  amp2El.addEventListener('input', () => { cfg.wave.A2 = float(amp2El.value); });
  lambda1El.addEventListener('input', () => { cfg.wave.lambda1Factor = float(lambda1El.value); });
  lambda2El.addEventListener('input', () => { cfg.wave.lambda2Factor = float(lambda2El.value); });
  speed1El.addEventListener('input', () => { cfg.wave.speed1 = float(speed1El.value); });
  speed2El.addEventListener('input', () => { cfg.wave.speed2 = float(speed2El.value); });

  idEl.addEventListener('input', () => { 
      cfg.physics.pipeID_mm = float(idEl.value); 
      // Update existing pipes without rebuilding positions
      const newW = computePipeVisualWidthPx(cfg.physics.pipeID_mm, cfg.physics.scalePxPerM);
      for(let p of pipes) { p.id_mm = cfg.physics.pipeID_mm; p.w = newW; p.initGas(); }
  });
  
  volEl.addEventListener('input', () => { cfg.physics.manifoldVolL = float(volEl.value); initManifold(); });
  ambEl.addEventListener('input', () => { cfg.physics.ambientAtm = float(ambEl.value); initManifold(); for (const p of pipes) p.initGas(); });

  resetBtn.addEventListener('click', () => {
    cfg.spacing_m = 0.8; pipeSpacingEl.value = 0.8;
    cfg.wave.A1 = 0.22; amp1El.value = 0.22;
    cfg.wave.A2 = 0.10; amp2El.value = 0.10;
    cfg.physics.pipeID_mm = 50; idEl.value = 50;
    rebuild();
  });

  randomBtn.addEventListener('click', () => {
    cfg.wave.A1 = round(random(0.05, 0.6), 2); amp1El.value = cfg.wave.A1;
    cfg.wave.A2 = round(random(0.03, 0.4), 2); amp2El.value = cfg.wave.A2;
    cfg.wave.lambda1Factor = round(random(0.5, 2.0), 1); lambda1El.value = cfg.wave.lambda1Factor;
    cfg.wave.lambda2Factor = round(random(0.3, 1.2), 1); lambda2El.value = cfg.wave.lambda2Factor;
    cfg.wave.speed1 = round(random(0.4, 2.2), 2); speed1El.value = cfg.wave.speed1;
    cfg.wave.speed2 = round(random(0.6, 2.6), 2); speed2El.value = cfg.wave.speed2;
  });

  if (runOptBtn) {
    runOptBtn.addEventListener('click', () => {
      runOptBtn.disabled = true;
      runOptBtn.innerText = "Running...";
      
      // Allow UI to update before freezing for calculation
      setTimeout(() => {
          const params = {
            idMin: float(byId('optIdMin').value),
            idMax: float(byId('optIdMax').value),
            spacingMin: float(byId('optSpMin').value),
            spacingMax: float(byId('optSpMax').value),
            scenarios: int(byId('optScenarios').value),
            seconds: int(byId('optSeconds').value)
          };
          runOptimization(params);
          runOptBtn.disabled = false;
          runOptBtn.innerText = "Run Optimization";
      }, 50);
    });
  }

  // Hamburger toggle
  const toggleBtn = byId('toggleUI');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const ui = byId('ui');
      if (!ui) return;
      const isHidden = ui.style.display === 'none';
      ui.style.display = isHidden ? 'grid' : 'none';
    });
  }
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
  const V = max(manifold.volume_m3, 1e-9);
  manifold.pressurePa = (manifold.n * GAS_R * T) / V;
  // Auto-empty when "full": if exceeds max atm threshold, vent to ambient
  const Pamb = atmToPa(cfg.physics.ambientAtm);
  const maxPa = Pamb * (cfg.physics.manifoldMaxAtm || 5.0);
  if (manifold.pressurePa > maxPa) {
    // Reset manifold moles to ambient
    manifold.n = (Pamb * V) / (GAS_R * T);
    manifold.pressurePa = Pamb;
  }
}

function drawReadout() {
  const read = document.getElementById('readout');
  if (!read) return;
  const Pamb = atmToPa(cfg.physics.ambientAtm);
  const atm = manifold.pressurePa / 101325;
  const T = cfg.physics.tempC + 273.15;
  const pumped_m3 = (totalPumpedMoles * GAS_R * T) / Pamb;
  const pumped_L = pumped_m3 * 1000.0;
  
  // Power smoothing
  instPowerW = 0;
  for (const p of pipes) instPowerW += p.lastPowerW || 0;
  const a = 0.05; 
  avgPowerW = avgPowerW * (1 - a) + instPowerW * a;

  // Flow (L/min): sum of outlet volumetric flow across pipes
  instFlowLpm = 0;
  for (const p of pipes) instFlowLpm += (p.lastOutFlow_m3ps || 0) * 1000 * 60;
  avgFlowLpm = avgFlowLpm * (1 - a) + instFlowLpm * a;

  // Per-pipe compact readout
  let perPipe = '';
  for (let i = 0; i < pipes.length; i++) {
    const p = pipes[i];
    const pAtm = p.lastPressureAtm || (p.pressurePa / 101325);
    const outLpm = (p.lastOutFlow_m3ps || 0) * 1000 * 60;
    perPipe += `<div>#${i+1}: P ${nf(pAtm,1,2)} atm · Out ${nf(outLpm,1,1)} L/m</div>`;
  }
  // Total pipe volumes and gas equivalent at ambient
  let totalPipeVol_m3 = 0;
  let totalPipeMoles = 0;
  for (const p of pipes) { totalPipeVol_m3 += p.currentVolumeM3(); totalPipeMoles += p.n; }
  const totalPipeVol_L = totalPipeVol_m3 * 1000;
  const totalPipeEqAmb_m3 = (totalPipeMoles * GAS_R * T) / Pamb;
  const totalPipeEqAmb_L = totalPipeEqAmb_m3 * 1000;
  
  read.innerHTML = `<div style="display:flex; justify-content:space-between"><span>Manifold: ${nf(atm,1,2)} atm</span> <span>Active Pipes: ${cfg.numPipes}</span></div>`+
                   `<div>Total Pumped: ${nf(pumped_L,1,1)} L (to manifold)</div>`+
                   `<div>Pipes Volume: ${nf(totalPipeVol_L,1,1)} L (geom)</div>`+
                   `<div>Pipes Gas @amb: ${nf(totalPipeEqAmb_L,1,1)} L</div>`+
                   `<div>Current Flow: ${nf(instFlowLpm,1,1)} L/m</div>`+
                   `<div>Avg Flow: ${nf(avgFlowLpm,1,1)} L/m</div>`+
                   `<div>Avg Power: ${nf(avgPowerW,1,1)} W</div>`+
                   `<div style="margin-top:6px; color:#93c5fd">Per Pipe:</div>`+
                   perPipe;

  const pipePanel = document.getElementById('pipePressuresPanel');
  if (pipePanel) pipePanel.innerHTML = perPipe;
}

function atmToPa(atm) { return atm * 101325; }
function litersToM3(L) { return L / 1000.0; }

// Compute visual pipe width in pixels from inner diameter and scale
function computePipeVisualWidthPx(id_mm, scalePxPerM) {
  const px = (id_mm / 1000.0) * scalePxPerM;
  return constrain(px, 12, 100);
}

// --- Optimization Logic ---

function runOptimization({ idMin, idMax, spacingMin, spacingMax, scenarios, seconds }) {
  let best = { score: -Infinity, pipeID_mm: 50, spacing: 0.8 };
  
  // Save current state to restore later
    const savedState = { 
      spacing_m: cfg.spacing_m, 
      id: cfg.physics.pipeID_mm,
      wave: {...cfg.wave}
  };

  const stepSize = 5; // grid resolution
  const stepsID = 5;
  const stepsSp = 5;
  
  const idStepVal = (idMax - idMin) / stepsID;
  const spStepVal = (spacingMax - spacingMin) / stepsSp;

  let results = [];

  for (let i = 0; i <= stepsID; i++) {
    const testID = idMin + i * idStepVal;
    
    for (let j = 0; j <= stepsSp; j++) {
      const testSpacing = spacingMin + j * spStepVal;
      
      let scenarioScoreSum = 0;
      
      for (let s = 0; s < scenarios; s++) {
        // Randomize wave slightly for robustness (meters)
        cfg.wave.A1 = round(random(0.15, 0.30), 2);
        cfg.wave.speed1 = random(0.8, 1.2);
        
        // --- SETUP SCENARIO ---
        cfg.spacing_m = testSpacing;
        // Visual width derives from physics ID and scale; do not override
        cfg.physics.pipeID_mm = testID;
        
        // IMPORTANT: Rebuild pipes to change the NUMBER of pipes
        buildPipes(); 
        initManifold(); // Reset manifold pressure to ambient
        
        // Reset pipe stats
        totalPumpedMoles = 0;
        
        // --- SIMULATE ---
        const dt = 1/60; 
        const totalTicks = seconds * 60;
        
        let runPowerSum = 0;
        
        for (let t = 0; t < totalTicks; t++) {
            wavePhase += cfg.wave.phaseSpeed * dt * 60; 
            
            let tickPower = 0;
            for (const p of pipes) {
                p.update(dt); // Physics update
                tickPower += p.lastPowerW;
            }
            runPowerSum += tickPower;
            updateManifoldPressure();
        }
        
        scenarioScoreSum += (runPowerSum / totalTicks); // Avg Watts for this scenario
      }
      
      const avgScore = scenarioScoreSum / scenarios;
      results.push({ id: testID, sp: testSpacing, score: avgScore });
      
      if (avgScore > best.score) {
        best = { score: avgScore, pipeID_mm: testID, spacing: testSpacing };
      }
    }
  }

  // Restore State
  Object.assign(cfg.wave, savedState.wave);
  
  // Apply Best Found
  cfg.spacing_m = best.spacing;
  cfg.physics.pipeID_mm = best.pipeID_mm;
  
  // Re-run setup
  document.getElementById('pipeSpacing').value = float(best.spacing);
  document.getElementById('pipeIDmm').value = int(best.pipeID_mm);
  
  buildPipes();
  initManifold();

  const panel = document.getElementById('optResult');
  if (panel) {
    panel.innerHTML = `<strong>Best Config Found:</strong><br>
    Pipe ID: ${nf(best.pipeID_mm,1,1)} mm<br>
    Spacing: ${nf(best.spacing,1,2)} m<br>
    Avg Power: ${nf(best.score,1,1)} W`;
  }
}